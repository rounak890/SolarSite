"""
STREAMLIT APP — Page 1 (map) + Page 3 (ranking table) in one file to start.
==============================================================================
WHAT THIS DOES: the simplest possible working frontend. Reads the SAME
sites_precomputed.json your API serves (for speed, it reads the file
directly here rather than calling the API — swap to `requests.get(...)` if
you want the app to depend on the running API instead, which is worth doing
once both work, so you're exercising the real client/server split).

RUN IT: streamlit run app_streamlit.py
"""

import streamlit as st
import pandas as pd
import pydeck as pdk
import json

st.set_page_config(page_title="SolarSite", layout="wide")

with open("api/sites_precomputed.json") as f:
    sites = json.load(f)
df = pd.DataFrame(sites)

st.title("☀️ SolarSite — Candidate Site Explorer")

# --- Sidebar: weight sliders (cosmetic for now — wire into live AHP re-score
#     as a stretch goal once the static version works) ---
st.sidebar.header("What matters to you?")
yield_w = st.sidebar.slider("Yield importance", 0, 10, 5)
stability_w = st.sidebar.slider("Stability importance", 0, 10, 5)
st.sidebar.markdown("---")
st.sidebar.subheader("Legend")
for label in df["regime_label"].unique():
    st.sidebar.markdown(f"- {label}")

col_map, col_table = st.columns([2, 1])

with col_map:
    st.subheader("Map")
    layer = pdk.Layer(
        "ScatterplotLayer",
        data=df,
        get_position="[lon, lat]",
        get_radius=8000,
        get_fill_color="[255 - suitability_score*2, suitability_score*2, 50]",
        pickable=True,
    )
    view_state = pdk.ViewState(
        latitude=df["lat"].mean(), longitude=df["lon"].mean(), zoom=5.5
    )
    st.pydeck_chart(pdk.Deck(layers=[layer], initial_view_state=view_state,
                              tooltip={"text": "Score: {suitability_score}\nRegime: {regime_label}"}))

with col_table:
    st.subheader("Ranking")
    st.dataframe(
        df[["site_id", "suitability_score", "regime_label", "top_k_freq"]]
        .sort_values("suitability_score", ascending=False),
        hide_index=True,
        use_container_width=True,
    )

st.markdown("---")
st.subheader("Site detail")
selected_id = st.selectbox("Pick a site to inspect", df["site_id"])
site = df[df["site_id"] == selected_id].iloc[0]

c1, c2, c3 = st.columns(3)
c1.metric("Mean daily yield (kWh)", site["mean_daily_yield_kwh"])
c2.metric("Variability (CV)", site["variability_cv"])
c3.metric("Seasonal stability", site["seasonal_stability"])

st.write(
    f"**Next-day forecast (clearness index):** {site['forecast_next_day_clearness']} "
    f"(80% interval: {site['forecast_interval_80'][0]} – {site['forecast_interval_80'][1]})"
)
st.caption(f"Data sources — weather/irradiance: {site['data_sources']['weather_irradiance']}; "
           f"slope/grid distance: {site['data_sources']['slope_grid_distance']}")
