"""
SHARED PIPELINE LOGIC
========================
WHY THIS FILE EXISTS: the "click anywhere" feature needs to turn a raw
NASA POWER response into the exact same feature columns your model was
trained on. If that logic lives in two places (Colab scripts + API), they
WILL drift apart and the live predictions will quietly stop matching the
training data. So this is the one place both sides import from.
"""

import requests
import pandas as pd
import numpy as np
from datetime import date, timedelta
from calendar import month_name
from threading import Lock
import time
import math
from urllib.parse import quote

POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMETERS = [
    "ALLSKY_SFC_SW_DWN", "T2M", "QV2M", "RH2M", "WS10M", "PRECTOTCORR",
]

# Must match the FEATURE_COLS your model was trained on in 03_train_forecast_model.py
FEATURE_COLS = [
    "T2M", "QV2M", "RH2M", "WS10M", "PRECTOTCORR",
    "clearness_lag1", "clearness_lag2", "clearness_lag3", "clearness_roll7_mean",
    "day_of_year", "lat", "lon",
]

# Rough India bounding box — reject clicks outside it rather than silently
# returning nonsense for, say, a point in the ocean.
INDIA_BOUNDS = {"lat_min": 6.0, "lat_max": 37.5, "lon_min": 68.0, "lon_max": 97.5}
_LOCATION_CACHE = {}
_LOCATION_LOCK = Lock()
_LAST_LOCATION_REQUEST = 0.0
_CONTEXT_CACHE = {}
_CONTEXT_LOCK = Lock()


def is_in_india(lat, lon):
    b = INDIA_BOUNDS
    return b["lat_min"] <= lat <= b["lat_max"] and b["lon_min"] <= lon <= b["lon_max"]


def reverse_geocode(lat, lon):
    """Return a small cached place label for a user-clicked coordinate."""
    global _LAST_LOCATION_REQUEST
    key = (round(lat, 4), round(lon, 4))
    if key in _LOCATION_CACHE:
        return _LOCATION_CACHE[key]

    # Nominatim's public service requires an identifying User-Agent and at
    # most one request per second. This is user-triggered reverse geocoding,
    # not a bulk lookup of the generated site grid.
    with _LOCATION_LOCK:
        if key in _LOCATION_CACHE:
            return _LOCATION_CACHE[key]
        wait = 1.0 - (time.monotonic() - _LAST_LOCATION_REQUEST)
        if wait > 0:
            time.sleep(wait)
        try:
            response = requests.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 14, "addressdetails": 1},
                headers={"User-Agent": "SolarSite/0.1 (reverse geocoding for site analysis)"},
                timeout=5,
            )
        finally:
            _LAST_LOCATION_REQUEST = time.monotonic()
        response.raise_for_status()
        address = response.json().get("address", {})
        location = {
            "area": address.get("neighbourhood") or address.get("suburb") or address.get("quarter") or address.get("hamlet"),
            "city": address.get("city") or address.get("town") or address.get("village") or address.get("municipality") or address.get("county"),
            "state": address.get("state"),
            "country": address.get("country"),
            "country_code": address.get("country_code"),
        }
        _LOCATION_CACHE[key] = location
        return location


def _distance_km(lat1, lon1, lat2, lon2):
    radius_km = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * radius_km * math.asin(math.sqrt(a))


