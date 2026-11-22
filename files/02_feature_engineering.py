"""
STEP 2 — CLEANING + FEATURE ENGINEERING
=========================================
WHAT THIS DOES: takes raw_sites_combined.csv (from Step 1) and produces a
clean, leakage-safe feature table ready for modeling.

LEARNING NOTE — why "per site" matters: your earlier notebook did linear
interpolation on ONE site's time series. Now you have many sites stacked
in one file. If you interpolate the whole file at once, pandas could fill
a gap in site A's data using site B's values — nonsense. We always
`groupby(['lat','lon'])` before any time-based operation.

LEARNING NOTE — why we predict clearness_index, not raw irradiance:
raw irradiance has a big predictable seasonal swing (summer vs winter).
If you predict raw irradiance, the model can "cheat" by just learning the
calendar. clearness_index = actual irradiance / theoretical max irradiance
for that day and latitude — it removes the seasonal cycle, so the model is
forced to learn the actual weather-driven variation. That's the genuinely
hard, genuinely useful prediction.
"""

import pandas as pd
import numpy as np

df = pd.read_csv("raw_sites_combined.csv", parse_dates=["date"])
df = df.sort_values(["lat", "lon", "date"])

# ---------------------------------------------------------------------------
# 1. Clean: linear interpolation PER SITE (same technique you used before)
# ---------------------------------------------------------------------------
value_cols = [c for c in df.columns if c not in ["date", "lat", "lon"]]

def clean_site(group):
    group = group.copy()
    group[value_cols] = group[value_cols].mask(group[value_cols] <= -900)
    if "ALLSKY_SFC_SW_DWN" in group:
        group.loc[group["ALLSKY_SFC_SW_DWN"] < 0, "ALLSKY_SFC_SW_DWN"] = np.nan
    group = group.set_index("date")
    group[value_cols] = group[value_cols].interpolate(method="linear")
    group[value_cols] = group[value_cols].ffill().bfill()
    return group.reset_index()

df = df.groupby(["lat", "lon"], group_keys=False).apply(clean_site)
assert df[value_cols].isnull().sum().sum() == 0, "still have missing values!"
print("Cleaning done. Nulls remaining:", df[value_cols].isnull().sum().sum())

# ---------------------------------------------------------------------------
# 2. Compute clearness_index = actual GHI / theoretical top-of-atmosphere GHI
# ---------------------------------------------------------------------------
# Simplified TOA irradiance formula based on day-of-year and latitude.
# This is the standard solar-geometry approximation used in solar energy work.

def toa_irradiance(day_of_year, lat_deg):
    lat_rad = np.radians(lat_deg)
    decl = np.radians(23.45) * np.sin(np.radians(360 / 365 * (day_of_year - 81)))
    solar_constant = 1.367  # kW/m^2
    # Average daily extraterrestrial irradiance approximation
    cos_zenith_avg = np.sin(lat_rad) * np.sin(decl) + np.cos(lat_rad) * np.cos(decl)
    cos_zenith_avg = np.clip(cos_zenith_avg, 0.05, 1.0)  # avoid negative/zero
    return solar_constant * cos_zenith_avg * 24 / np.pi  # rough kWh/m^2/day scale

df["day_of_year"] = df["date"].dt.dayofyear
df["toa_irradiance"] = toa_irradiance(df["day_of_year"], df["lat"])
df["clearness_index"] = (df["ALLSKY_SFC_SW_DWN"] / df["toa_irradiance"]).clip(0, 1)

# ---------------------------------------------------------------------------
# 3. Leakage-safe lag/rolling features — PER SITE, using only past values
# ---------------------------------------------------------------------------
def add_lag_features(group):
    group = group.sort_values("date")
    for lag in [1, 2, 3, 7]:
        group[f"clearness_lag{lag}"] = group["clearness_index"].shift(lag)
    group["clearness_roll7_mean"] = group["clearness_index"].shift(1).rolling(7).mean()
    # TARGET: tomorrow's clearness index
    group["target_next_day_clearness"] = group["clearness_index"].shift(-1)
    return group

df = df.groupby(["lat", "lon"], group_keys=False).apply(add_lag_features)

# ---------------------------------------------------------------------------
# 4. Final feature set — your 5 validated weather features + the above
# ---------------------------------------------------------------------------
FEATURE_COLS = [
    "T2M", "QV2M", "RH2M", "WS10M", "PRECTOTCORR",   # your validated features
    "clearness_lag1", "clearness_lag2", "clearness_lag3", "clearness_roll7_mean",
    "day_of_year", "lat", "lon",
]
TARGET_COL = "target_next_day_clearness"

model_df = df.dropna(subset=FEATURE_COLS + [TARGET_COL]).reset_index(drop=True)

# LEAKAGE GUARD (sanity check, keep this habit): none of FEATURE_COLS should
# be a same-day or future irradiance-derived column.
forbidden = {"ALLSKY_SFC_SW_DWN", "CLRSKY_SFC_SW_DWN", "ALLSKY_KT",
             "clearness_index", "target_next_day_clearness"}
assert forbidden.isdisjoint(FEATURE_COLS), "LEAKAGE: a forbidden column is in FEATURE_COLS!"
print("Leakage check passed.")

model_df.to_csv("features_table.csv", index=False)
print(f"Saved features_table.csv with {len(model_df)} rows, "
      f"{model_df[['lat','lon']].drop_duplicates().shape[0]} sites.")

# NEXT STEP: run 03_train_forecast_model.py
