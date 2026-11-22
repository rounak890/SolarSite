"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { fetchPolicySearch } from "@/lib/sites"
import type { PolicySearchResponse, SiteContext } from "@/lib/sites"
import { SolarRulesDisplay } from "./SolarRulesDisplay"

function NumberInput({ label, value, onChange, suffix, min = 0, step = 1 }: {
  label: string; value: number; onChange: (value: number) => void; suffix: string; min?: number; step?: number
}) {
  return <label className="cost-input"><span>{label}</span><div><input type="number" min={min} step={step} value={value} onChange={event => onChange(Math.max(min, Number(event.target.value) || 0))}/><small>{suffix}</small></div></label>
}

export function SiteContextPanel({ context, loading, error, lat, lon }: { context: SiteContext | null; loading: boolean; error: boolean; lat: number; lon: number }) {
  const [capacityMw, setCapacityMw] = useState(10)
  const [epcLow, setEpcLow] = useState(0)
  const [epcHigh, setEpcHigh] = useState(0)
  const [acresPerMw, setAcresPerMw] = useState(4)
  const [landLakhPerAcre, setLandLakhPerAcre] = useState(0)
  const [lineLakhPerKm, setLineLakhPerKm] = useState(0)
  const [sitePrepLakhPerMw, setSitePrepLakhPerMw] = useState(0)
  const [localCostLakhPerMw, setLocalCostLakhPerMw] = useState(0)
  const [contingencyPercent, setContingencyPercent] = useState(10)
  const [routeKm, setRouteKm] = useState(0)
  const [policyResults, setPolicyResults] = useState<PolicySearchResponse | null>(null)
  const [policyLoading, setPolicyLoading] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)

  useEffect(() => {
    const distance = context?.grid_infrastructure.nearest_substation_km
    if (distance != null) setRouteKm(Number((distance * 1.3).toFixed(1)))
  }, [context?.grid_infrastructure.nearest_substation_km])

  const estimate = useMemo(() => {
    const land = capacityMw * acresPerMw * landLakhPerAcre / 100
    const line = routeKm * lineLakhPerKm / 100
    const prep = capacityMw * sitePrepLakhPerMw / 100
    const local = capacityMw * localCostLakhPerMw / 100
    const contingency = 1 + contingencyPercent / 100
    return {
      low: (capacityMw * Math.min(epcLow,epcHigh) + land + line + prep + local) * contingency,
      high: (capacityMw * Math.max(epcLow,epcHigh) + land + line + prep + local) * contingency,
    }
  }, [capacityMw, epcLow, epcHigh, acresPerMw, landLakhPerAcre, lineLakhPerKm, sitePrepLakhPerMw, localCostLakhPerMw, contingencyPercent, routeKm])

  const grid = context?.grid_infrastructure
  const protectedScreen = context?.protected_area_screen
  const state = context?.policy_research.state
  const runPolicySearch = useCallback(async () => {
    if (!state) return
    setPolicyLoading(true)
    setPolicyError(null)
    try { setPolicyResults(await fetchPolicySearch(state, lat, lon)) }
    catch (error) { setPolicyError(error instanceof Error ? error.message : "Could not load policy search results.") }
    finally { setPolicyLoading(false) }
  }, [state, lat, lon])

  useEffect(() => { if (state) void runPolicySearch() }, [state, runPolicySearch])

  return <section className="context-section">
    <div className="detail-section-title"><span>LOCAL SCREENING & PLANNING</span><span>PRELIMINARY</span></div>
    {loading ? <p className="context-note">Checking elevation and mapped local infrastructure…</p> : error ? <p className="context-note">Context services are unavailable right now. Weather analysis is still available.</p> : context ? <>
      <div className="context-grid">
        <article><small>GROUND ELEVATION</small><strong>{context.elevation.value_m == null ? "Unavailable" : `${context.elevation.value_m.toLocaleString()} m`}</strong><span>{context.elevation.dataset} · approximate terrain height</span></article>
        <article><small>NEAREST MAPPED SUBSTATION</small><strong>{grid?.status !== "available" ? "Unavailable" : grid.nearest_substation_km == null ? "None mapped" : `${grid.nearest_substation_km} km`}</strong><span>{grid?.status === "available" ? `${grid.substations_found} mapped within ${grid.search_radius_km} km` : "OpenStreetMap lookup did not complete"}</span></article>
        <article><small>TRANSMISSION LINES</small><strong>{grid?.status !== "available" ? "Unavailable" : `${grid.transmission_lines_found} mapped`}</strong><span>{grid?.nearest_transmission_line_km == null ? "No mapped line distance" : `Nearest approx. ${grid.nearest_transmission_line_km} km`}</span></article>
      </div>
      <div className={`protected-screen ${protectedScreen?.status === "potential_feature_found" ? "flag" : ""}`}><strong>Protected-area screen: {protectedScreen?.status === "potential_feature_found" ? "mapped feature nearby" : protectedScreen?.status === "no_osm_feature_found" ? "no OSM feature found nearby" : "unknown"}</strong><span>{protectedScreen?.note}</span>{protectedScreen?.nearby_features?.map((feature,index)=><small key={`${feature.name}-${index}`}>{feature.name || "Unnamed mapped feature"} · {feature.distance_km} km</small>)}</div>
      <nav className="screening-links" aria-label="Open external screening maps">
        <a href={`https://earth.google.com/web/@${lat},${lon},10000a,35y,0h,0t,0r`} target="_blank" rel="noreferrer">Google Earth ↗</a>
        <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`} target="_blank" rel="noreferrer">OpenStreetMap ↗</a>
        <a href="https://bhuvan-app1.nrsc.gov.in/" target="_blank" rel="noreferrer">ISRO Bhuvan ↗</a>
        <a href="https://www.protectedplanet.net/en/thematic-areas/wdpa?tab=WDPA" target="_blank" rel="noreferrer">Protected Planet ↗</a>
      </nav>

      <section className="cost-estimator"><div className="cost-estimator-heading"><div><strong>Illustrative project-cost worksheet</strong><p>Enter local assumptions. Include land, evacuation, site work, local fees and a contingency; avoid double-counting costs already inside EPC.</p></div><span>₹ CRORE</span></div>
        <div className="cost-input-grid">
          <NumberInput label="Plant capacity" value={capacityMw} onChange={setCapacityMw} suffix="MW" step={1}/>
          <NumberInput label="EPC low per MW" value={epcLow} onChange={setEpcLow} suffix="₹ Cr" step={0.1}/>
          <NumberInput label="EPC high per MW" value={epcHigh} onChange={setEpcHigh} suffix="₹ Cr" step={0.1}/>
          <NumberInput label="Land requirement" value={acresPerMw} onChange={setAcresPerMw} suffix="acre/MW" step={0.1}/>
          <NumberInput label="Land price" value={landLakhPerAcre} onChange={setLandLakhPerAcre} suffix="₹ lakh/acre" step={1}/>
          <NumberInput label="Grid line cost" value={lineLakhPerKm} onChange={setLineLakhPerKm} suffix="₹ lakh/km" step={1}/>
          <NumberInput label="Site preparation" value={sitePrepLakhPerMw} onChange={setSitePrepLakhPerMw} suffix="₹ lakh/MW" step={1}/>
          <NumberInput label="Other local costs" value={localCostLakhPerMw} onChange={setLocalCostLakhPerMw} suffix="₹ lakh/MW" step={1}/>
          <NumberInput label="Contingency" value={contingencyPercent} onChange={setContingencyPercent} suffix="%" step={1}/>
          <NumberInput label="Line route estimate" value={routeKm} onChange={setRouteKm} suffix="km" step={0.5}/>
        </div>
        <div className="cost-result"><small>ESTIMATED TOTAL FROM YOUR ASSUMPTIONS</small><strong>{Math.max(epcLow,epcHigh) > 0 ? `₹${estimate.low.toFixed(1)}–${estimate.high.toFixed(1)} Cr` : "Enter EPC assumptions to calculate"}</strong><span>Uses a route-distance default of 1.3× the straight-line substation distance; edit it to match an actual route. This is a planning worksheet, not a quote.</span></div>
      </section>

      <section className="policy-scout"><div className="policy-scout-heading"><div><small>LIVE POLICY SEARCH · {state || "STATE NOT IDENTIFIED"}</small><strong>Government search results</strong></div><button className="policy-refresh" onClick={()=>void runPolicySearch()} disabled={!state||policyLoading}>{policyLoading ? "Searching…" : "Refresh results"}</button></div>
        {policyLoading && !policyResults ? <p className="policy-search-state">Searching official government sources for {state}…</p> : policyError ? <p className="policy-search-state policy-search-error">{policyError}</p> : policyResults?.results.length ? <div className="policy-results">{policyResults.results.map((result,index)=><article className="policy-result" key={`${result.url}-${index}`}><a href={result.url} target="_blank" rel="noreferrer"><strong>{result.title}</strong><span>↗</span></a><small>{result.domain}{result.published ? ` · ${result.published}` : ""}</small><p>{result.description || "Open this government source to review the details."}</p></article>)}</div> : policyResults ? <p className="policy-search-state">No government-domain results came back for this search. Try refreshing or open a broader web search.</p> : <p className="policy-search-state">Choose a site with a recognized state to search current government sources.</p>}
        <p>Results are live web search matches from government domains. Confirm publication dates, current status, and whether each rule applies to this project; this is not legal clearance.</p></section>
      <SolarRulesDisplay lat={lat} lon={lon} />
      <p className="context-attribution">Screening sources: {context.sources.join(" · ")}. OSM coverage is community-mapped; confirm grid and environmental constraints with official agencies.</p>
    </> : null}
  </section>
}
