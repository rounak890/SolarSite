NASA POWER’s solar data is roughly 1° resolution, so some nearby 100 km points may still share the same irradiance values; the denser map gives more locations to inspect, but it cannot create finer source data

# 1) In Colab, run in this order (each reads the previous step's output file):
python 01_data_collection.py        # -> raw_sites_combined.csv
python 02_feature_engineering.py    # -> features_table.csv
python 03_train_forecast_model.py   # -> forecast_model.joblib, forecast_lower.joblib, forecast_upper.joblib
python 04_site_metrics.py           # -> site_metrics_table.csv
python 05_ahp_scoring.py            # -> site_ranking_final.csv
python 06_precompute_all.py         # -> sites_precomputed.json

# 2) Download sites_precomputed.json + the three .joblib files from Colab,
#    move them into solarsite_project/api/

# 3) Locally:
cd solarsite_project
pip install -r requirements.txt
uvicorn api.main:app --reload         # backend → http://127.0.0.1:8000/docs
streamlit run app_streamlit.py        # frontend → opens in browser