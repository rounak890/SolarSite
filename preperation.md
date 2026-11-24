SolarSite project guide
1. What the project does
SolarSite is an early-stage solar-site screening tool. It compares solar weather at sampled locations, estimates a few performance metrics, and lets someone click another point on the map for a fresh weather estimate.

It is not a parcel-selection or engineering-feasibility system. The score focuses on weather. It does not establish land ownership, grid capacity, permitting eligibility, or environmental clearance.

A short viva description:
“SolarSite is a web-based solar-resource screening prototype. It combines a precomputed catalogue of Indian reference locations with on-demand analysis for a clicked coordinate. NASA POWER weather data feeds the yield metrics and next-day forecast; a weighted score compares locations. The output is preliminary and needs land, grid, and permitting checks from authoritative sources.”

2. What is static and what is dynamic?
Part	What happens
Map catalogue	The backend loads 84 locations from sites_precomputed.json. Their historical metrics, rankings, and forecasts were prepared in advance. They stay as-is until the data/model pipeline is run again.
Training dataset	The bundled raw training data has 54 sites and daily data from Jan 1 to Oct 22, 2026. The other catalogue locations are added as comparison anchors during precomputation; they are not all separate model-training sites.
Clicking a catalogue marker	The site's main weather metrics and forecast come from the precomputed catalogue. The app also requests fresh local context, such as elevation and mapped grid features.
Clicking an empty map point	The backend fetches recent NASA POWER data for that coordinate, runs the existing feature and model pipeline, and returns an indicative score and forecast. This is dynamic, subject to the external data service being available.
Names and local context	Reverse geocoding, elevation, and OpenStreetMap screening are requested when needed. They can take longer than the weather estimate and can fail independently.
Weight sliders	The browser recalculates displayed rankings and scores from the loaded sites. Moving a slider does not retrain a model.
Cost worksheet	Calculated in the browser from the user's assumptions. It is not based on a live cost database.
Policy panel	Its due-diligence checklist is general guidance. Live policy results need the configured search API; the Google link is a fallback. “Copy agent research prompt” copies text for another AI agent to use—it does not launch an agent from this app.


The static catalog is prepared by the scripts in [01_data_collection.py](/Users/gera/Desktop/DSF-Project/files/01_data_collection.py) through [06_precompute_all.py](/Users/gera/Desktop/DSF-Project/files/06_precompute_all.py). The API reads the prepared site data when it starts.
3. Data sources
- NASA POWER: Daily solar irradiance and weather. The pipeline uses surface solar radiation (ALLSKY_SFC_SW_DWN) and variables such as temperature (T2M), humidity (RH2M, QV2M), wind (WS10M), and precipitation (PRECTOTCORR). Training uses the bundled Jan–Oct 2026 sample; a clicked point requests a recent window from NASA POWER.
- OpenStreetMap Nominatim: Converts coordinates into approximate place labels such as “Udaipur, Tripura.” This is a geographic label, not a parcel boundary or proof of the site's legal location.
- OpenTopoData / SRTM 90m: Provides approximate ground elevation for the local screening panel.
- OpenStreetMap Overpass: Looks for mapped substations, transmission features, and protected-area tags. Missing map features do not mean there are no real-world features.
- Brave Search API: The backend can search government-domain results when BRAVE_SEARCH_API_KEY is configured. It filters results to Indian .gov.in and .nic.in domains. Without the key, the app offers a direct web-search link and a prompt to copy.
- OpenStreetMap tiles: Supplies the map background. ISRO Bhuvan and Protected Planet links are provided for manual follow-up; those sources are not currently incorporated into the score.
4. Machine-learning and scoring methods
These are the methods used in the project:
1. Random Forest regression predicts next-day clearness index. The training script uses 300 trees, maximum depth 12, and seed 42.
2. Linear Regression fallback uses one clearness lag, with no intercept, if the Random Forest fails the script’s persistence comparison.
3. Two Gradient Boosting quantile models estimate the lower and upper forecast range: one for the 10th percentile and one for the 90th percentile.
4. Persistence and day-of-year climatology are comparison baselines. They are simple forecast rules, not trained ML models.
5. K-Means groups sites using yield, variability, and seasonal stability. It is descriptive clustering, not a feasibility classifier.
6. AHP turns pairwise criterion preferences into weights for the site score. AHP is a multi-criteria decision method, not machine learning.
Forecast features
Feature engineering in [02_feature_engineering.py](/Users/gera/Desktop/DSF-Project/files/02_feature_engineering.py) calculates a clearness index:

clearness index = observed surface irradiance ÷ approximate top-of-atmosphere irradiance

It also creates past clearness lags, a seven-day rolling mean, day of year, and location coordinates. Model inputs include five weather variables plus those lag/rolling features and the date/location fields. The next-day clearness index is the target.

Data is sorted and cleaned per location, so interpolation at one site cannot use another site's values. NASA POWER sentinel values such as -999 are treated as missing; gaps are interpolated within each site. The model inputs exclude same-day and future irradiance-derived target columns to reduce leakage.
Validation results and an important caveat
The notebook I created uses a chronological train/calibration/test split and corrects the persistence baseline to compare tomorrow with today's clearness index. On the bundled partial-year data, its test RMSE was:
Predictor	RMSE
Persistence	0.0887
Calibrated lag fallback	0.1082
Random Forest	0.1348


Lower RMSE is better, so persistence was strongest on that test window. The quantile interval covered 68.2% of test targets, below its nominal 80% target.

