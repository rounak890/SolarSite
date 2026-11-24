"""
STEP 1 — DATA COLLECTION
=========================
WHAT THIS DOES: calls the NASA POWER API once per site and saves one CSV per
site to disk. Run this ONCE in Colab, download the CSVs, never call the API
again during development — that's what makes the rest of the project fast
and demo-safe (no live dependency on NASA's servers).

LEARNING NOTE: your earlier notebook used the POWER *Data Access Viewer*
(a website) for one point. This script hits the same data programmatically
via the POWER API, for many points in a loop. Same data, same parameters —
just automated.

WHERE THE GRID COMES FROM: we build a simple lat/lon grid over one region.
Rajasthan-Gujarat (NW India) is used below because it's genuinely one of
India's best solar belts (high GHI, flat land) — but change REGION_BOUNDS
to any region you prefer.
"""

import requests
import pandas as pd
import os
import math
import time
import json

# ---------------------------------------------------------------------------
# 1. Define the region as a grid of points
# ---------------------------------------------------------------------------
# Sample the current Rajasthan-Gujarat study area at approximately 100 km.
# The NASA downloads take longer than the old 16-point grid; resume behavior
# below skips sites whose CSV already exists.

REGION_BOUNDS = {
    "lat_min": 22.5, "lat_max": 26.5,   # Rajasthan-Gujarat belt
    "lon_min": 70.5, "lon_max": 74.5,
}
GRID_SPACING_KM = 100

# A few named anchors broaden the first static demo beyond the western grid.
# These are representative locations, not land parcels or a statewide grid.
ADDITIONAL_SITES = [
    (17.6599, 75.9064, "Solapur", "Maharashtra"),
    (19.8762, 75.3433, "Chhatrapati Sambhajinagar", "Maharashtra"),
    (21.1458, 79.0882, "Nagpur", "Maharashtra"),
    (23.2599, 77.4126, "Bhopal", "Madhya Pradesh"),
    (22.7196, 75.8577, "Indore", "Madhya Pradesh"),
    (26.2183, 78.1828, "Gwalior", "Madhya Pradesh"),
    (16.8302, 75.7100, "Vijayapura", "Karnataka"),
    (15.1394, 76.9214, "Ballari", "Karnataka"),
    (14.2251, 76.3980, "Chitradurga", "Karnataka"),
    (17.3850, 78.4867, "Hyderabad", "Telangana"),
    (17.9689, 79.5941, "Warangal", "Telangana"),
    (18.6725, 78.0941, "Nizamabad", "Telangana"),
    (15.8281, 78.0373, "Kurnool", "Andhra Pradesh"),
    (14.4673, 78.8242, "Kadapa", "Andhra Pradesh"),
    (14.4426, 79.9865, "Nellore", "Andhra Pradesh"),
    (9.9252, 78.1198, "Madurai", "Tamil Nadu"),
    (11.0168, 76.9558, "Coimbatore", "Tamil Nadu"),
    (8.7139, 77.7567, "Tirunelveli", "Tamil Nadu"),
]

def build_grid(bounds, spacing_km):
    import numpy as np
    mean_lat = (bounds["lat_min"] + bounds["lat_max"]) / 2
    lat_step = spacing_km / 111.32
    lon_step = spacing_km / (111.32 * math.cos(math.radians(mean_lat)))
    lat_count = math.ceil((bounds["lat_max"] - bounds["lat_min"]) / lat_step) + 1
    lon_count = math.ceil((bounds["lon_max"] - bounds["lon_min"]) / lon_step) + 1
    lats = np.linspace(bounds["lat_min"], bounds["lat_max"], lat_count)
    lons = np.linspace(bounds["lon_min"], bounds["lon_max"], lon_count)
    return [(round(lat, 4), round(lon, 4)) for lat in lats for lon in lons]

WESTERN_GRID = build_grid(REGION_BOUNDS, GRID_SPACING_KM)
SITES = list(dict.fromkeys(WESTERN_GRID + [(lat, lon) for lat, lon, _, _ in ADDITIONAL_SITES]))
try:
    with open("site_labels.json") as f:
        SITE_LABELS = json.load(f)
except FileNotFoundError:
    SITE_LABELS = {}
for lat, lon, city, state in ADDITIONAL_SITES:
    SITE_LABELS[f"{lat:.4f}_{lon:.4f}"] = {"site_name": city, "state": state, "sample_type": "state_anchor"}
with open("site_labels.json", "w") as f:
    json.dump(SITE_LABELS, f, indent=2, ensure_ascii=False)
print(f"Built {len(SITES)} static points: {len(WESTERN_GRID)} western-grid points and {len(ADDITIONAL_SITES)} additional state anchors.")

# ---------------------------------------------------------------------------
# 2. Same parameters you already validated on your Delhi point
# ---------------------------------------------------------------------------
PARAMETERS = [
    "ALLSKY_SFC_SW_DWN", "CLRSKY_SFC_SW_DWN", "ALLSKY_SFC_SW_DNI",
    "ALLSKY_SFC_SW_DIFF", "ALLSKY_KT",
    "T2M", "QV2M", "RH2M", "WS10M", "PRECTOTCORR",
]
START_DATE = "20260101"
END_DATE = "20261022"   # match the window you already used

POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"

def fetch_one_site(lat, lon):
    """Fetch daily data for a single (lat, lon) and return a DataFrame."""
    params = {
        "parameters": ",".join(PARAMETERS),
        "community": "RE",
        "longitude": lon,
        "latitude": lat,
        "start": START_DATE,
        "end": END_DATE,
        "format": "JSON",
    }
    resp = requests.get(POWER_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()["properties"]["parameter"]

    # The JSON comes back as {param: {date_str: value}} — reshape to a table.
    df = pd.DataFrame(data)
    df.index.name = "date"
    df = df.reset_index()
    df["date"] = pd.to_datetime(df["date"], format="%Y%m%d")
    df["lat"] = lat
    df["lon"] = lon
    return df

# ---------------------------------------------------------------------------
# 3. Loop over every site, save each to its own CSV, and be polite to the API
# ---------------------------------------------------------------------------
os.makedirs("raw_sites", exist_ok=True)
all_sites = []
failed_sites = []

for i, (lat, lon) in enumerate(SITES):
    print(f"[{i+1}/{len(SITES)}] fetching {lat}, {lon} ...")
    output_path = f"raw_sites/site_{lat}_{lon}.csv"
    if os.path.exists(output_path):
        print("  already downloaded; skipping")
        all_sites.append(pd.read_csv(output_path, parse_dates=["date"]))
        continue
    try:
        df = fetch_one_site(lat, lon)
        df.to_csv(output_path, index=False)
        all_sites.append(df)
    except Exception as e:
        print(f"  FAILED for {lat},{lon}: {e}")
        failed_sites.append((lat, lon))
    time.sleep(1)  # be polite — avoids rate-limit errors

# ---------------------------------------------------------------------------
# 4. Combine everything into one file — this is what Step 2 reads
# ---------------------------------------------------------------------------
if failed_sites:
    raise SystemExit(
        f"Stopped without replacing raw_sites_combined.csv: {len(failed_sites)} "
        "grid points failed. Re-run after connectivity returns; completed site CSVs will be reused."
    )

combined = pd.concat(all_sites, ignore_index=True)
combined.to_csv("raw_sites_combined.csv", index=False)
print(f"\nDone. {combined[['lat', 'lon']].drop_duplicates().shape[0]} sites fetched, "
      f"{len(combined)} total rows saved to raw_sites_combined.csv")

# NEXT STEP: download raw_sites_combined.csv and move to the data/ folder,
# then run 02_feature_engineering.py