def fetch_site_context(lat, lon):
    """Fetch cached, screening-grade elevation, grid and protected-area signals."""
    key = (round(lat, 3), round(lon, 3))
    if key in _CONTEXT_CACHE:
        return _CONTEXT_CACHE[key]

    elevation = {"value_m": None, "dataset": "SRTM 90m", "status": "unavailable"}
    try:
        response = requests.get(
            "https://api.opentopodata.org/v1/srtm90m",
            params={"locations": f"{lat},{lon}"}, timeout=8,
        )
        response.raise_for_status()
        rows = response.json().get("results", [])
        if rows and rows[0].get("elevation") is not None:
            elevation.update({"value_m": round(float(rows[0]["elevation"]), 1), "status": "available"})
    except Exception:
        pass

    grid = {
        "status": "unavailable", "search_radius_km": 30,
        "substations_found": None, "nearest_substation_km": None,
        "transmission_lines_found": None, "nearest_transmission_line_km": None,
        "source": "OpenStreetMap via Overpass",
    }
    protected = {
        "status": "unknown", "osm_features_within_5km": None,
        "note": "No legal clearance determination. OSM and national protected-area datasets may be incomplete.",
    }
    query = f"""[out:json][timeout:18];
    (
      nwr(around:30000,{lat},{lon})[power=substation];
      way(around:30000,{lat},{lon})[power~\"^(line|minor_line|cable)$\"];
      nwr(around:5000,{lat},{lon})[boundary=protected_area];
      nwr(around:5000,{lat},{lon})[leisure=nature_reserve];
      nwr(around:5000,{lat},{lon})[protect_class];
    ); out center tags 100;"""
    try:
        response = requests.post(
            "https://overpass-api.de/api/interpreter", data={"data": query},
            headers={"User-Agent": "SolarSite/0.1 (site-context screening)"}, timeout=22,
        )
        response.raise_for_status()
        elements = response.json().get("elements", [])

        def coords(element):
            center = element.get("center", {})
            return element.get("lat", center.get("lat")), element.get("lon", center.get("lon"))

        substations, lines, protected_features = [], [], []
        for item in elements:
            tags = item.get("tags", {})
            point = coords(item)
            if point[0] is None or point[1] is None:
                continue
            distance = _distance_km(lat, lon, float(point[0]), float(point[1]))
            if tags.get("power") == "substation":
                substations.append(distance)
            if tags.get("power") in {"line", "minor_line", "cable"}:
                lines.append(distance)
            if tags.get("boundary") == "protected_area" or tags.get("leisure") == "nature_reserve" or tags.get("protect_class"):
                protected_features.append({"distance_km": distance, "name": tags.get("name")})

        grid.update({
            "status": "available",
            "substations_found": len(substations),
            "nearest_substation_km": round(min(substations), 2) if substations else None,
            "transmission_lines_found": len(lines),
            "nearest_transmission_line_km": round(min(lines), 2) if lines else None,
        })
        protected.update({
            "status": "potential_feature_found" if protected_features else "no_osm_feature_found",
            "osm_features_within_5km": len(protected_features),
            "nearby_features": [
                {"name": item["name"], "distance_km": round(item["distance_km"], 2)}
                for item in sorted(protected_features, key=lambda item: item["distance_km"])[:5]
            ],
        })
    except Exception:
        pass

    try:
        place = reverse_geocode(lat, lon)
    except Exception:
        place = {"state": None, "country": None, "country_code": None}
    state = place.get("state")
    country_code = place.get("country_code") or "in"
    policy = {
        "state": state,
        "country": place.get("country"),
        "country_code": country_code,
        "status": "research_checklist_only" if country_code == "in" else "outside_india",
        "checks": [
            "Confirm the current state renewable-energy policy and project eligibility.",
            "Verify land title, land-use conversion, lease rules, and local zoning.",
            "Check grid connectivity, evacuation approvals, and current state regulator charges.",
            "Screen forest, wildlife, wetland, coastal, and other environmental clearances.",
        ],
        "search_url": "https://www.google.com/search?q=" + quote(f"site:gov.in {state or 'India'} solar project policy land conversion open access transmission"),
        "note": "This is a research checklist, not an AI legal opinion or a finding that a rule applies.",
    }
    context = {
        "elevation": elevation,
        "grid_infrastructure": grid,
        "protected_area_screen": protected,
        "policy_research": policy,
        "sources": ["OpenTopoData SRTM 90m", "OpenStreetMap / Overpass", "OpenStreetMap Nominatim"],
    }
    with _CONTEXT_LOCK:
        _CONTEXT_CACHE[key] = context
    return context


def fetch_power_point(lat, lon, days_back=400):
    """Pull the last `days_back` days of data for one point. 400 days gives
    enough history for both the lag features AND a reasonable yearly
    yield/variability estimate."""
    end = date.today()
    start = end - timedelta(days=days_back)
    params = {
        "parameters": ",".join(PARAMETERS),
        "community": "RE",
        "longitude": lon,
        "latitude": lat,
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "format": "JSON",
    }
    resp = requests.get(POWER_URL, params=params, timeout=20)
    resp.raise_for_status()
    data = resp.json()["properties"]["parameter"]
    df = pd.DataFrame(data)
    df.index.name = "date"
    df = df.reset_index()
    df["date"] = pd.to_datetime(df["date"], format="%Y%m%d")
    df["lat"] = lat
    df["lon"] = lon
    return df.sort_values("date").reset_index(drop=True)


