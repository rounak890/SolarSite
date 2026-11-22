"""
STEP 6 — PRECOMPUTE EVERYTHING FOR THE APP
=============================================
WHAT THIS DOES: this is the glue step. It takes the ranking table (Step 5)
plus a forecast for each site (using the model from Step 3) and writes ONE
JSON file that your FastAPI backend will just read and serve — no live
computation needed when a user clicks something.

LEARNING NOTE — this is the architectural idea to hold onto: everything
expensive (API calls, model training, scoring) happens HERE, once, in
Colab. The live app only ever reads a dictionary. That's why the demo
will feel instant and never depend on an external API being up.
"""

import pandas as pd
import numpy as np
import joblib
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "solarsite"))
from api import pipeline_utils as pu

features = pd.read_csv("features_table.csv", parse_dates=["date"])
ranking = pd.read_csv("site_ranking_final.csv")
model = joblib.load("forecast_model.joblib")
lower_model = joblib.load("forecast_lower.joblib")
upper_model = joblib.load("forecast_upper.joblib")
with open("forecast_interval_offsets.json") as f:
    FORECAST_OFFSETS = json.load(f)

FEATURE_COLS = [
    "T2M", "QV2M", "RH2M", "WS10M", "PRECTOTCORR",
    "clearness_lag1", "clearness_lag2", "clearness_lag3", "clearness_roll7_mean",
    "day_of_year", "lat", "lon",
]

records = []
with open("site_labels.json") as f:
    SITE_LABELS = json.load(f)
with open("../solarsite/api/reference_stats.json") as f:
    REFERENCE_STATS = json.load(f)
with open("../solarsite/api/ahp_weights.json") as f:
    AHP = json.load(f)

included_labels = set()
for _, site in ranking.iterrows():
    lat, lon = site["lat"], site["lon"]
    site_rows = features[(features["lat"] == lat) & (features["lon"] == lon)].sort_values("date")
    if site_rows.empty:
        continue
    label_key = f"{lat:.4f}_{lon:.4f}"
    label = SITE_LABELS.get(label_key, {})
    if label:
        included_labels.add(label_key)
    last_row = site_rows.iloc[[-1]]  # most recent day we have -> forecast "tomorrow" from here
    metrics = pu.compute_site_metrics(site_rows)

    X = last_row[FEATURE_COLS]
    pred = float(np.clip(model.predict(X)[0], 0, 1))
    lower = float(np.clip(lower_model.predict(X)[0] + FORECAST_OFFSETS["lower"], 0, pred))
    upper = float(np.clip(upper_model.predict(X)[0] + FORECAST_OFFSETS["upper"], pred, 1))

    records.append({
        "site_id": f"{lat}_{lon}",
        "site_name": label.get("site_name"),
        "state": label.get("state"),
        "sample_type": "state_anchor" if label else "grid_sample",
        "lat": float(lat),
        "lon": float(lon),
        "suitability_score": round(float(site["suitability_score"]), 1),
        "regime_label": site["regime_label"],
        "mean_daily_yield_kwh": round(float(site["mean_daily_yield_kwh"]), 2),
        "variability_cv": round(float(site["variability_cv"]), 3),
        "seasonal_stability": round(float(site["seasonal_stability"]), 3),
        "peak_monthly_yield_kwh": round(metrics["peak_monthly_yield_kwh"], 2),
        "peak_yield_month": metrics["peak_yield_month"],
        "lowest_monthly_yield_kwh": round(metrics["lowest_monthly_yield_kwh"], 2),
        "lowest_yield_month": metrics["lowest_yield_month"],
        "top_k_freq": round(float(site["top_k_freq"]), 2),
        "excluded": bool(site["excluded"]),
        "forecast_next_day_clearness": round(pred, 3),
        "forecast_interval_80": [round(lower, 3), round(upper, 3)],
        "data_sources": {
            "weather_irradiance": "real (NASA POWER)",
            "context_screening": "on-demand SRTM elevation and OpenStreetMap grid/protected-feature lookup",
        },
    })

# Add reproducible city-anchor samples for states and union territories that
# do not yet have a named point. These are comparison points, not parcels.
for label_key, label in SITE_LABELS.items():
    if label_key in included_labels:
        continue
    lat, lon = map(float, label_key.split("_"))
    raw = pu.fetch_power_point(lat, lon, days_back=400)
    cleaned = pu.clean(raw)
    featured = pu.build_features(cleaned)
    metrics = pu.compute_site_metrics(cleaned)
    last_row = featured.dropna(subset=FEATURE_COLS).iloc[[-1]]
    if last_row.empty:
        raise ValueError(f"Not enough recent weather data for state anchor {label['site_name']}")

    X = last_row[FEATURE_COLS]
    pred = float(np.clip(model.predict(X)[0], 0, 1))
    lower = float(np.clip(lower_model.predict(X)[0] + FORECAST_OFFSETS["lower"], 0, pred))
    upper = float(np.clip(upper_model.predict(X)[0] + FORECAST_OFFSETS["upper"], pred, 1))
    score = pu.score_against_reference(
        metrics, REFERENCE_STATS, AHP["weights"], AHP["higher_is_better"]
    )
    records.append({
        "site_id": f"{lat}_{lon}",
        "site_name": label["site_name"],
        "state": label["state"],
        "sample_type": "state_anchor",
        "lat": lat,
        "lon": lon,
        "suitability_score": score,
        "regime_label": "Indicative weather score",
        "mean_daily_yield_kwh": round(metrics["mean_daily_yield_kwh"], 2),
        "variability_cv": round(metrics["variability_cv"], 3),
        "seasonal_stability": round(metrics["seasonal_stability"], 3),
        "peak_monthly_yield_kwh": round(metrics["peak_monthly_yield_kwh"], 2),
        "peak_yield_month": metrics["peak_yield_month"],
        "lowest_monthly_yield_kwh": round(metrics["lowest_monthly_yield_kwh"], 2),
        "lowest_yield_month": metrics["lowest_yield_month"],
        "top_k_freq": None,
        "excluded": False,
        "forecast_next_day_clearness": round(pred, 3),
        "forecast_interval_80": [round(lower, 3), round(upper, 3)],
        "data_sources": {
            "weather_irradiance": "NASA POWER daily data · 400-day city-anchor sample",
            "score_basis": "weather metrics compared with the existing reference grid",
            "limitation": "City anchor for regional comparison; not representative of a parcel or entire state",
        },
    })

with open("sites_precomputed.json", "w") as f:
    json.dump(records, f, indent=2)

# The FastAPI app serves this generated file directly.
import shutil
api_sites_path = Path("../solarsite/api/sites_precomputed.json")
api_sites_path.parent.mkdir(parents=True, exist_ok=True)
shutil.copy("sites_precomputed.json", api_sites_path)

print(f"Saved sites_precomputed.json with {len(records)} sites.")
print("Updated the live API's sites_precomputed.json.")

# Restart the API after this script so it loads the refreshed site grid.
