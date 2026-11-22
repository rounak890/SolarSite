import { Activity, Database, MapPin, Sun, Waves } from "lucide-react"

const weights = [
  { title: "Solar yield", weight: "60%", detail: "Average daily photovoltaic yield estimated from NASA POWER daily solar irradiance and air temperature." },
  { title: "Variability", weight: "20%", detail: "Lower day-to-day yield variability improves the weather-resource score." },
  { title: "Seasonal stability", weight: "20%", detail: "The ratio of the lowest to highest average monthly yield measures seasonal consistency." },
]

export default function AboutPage() {
  return <main className="about-page">
    <section className="about-hero">
      <div className="eyebrow"><span className="live-dot"/> TECHNICAL NOTES <span className="slash">/</span> INDIA MULTI-STATE SAMPLE</div>
      <h1>How SolarSite compares solar-resource sites</h1>
      <p>SolarSite compares sampled locations using historical solar and weather data. Some rows use named state-anchor locations; the rest use coordinate-based labels. The score is not a parcel development feasibility assessment.</p>
      <div className="about-facts"><span><MapPin size={14}/> 84 sample locations</span><span><Waves size={14}/> All 28 states + 8 union territories</span><span><Activity size={14}/> User-adjustable priorities</span><span><Database size={14}/> NASA POWER daily data</span></div>
    </section>

    <section className="about-section">
      <div className="about-section-heading"><div><div className="eyebrow">SCORING MODEL</div><h2>Weather-resource score</h2><p>Each metric is scaled against the sample grid using robust reference bounds, weighted, and combined into a 5–100 score.</p></div><span className="about-range">SCORE RANGE&nbsp; 5–100</span></div>
      <div className="about-formula"><div><small>COMPOSITE SCORE</small><strong>0.60 × yield&nbsp; + &nbsp;0.20 × (1 − variability)&nbsp; + &nbsp;0.20 × seasonal stability</strong><p>Each input is normalized using the 5th and 95th percentiles of the grid. Values outside those bounds are capped before weighting.</p></div><div className="about-weight-list">{weights.map(item=><div key={item.title}><span>{item.title}</span><strong>{item.weight}</strong><i><b style={{width:item.weight}}/></i></div>)}</div></div>
      <div className="about-metric-grid">{weights.map((item,index)=><article className="about-card" key={item.title}><span className="about-icon">{index===0?<Sun size={17}/>:index===1?<Activity size={17}/>:<Waves size={17}/>}</span><div className="about-card-top"><strong>{item.title}</strong><code>{item.weight}</code></div><p>{item.detail}</p><small>{index===0?"UNIT: kWh / day":index===1?"LOWER IS BETTER":"HIGHER IS BETTER"}</small></article>)}</div>
    </section>

    <section className="about-section">
      <div className="about-section-heading"><div><div className="eyebrow">DATA SOURCES & COVERAGE</div><h2>What the app uses</h2><p>Source details are shown with each site result. Names are looked up for selected points and cached.</p></div></div>
      <div className="about-source-grid"><article className="about-source"><span className="source-tag">WEATHER DATA</span><h3>NASA POWER</h3><p>Daily solar irradiance and meteorological variables feed the historical yield, variability, and forecast features.</p><small>Coverage: global · Solar data is gridded at roughly 1° resolution</small></article><article className="about-source"><span className="source-tag">ELEVATION</span><h3>OpenTopoData · SRTM 90m</h3><p>Returns approximate ground elevation for the selected coordinate. It does not calculate slope, shading, or constructability.</p><small>Terrain height only · about 90 m source grid</small></article><article className="about-source"><span className="source-tag">GRID & PROTECTED FEATURES</span><h3>OpenStreetMap · Overpass</h3><p>Looks for mapped substations, transmission lines, and nearby protected-area tags around the selected point.</p><small>Mapped-feature screening only · coverage can be incomplete</small></article><article className="about-source"><span className="source-tag">PLACE NAMES</span><h3>OpenStreetMap Nominatim</h3><p>Reverse geocoding supplies area, city, and state labels for selected map points and site details.</p><small>Names are descriptive labels; they do not identify legal parcels.</small></article></div>
    </section>

    <section className="about-limits"><div className="about-icon"><MapPin size={18}/></div><div><strong>Early screening only</strong><p>The static set contains a 36-point western India grid, three named locations in each of Maharashtra, Madhya Pradesh, Karnataka, Telangana, Andhra Pradesh, and Tamil Nadu, plus one city anchor for each remaining state and union territory. City anchors are regional comparison points, not representative parcels. NASA POWER’s solar grid is coarser than the point spacing, so nearby points can share source values. Grid and protected-area signals rely on OpenStreetMap and are not complete; Bhuvan and Protected Planet links are provided for manual follow-up, not used as a legal screen. The cost worksheet uses assumptions entered by the user. The Policy Scout prepares a checklist and prompt for an external research tool; it does not verify current rules or provide legal clearance. Confirm land, terrain, grid capacity, protected areas, permits, and project costs with authoritative local sources.</p></div></section>
  </main>
}