def clean(df):
    """Replace NASA POWER missing-value sentinels before filling short gaps."""
    value_cols = [c for c in df.columns if c not in ["date", "lat", "lon"]]
    df = df.copy().sort_values("date").set_index("date")
    df[value_cols] = df[value_cols].apply(pd.to_numeric, errors="coerce")

    # NASA POWER represents unavailable values with -999 (and variants).
    # Irradiance cannot be negative, so reject any negative irradiance too.
    df[value_cols] = df[value_cols].mask(df[value_cols] <= -900)
    if "ALLSKY_SFC_SW_DWN" in df:
        df.loc[df["ALLSKY_SFC_SW_DWN"] < 0, "ALLSKY_SFC_SW_DWN"] = np.nan

    # Reject a broken response instead of silently producing metrics from
    # mostly fabricated/interpolated data. Small edge gaps are filled below.
    missing_fraction = df[value_cols].isna().mean()
    bad_columns = missing_fraction[missing_fraction > 0.20]
    if not bad_columns.empty:
        raise ValueError("NASA POWER returned too much missing data: " + ", ".join(bad_columns.index))

    df[value_cols] = df[value_cols].interpolate(method="linear", limit=7).ffill(limit=7).bfill(limit=7)
    if df[value_cols].isna().any().any():
        raise ValueError("NASA POWER data still has gaps after cleaning")
    return df.reset_index()


def toa_irradiance(day_of_year, lat_deg):
    lat_rad = np.radians(lat_deg)
    decl = np.radians(23.45) * np.sin(np.radians(360 / 365 * (day_of_year - 81)))
    solar_constant = 1.367
    cos_zenith_avg = np.sin(lat_rad) * np.sin(decl) + np.cos(lat_rad) * np.cos(decl)
    cos_zenith_avg = np.clip(cos_zenith_avg, 0.05, 1.0)
    return solar_constant * cos_zenith_avg * 24 / np.pi


def build_features(df):
    df = df.copy()
    df["day_of_year"] = df["date"].dt.dayofyear
    df["toa_irradiance"] = toa_irradiance(df["day_of_year"], df["lat"])
    df["clearness_index"] = (df["ALLSKY_SFC_SW_DWN"] / df["toa_irradiance"]).clip(0, 1)
    for lag in [1, 2, 3, 7]:
        df[f"clearness_lag{lag}"] = df["clearness_index"].shift(lag)
    df["clearness_roll7_mean"] = df["clearness_index"].shift(1).rolling(7).mean()
    return df


def derate_factor(temp_c):
    return np.where(temp_c > 25, 1 - 0.004 * (temp_c - 25), 1.0)


def compute_site_metrics(df, system_area_m2=1000, panel_efficiency=0.20, system_losses=0.86):
    df = df.copy()
    df["daily_yield_kwh"] = (
        df["ALLSKY_SFC_SW_DWN"] * system_area_m2 * panel_efficiency
        * derate_factor(df["T2M"]) * system_losses
    )
    if not np.isfinite(df["daily_yield_kwh"]).all() or (df["daily_yield_kwh"] < 0).any():
        raise ValueError("Cannot calculate site metrics from invalid irradiance data")
    monthly = df.groupby(df["date"].dt.month)["daily_yield_kwh"].mean()
    mean_yield = float(df["daily_yield_kwh"].mean())
    if mean_yield <= 0 or monthly.empty or monthly.max() <= 0:
        raise ValueError("NASA POWER data does not contain usable solar irradiance")
    return {
        "mean_daily_yield_kwh": mean_yield,
        "variability_cv": float(df["daily_yield_kwh"].std() / mean_yield),
        "seasonal_stability": float(monthly.min() / monthly.max()),
        "peak_monthly_yield_kwh": float(monthly.max()),
        "peak_yield_month": month_name[int(monthly.idxmax())],
        "lowest_monthly_yield_kwh": float(monthly.min()),
        "lowest_yield_month": month_name[int(monthly.idxmin())],
    }


def score_against_reference(metrics, reference_stats, weights, higher_is_better):
    """Normalize `metrics` using the min/max captured from the ORIGINAL
    precomputed site grid (reference_stats), so a new ad-hoc point lands on
    the same 0-100 scale as the precomputed sites instead of its own scale."""
    score = 0.0
    for crit, weight in weights.items():
        lo, hi = reference_stats[crit]["min"], reference_stats[crit]["max"]
        val = metrics[crit]
        norm = (val - lo) / (hi - lo + 1e-9)
        norm = float(np.clip(norm, 0, 1))
        if not higher_is_better[crit]:
            norm = 1 - norm
        norm = float(np.clip(norm, 0.05, 1))
        score += norm * weight
    return round(score * 100, 1)