This is useful to say in a viva: the current dataset is short and only covers part of one year, so it is not strong evidence of long-term forecast performance. Also, the original training script compares persistence using clearness_lag1, which is one day older than the correctly aligned persistence value. It calibrates interval offsets on its holdout, then measures coverage on that same holdout. The notebook separates calibration from final testing and documents the results. It is available at [solar_site_ml_walkthrough.ipynb](/Users/gera/Desktop/DSF-Project/solar_site_ml_walkthrough.ipynb).
5. Frontend and backend
- Frontend: Next.js, React, and TypeScript. The map uses Leaflet / React-Leaflet with OpenStreetMap tiles. UI and API client code lives under [project/components](/Users/gera/Desktop/DSF-Project/project/components) and [project/lib/sites.ts](/Users/gera/Desktop/DSF-Project/project/lib/sites.ts).
- Backend: FastAPI in Python, using pandas and NumPy for data work, scikit-learn for models, and joblib for saved models. The API is in [main.py](/Users/gera/Desktop/DSF-Project/solarsite/api/main.py); shared cleaning, feature, metric, and scoring logic is in [pipeline_utils.py](/Users/gera/Desktop/DSF-Project/solarsite/api/pipeline_utils.py).
- Typical flow: The frontend loads /sites for the catalogue. A marker click loads that site's details. A blank-map click calls /analyze; the backend gets recent NASA POWER observations, builds features, predicts clearness, calculates metrics, and returns the result. A separate /site-context request loads local screening information.
6. What the values in your example mean
SITE-ID: live_23.463894..._91.506163...
This is a generated identifier for a clicked coordinate. It is not a saved project ID or land parcel number. The two numbers are latitude and longitude.
Udaipur, Tripura, India
This is the approximate place name returned from reverse geocoding. The coordinates identify the point; the place name gives nearby administrative context.
WEATHER REFERENCE SCORE 45.8 / 100
This is a relative weather-resource score, not a 45.8% chance of success or a 45.8% panel efficiency. It combines yield, variability, and seasonal stability after normalizing them against the reference sites. The UI's default weights are 60% yield, 20% variability, and 20% seasonal stability; the sliders can change them.

Scores are therefore comparison aids, not universal grades. A 45.8 means this point scores below many reference points under the selected criteria. It does not by itself say whether the project is viable.
DAILY YIELD 786.28 kWh/day · 1,000 m² reference
This is an illustrative daily energy estimate for a hypothetical 1,000 m² array, not a measured plant's output. The code uses irradiance, a 20% panel-efficiency assumption, a temperature adjustment above 25°C, and an 0.86 factor for other system losses.
VARIABILITY 22.6%
This is the coefficient of variation: the standard deviation of estimated daily yield divided by its mean. Lower means less day-to-day variation in the period used.
STABILITY 77.0%
This is the lowest monthly average divided by the highest monthly average. Here, the lowest month is about 77% of the best month. A higher ratio means the monthly averages were more even in the measured period. It is not a measurement of equipment reliability.
BEST-MONTH and LOWEST-MONTH AVERAGE
These identify the highest and lowest monthly average daily yield in the available data window. They are historical summaries, not a guarantee of future production.
NEXT-DAY FORECAST 0.58 clearness
This is a prediction of tomorrow's dimensionless clearness index. It is not 58% efficiency and not directly kWh. The 0.44–0.65 band is a nominal 80% prediction interval; the notebook's independent test coverage was about 68%, so it should be described as an estimate with imperfect calibration.
DATA & METHOD
This section explains the data lineage: NASA POWER for weather, Nominatim for the place label, and the reference grid for comparison. “Does not include parcel, terrain, grid, or permitting analysis” is a limitation of the weather score, even though some separate local screening tools are available below.
LOCAL SCREENING & PLANNING
This is a separate lookup, which is why it can still say “Checking elevation and mapped local infrastructure…” after the weather card is ready.
- Elevation: approximate SRTM-based height.
- Substation and transmission lines: OpenStreetMap features found within the search radius. Mapped distance is not the same as available grid capacity or a connection approval.
- Protected-area screen: nearby mapped OSM tags. “No feature found” is not legal or environmental clearance.
Cost worksheet
All cost values are user assumptions. The calculator multiplies project capacity by EPC cost per MW, adds land, grid line, site preparation, and local costs, then applies contingency. It converts lakh to crore. If EPC inputs are zero, it correctly says to enter assumptions before showing a total.
Policy research
The checklist is a starting point. Search results require the Brave key on the API server; when that is unavailable, the app provides a Google search and a copyable research brief. The copy button does not run a hidden AI agent. Results or prompts are not legal advice.
7. Viva questions you can prepare for
Why use a time-based split instead of a random split?
Because the task is forecasting. A random split can let the model train on later dates and test on earlier dates, which does not reflect forecasting into the future.

Why predict clearness index instead of raw irradiance?
Raw irradiance has a strong solar-season cycle. Dividing by an approximate top-of-atmosphere value reduces that cycle, so the model focuses more on cloud/weather variation.

What does the 80% interval mean?
It is intended to describe a range that should contain about 80% of future targets if calibration transfers well. The current independent test showed about 68% coverage, so it needs better calibration and more data.

Is the score a feasibility probability?
No. It is a weighted relative comparison of weather metrics against the sampled reference set. It does not include land rights, terrain, interconnection capacity, permits, or project economics.

What is static and what is live?
The catalogue and its saved metrics/forecasts are precomputed. Clicking a new coordinate fetches recent weather and predicts on demand. Local context is also requested separately, and the browser recalculates rankings when weights change.

What is the project's biggest limitation?
The ML data is 54 sites over part of one year. That is not enough to establish robust multi-year or unseen-location performance. The best current test predictor was persistence, so the ML model needs further validation and improvement.