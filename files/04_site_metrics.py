"""
STEP 4 — SITE METRICS (yield, variability, seasonality, regimes)
====================================================================
WHAT THIS DOES: for each of your 15-25 sites, computes the numbers that
actually describe "is this a good solar site" — not just one forecast,
but the whole site's track record.

LEARNING NOTE: this step has nothing to do with the forecasting model.
It's pure aggregation over each site's historical data. Keep these two
concerns (forecasting vs. site scoring) mentally separate — they answer
different questions ("what will tomorrow look like" vs "is this a good
site overall").
"""

import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("features_table.csv", parse_dates=["date"])

# ---------------------------------------------------------------------------
# 1. PV yield (first-order PVWatts-style model)
# ---------------------------------------------------------------------------
SYSTEM_AREA_M2 = 1000       # assume a 1000 m^2 panel array per site (documented assumption)
PANEL_EFFICIENCY = 0.20     # 20% — typical modern panel
SYSTEM_LOSSES = 0.86        # wiring, soiling, inverter losses combined

def derate_factor(temp_c):
    # Simple linear derate above 25C cell temperature (~0.4%/degree is typical)
    return np.where(temp_c > 25, 1 - 0.004 * (temp_c - 25), 1.0)

df["daily_yield_kwh"] = (
    df["ALLSKY_SFC_SW_DWN"] * SYSTEM_AREA_M2 * PANEL_EFFICIENCY
    * derate_factor(df["T2M"]) * SYSTEM_LOSSES
)

# ---------------------------------------------------------------------------
# 2. Aggregate per site: mean yield, variability, seasonal stability
# ---------------------------------------------------------------------------
def site_summary(group):
    monthly = group.groupby(group["date"].dt.month)["daily_yield_kwh"].mean()
    return pd.Series({
        "mean_daily_yield_kwh": group["daily_yield_kwh"].mean(),
        "variability_cv": group["daily_yield_kwh"].std() / group["daily_yield_kwh"].mean(),
        # seasonal_stability: ratio of worst month to best month (closer to 1 = more stable)
        "seasonal_stability": monthly.min() / monthly.max() if monthly.max() > 0 else np.nan,
    })

site_table = df.groupby(["lat", "lon"]).apply(site_summary).reset_index()

# ---------------------------------------------------------------------------
# 3. Solar regime clustering (purely descriptive — a legend for the app)
# ---------------------------------------------------------------------------
cluster_features = site_table[["mean_daily_yield_kwh", "variability_cv", "seasonal_stability"]]
scaled = StandardScaler().fit_transform(cluster_features)

k = min(3, len(site_table))  # don't ask for more clusters than sites
kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
site_table["regime_cluster"] = kmeans.fit_predict(scaled)

# Give human-readable labels based on cluster average yield (highest -> "High & Stable" etc.)
cluster_order = site_table.groupby("regime_cluster")["mean_daily_yield_kwh"].mean().sort_values(ascending=False)
label_map = {}
labels_pool = ["High & Stable", "Moderate", "Low Yield"]
for rank, (cluster_id, _) in enumerate(cluster_order.items()):
    label_map[cluster_id] = labels_pool[min(rank, len(labels_pool) - 1)]
site_table["regime_label"] = site_table["regime_cluster"].map(label_map)

site_table.to_csv("site_metrics_table.csv", index=False)
print(f"Saved site_metrics_table.csv with {len(site_table)} sites.")
print(site_table[["lat", "lon", "mean_daily_yield_kwh", "variability_cv",
                   "seasonal_stability", "regime_label"]].to_string(index=False))

# NEXT STEP: run 05_ahp_scoring.py
