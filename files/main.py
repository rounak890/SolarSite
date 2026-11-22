"""
FASTAPI BACKEND
=================
WHAT THIS DOES: loads sites_precomputed.json ONCE at startup, and serves it
through a few endpoints. No model inference happens per-request for the
precomputed sites — that's the whole point of Step 6.

LEARNING NOTE: this file should feel almost boring. If your backend code
here is complex, that's usually a sign some computation leaked into the
live path that belongs back in the Colab precompute step.

RUN IT: from the project root,
    pip install fastapi uvicorn
    uvicorn api.main:app --reload
Then open http://127.0.0.1:8000/docs for an interactive API tester.
"""

import json
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SolarSite API")

# Allow your Streamlit/frontend to call this from a different port/origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_PATH = Path(__file__).parent / "sites_precomputed.json"

with open(DATA_PATH) as f:
    SITES = json.load(f)
SITES_BY_ID = {s["site_id"]: s for s in SITES}


@app.get("/sites")
def list_sites():
    """All precomputed sites, for the map and the ranking table."""
    return SITES


@app.get("/sites/{site_id}")
def get_site(site_id: str):
    """Full detail for one site — used by the detail panel."""
    site = SITES_BY_ID.get(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site


@app.get("/sites/{site_id}/forecast")
def get_forecast(site_id: str):
    """Just the forecast portion — kept separate in case you later add
    multi-day forecasts without bloating the main site object."""
    site = SITES_BY_ID.get(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return {
        "site_id": site_id,
        "forecast_next_day_clearness": site["forecast_next_day_clearness"],
        "forecast_interval_80": site["forecast_interval_80"],
    }
