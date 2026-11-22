"""
STEP 5 — AHP SUITABILITY SCORING
===================================
WHAT THIS DOES: combines your site metrics into one suitability score per
site using AHP (Analytic Hierarchy Process) — a formal method for turning
"I think yield matters more than stability" into actual numeric weights,
plus a check that your judgments are internally consistent.

LEARNING NOTE — why not just pick weights by hand (e.g. yield=0.5,
stability=0.3, infra=0.2)? You CAN, and it would work. AHP is a slightly
more rigorous way to get there: instead of guessing percentages directly
(hard to do consistently across many criteria), you make simple pairwise
comparisons ("yield vs stability: how much more important?") and AHP does
the math to turn those into weights AND tells you if your comparisons
contradict each other (the Consistency Ratio).
"""

import pandas as pd
import numpy as np

site_table = pd.read_csv("site_metrics_table.csv")

# ---------------------------------------------------------------------------
# 1. Define criteria and whether higher is better
# ---------------------------------------------------------------------------
CRITERIA = ["mean_daily_yield_kwh", "variability_cv", "seasonal_stability"]
HIGHER_IS_BETTER = {"mean_daily_yield_kwh": True, "variability_cv": False, "seasonal_stability": True}

# ---------------------------------------------------------------------------
# 2. AHP pairwise comparison matrix (Saaty 1-9 scale)
# ---------------------------------------------------------------------------
# Rows/cols order: [yield, variability, seasonal_stability]
# Example judgment: yield is "moderately more important" (3) than variability,
# and "moderately more important" (3) than seasonal stability;
# variability and seasonal stability are considered equally important (1).
# CHANGE THESE NUMBERS to reflect what YOU think matters more.
pairwise = np.array([
    [1,   3,   3],
    [1/3, 1,   1],
    [1/3, 1,   1],
])

def ahp_weights(matrix):
    # Normalize each column, then average across rows -> weight vector
    col_sums = matrix.sum(axis=0)
    normalized = matrix / col_sums
    weights = normalized.mean(axis=1)
    return weights

def consistency_ratio(matrix, weights):
    # Standard AHP consistency check
    n = matrix.shape[0]
    weighted_sum = matrix @ weights
    lambda_max = (weighted_sum / weights).mean()
    ci = (lambda_max - n) / (n - 1)
    random_index = {1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12}.get(n, 1.12)
    cr = ci / random_index if random_index > 0 else 0
    return cr

weights = ahp_weights(pairwise)
cr = consistency_ratio(pairwise, weights)
print("AHP weights:", dict(zip(CRITERIA, weights.round(3))))
print(f"Consistency Ratio: {cr:.3f} ({'OK, below 0.1' if cr < 0.1 else 'TOO HIGH — revise pairwise matrix'})")

# ---------------------------------------------------------------------------
# 3. Min-max normalize criteria, apply weights, hard exclusions
# ---------------------------------------------------------------------------
def normalize(col, higher_is_better):
    c = site_table[col]
    # Use robust bounds so one outlier does not pin many sites at 0 or 100.
    lo, hi = c.quantile(0.05), c.quantile(0.95)
    norm = ((c - lo) / (hi - lo + 1e-9)).clip(0.05, 1.0)
    return (norm if higher_is_better else (1 - norm)).clip(0.05, 1.0)

normalized = pd.DataFrame({c: normalize(c, HIGHER_IS_BETTER[c]) for c in CRITERIA})
site_table["suitability_score"] = (normalized * weights).sum(axis=1) * 100

# Hard exclusion example (plug in real slope data from Step 7.2 if you build it;
# for now this is a placeholder that excludes nothing — flag it as such):
site_table["excluded"] = False

# ---------------------------------------------------------------------------
# 4. Robustness check — Dirichlet-perturbed weights, N trials
# ---------------------------------------------------------------------------
N_TRIALS = 200
top_k = max(1, len(site_table) // 3)  # "top third" counts as top_k
rank_counts = np.zeros(len(site_table))

rng = np.random.default_rng(42)
for _ in range(N_TRIALS):
    perturbed = rng.dirichlet(weights * 10)  # scaled alpha keeps it centered on `weights`
    score = (normalized * perturbed).sum(axis=1)
    top_indices = score.nlargest(top_k).index
    rank_counts[top_indices] += 1

site_table["top_k_freq"] = rank_counts / N_TRIALS

site_table = site_table.sort_values("suitability_score", ascending=False)
site_table.to_csv("site_ranking_final.csv", index=False)
print(f"\nSaved site_ranking_final.csv. Top 5 sites:")
print(site_table[["lat", "lon", "suitability_score", "top_k_freq", "regime_label"]].head().to_string(index=False))

# ---------------------------------------------------------------------------
# 5. Save weights + reference min/max — needed by the LIVE "click anywhere"
#    endpoint so a brand-new point gets scored on the SAME scale as these
#    precomputed sites, instead of inventing its own scale from one point.
# ---------------------------------------------------------------------------
import json

weights_dict = dict(zip(CRITERIA, weights.tolist()))
reference_stats = {
    c: {"min": float(site_table[c].quantile(0.05)), "max": float(site_table[c].quantile(0.95))}
    for c in CRITERIA
}

with open("ahp_weights.json", "w") as f:
    json.dump({"weights": weights_dict, "higher_is_better": HIGHER_IS_BETTER}, f, indent=2)
with open("reference_stats.json", "w") as f:
    json.dump(reference_stats, f, indent=2)

# Keep the live API on the same score scale as this complete precomputed grid.
import shutil
from pathlib import Path
api_dir = Path("../solarsite/api")
api_dir.mkdir(parents=True, exist_ok=True)
shutil.copy("ahp_weights.json", api_dir / "ahp_weights.json")
shutil.copy("reference_stats.json", api_dir / "reference_stats.json")

# Keep the live API on the same score scale as this complete precomputed grid.
import shutil
from pathlib import Path
api_dir = Path("../solarsite/api")
api_dir.mkdir(parents=True, exist_ok=True)
shutil.copy("ahp_weights.json", api_dir / "ahp_weights.json")
shutil.copy("reference_stats.json", api_dir / "reference_stats.json")

print("Saved scoring weights and robust reference bounds to the live API folder.")

# NEXT STEP: run 06_precompute_all.py to bundle everything for the app
