"""
FASTAPI BACKEND — precomputed sites + live "click anywhere in India" lookup
==============================================================================
TWO KINDS OF ENDPOINT HERE, ON PURPOSE:
  /sites*      -> reads sites_precomputed.json; detail requests optionally look up a place name.
  /analyze     -> slow(er), calls NASA POWER live for a NEW point, runs the
                  same feature + model pipeline, returns a fresh answer.

LEARNING NOTE: keep these mentally separate. /sites is what makes your demo
feel fast and reliable even with no internet in the room. /analyze is the
"wow" feature, but it can fail if NASA POWER is slow/down -- so it has its
own error handling and a simple in-memory cache so the SAME point clicked
twice doesn't refetch.

RUN IT: uvicorn api.main:app --reload
"""

import json
import os
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import joblib
import numpy as np

sys.path.append(str(Path(__file__).parent.parent))  # so we can import common/
from . import pipeline_utils as pu

app = FastAPI(title="SolarSite API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

BASE = Path(__file__).parent

with open(BASE / "sites_precomputed.json") as f:
    SITES = json.load(f)
SITES_BY_ID = {s["site_id"]: s for s in SITES}

with open(BASE / "ahp_weights.json") as f:
    AHP = json.load(f)
with open(BASE / "reference_stats.json") as f:
    REFERENCE_STATS = json.load(f)

model = joblib.load(BASE / "forecast_model.joblib")
lower_model = joblib.load(BASE / "forecast_lower.joblib")
upper_model = joblib.load(BASE / "forecast_upper.joblib")
with open(BASE / "forecast_interval_offsets.json") as f:
    FORECAST_OFFSETS = json.load(f)

# Cache only nearly identical clicks. NASA POWER itself is gridded, so
# different coordinates can still legitimately resolve to the same source cell.
_live_cache = {}


@app.get("/sites")
def list_sites():
    return SITES


@app.get("/sites/{site_id}")
def get_site(site_id: str):
    site = SITES_BY_ID.get(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    result = dict(site)
    try:
        result["location"] = pu.reverse_geocode(site["lat"], site["lon"])
    except Exception:
        result["location"] = {"area": None, "city": None, "state": None}
    return result


@app.get("/sites/{site_id}/forecast")
def get_forecast(site_id: str):
    site = SITES_BY_ID.get(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return {
        "site_id": site_id,
        "forecast_next_day_clearness": site["forecast_next_day_clearness"],
        "forecast_interval_80": site["forecast_interval_80"],
    }


@app.get("/site-context")
def site_context(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """Optional screening layers for a single user-selected point."""
    if not pu.is_in_india(lat, lon):
        raise HTTPException(status_code=400, detail="Point is outside the supported India region")
    return pu.fetch_site_context(lat, lon)


@app.get("/policy-search")
def policy_search(
    state: str = Query(..., min_length=2, max_length=80),
    lat: float = Query(..., ge=6, le=37.5),
    lon: float = Query(..., ge=68, le=97.5),
):
    """Search current web results through Brave, returning official Indian sources only."""
    api_key = os.getenv("BRAVE_SEARCH_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Policy search is not configured. Set BRAVE_SEARCH_API_KEY on the API server.")
    query = f'"{state}" solar policy project land conversion transmission site:gov.in OR site:nic.in'
    try:
        response = pu.requests.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": 12, "country": "IN", "search_lang": "en", "safesearch": "moderate"},
            headers={"X-Subscription-Token": api_key, "Accept": "application/json"},
            timeout=12,
        )
        response.raise_for_status()
        data = response.json()
    except pu.requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else 502
        raise HTTPException(status_code=502, detail=f"Search provider returned HTTP {status}")
    except Exception:
        raise HTTPException(status_code=502, detail="Policy search provider is unavailable right now")

    results = []
    for item in data.get("web", {}).get("results", []):
        url = item.get("url", "")
        from urllib.parse import urlparse
        host = (urlparse(url).hostname or "").lower()
        if not (host.endswith(".gov.in") or host.endswith(".nic.in")):
            continue
        results.append({
            "title": item.get("title") or host,
            "url": url,
            "domain": host,
            "description": item.get("description") or "",
            "published": item.get("page_age") or item.get("published") or None,
        })
        if len(results) == 8:
            break
    return {"state": state, "query": query, "provider": "Brave Search API", "results": results}


@app.get("/analyze")
def analyze_point(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """Live lookup for ANY point the user clicks. Slower than /sites --
    the frontend should show a loading state while this runs."""
    if not pu.is_in_india(lat, lon):
        raise HTTPException(status_code=400, detail="Point is outside the supported India region")

    cache_key = (round(lat, 3), round(lon, 3))
    if cache_key in _live_cache:
        cached = dict(_live_cache[cache_key])
        cached.update({"site_id": f"live_{lat}_{lon}", "lat": lat, "lon": lon})
        return cached

    try:
        raw = pu.fetch_power_point(lat, lon, days_back=400)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NASA POWER lookup failed: {e}")

    try:
        cleaned = pu.clean(raw)
        featured = pu.build_features(cleaned)
        metrics = pu.compute_site_metrics(cleaned)
        score = pu.score_against_reference(
            metrics, REFERENCE_STATS, AHP["weights"], AHP["higher_is_better"]
        )
    except (ValueError, KeyError, ZeroDivisionError) as e:
        raise HTTPException(status_code=502, detail=f"NASA POWER returned unusable data: {e}")

    last_row = featured.dropna(subset=pu.FEATURE_COLS).iloc[[-1]]
    if last_row.empty:
        raise HTTPException(status_code=500, detail="Not enough recent data to forecast this point")

    X = last_row[pu.FEATURE_COLS]
    pred = float(np.clip(model.predict(X)[0], 0, 1))
    lo = float(np.clip(lower_model.predict(X)[0] + FORECAST_OFFSETS["lower"], 0, pred))
    hi = float(np.clip(upper_model.predict(X)[0] + FORECAST_OFFSETS["upper"], pred, 1))
    try:
        location = pu.reverse_geocode(lat, lon)
    except Exception:
        location = {"area": None, "city": None, "state": None}

    result = {
        "site_id": f"live_{lat}_{lon}",
        "lat": lat,
        "lon": lon,
        "suitability_score": score,
        "mean_daily_yield_kwh": round(metrics["mean_daily_yield_kwh"], 2),
        "variability_cv": round(metrics["variability_cv"], 3),
        "seasonal_stability": round(metrics["seasonal_stability"], 3) if metrics["seasonal_stability"] else None,
        "peak_monthly_yield_kwh": round(metrics["peak_monthly_yield_kwh"], 2),
        "peak_yield_month": metrics["peak_yield_month"],
        "lowest_monthly_yield_kwh": round(metrics["lowest_monthly_yield_kwh"], 2),
        "lowest_yield_month": metrics["lowest_yield_month"],
        "forecast_next_day_clearness": round(pred, 3),
        "forecast_interval_80": [round(lo, 3), round(hi, 3)],
        "regime_label": "Indicative weather score",
        "location": location,
        "data_sources": {"weather_irradiance": "NASA POWER daily data", "place_name": "OpenStreetMap Nominatim reverse geocoding", "score_basis": "weather metrics compared with the precomputed reference grid", "limitation": "Does not include parcel, terrain, grid, or permitting analysis"},
    }
    _live_cache[cache_key] = result
    return result
