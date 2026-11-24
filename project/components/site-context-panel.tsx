"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { fetchPolicySearch } from "@/lib/sites"
import type { PolicySearchResponse, SiteContext } from "@/lib/sites"

export type SiteDetailTab = "general" | "cost" | "agent" | "earth"

function NumberInput({ label, value, onChange, suffix, min = 0, step = 1 }: {
  label: string; value: number; onChange: (value: number) => void; suffix: string; min?: number; step?: number
}) {
  return <label className="cost-input"><span>{label}</span><div><input type="number" min={min} step={step} value={value} onChange={event => onChange(Math.max(min, Number(event.target.value) || 0))}/><small>{suffix}</small></div></label>
}

export function SiteContextPanel({ context, loading, error, lat, lon, section = "all" }: { context: SiteContext | null; loading: boolean; error: boolean; lat: number; lon: number; section?: SiteDetailTab | "all" }) {
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
  const [copiedPrompt, setCopiedPrompt] = useState(false)

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
  const inIndia = context?.policy_research.country_code == null || context.policy_research.country_code === "in"
  const policySearchUrl = context?.policy_research.search_url || `https://www.google.com/search?q=${encodeURIComponent(`site:gov.in solar project policy land conversion ${state || "India"} ${lat.toFixed(4)} ${lon.toFixed(4)}`)}`
  const placeLabel = [context?.policy_research.state, context?.policy_research.country].filter(Boolean).join(", ") || "India"
  const agentPrompt = `Research this potential solar project site near ${placeLabel} (${lat.toFixed(5)}, ${lon.toFixed(5)}). The map data did not provide a reliable answer for one or more of these: nearest electrical substation and transmission line, protected-area/environmental constraints, current state solar policy, land-use conversion, grid connection process. Search current official sources first (state renewable energy agency, electricity regulator and transmission utility, district administration, forest/wildlife authorities, MoEFCC, and government GIS portals). Return a concise table with finding, source URL, publication/update date, distance or applicability, and confidence. Clearly mark unknowns; do not infer that missing OpenStreetMap features mean the site is clear. This is preliminary research, not legal or engineering clearance.`
  const copyAgentPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt)
      setCopiedPrompt(true)
      window.setTimeout(() => setCopiedPrompt(false), 2200)
    } catch {
      setCopiedPrompt(false)
    }
  }
  const runPolicySearch = useCallback(async () => {
    if (!state || !inIndia) return
    setPolicyLoading(true)
    setPolicyError(null)
    try { setPolicyResults(await fetchPolicySearch(state, lat, lon)) }
    catch (error) { setPolicyError(error instanceof Error ? error.message : "Could not load policy search results.") }
    finally { setPolicyLoading(false) }
  }, [state, lat, lon, inIndia])

  useEffect(() => { if (state && inIndia && (section === "all" || section === "agent")) void runPolicySearch() }, [state, inIndia, runPolicySearch, section])

  return <section className="context-section">
    {(section === "all" || section === "general") && <>
    <div className="detail-section-title"><span>LOCAL SCREENING & PLANNING</span><span>PRELIMINARY</span></div>
    {loading ? <p className="context-note">Checking elevation and mapped local infrastructure…</p> : error ? <p className="context-note">Context services are unavailable right now. Weather analysis is still available.</p> : context ? <>
      <div className="context-grid">
        <article><small>GROUND ELEVATION</small><strong>{context.elevation.value_m == null ? "Unavailable" : `${context.elevation.value_m.toLocaleString()} m`}</strong><span>{context.elevation.dataset} · approximate terrain height</span></article>
        <article><small>NEAREST MAPPED SUBSTATION</small><strong>{grid?.status !== "available" ? "Lookup failed" : grid.nearest_substation_km == null ? "None found nearby" : `${grid.nearest_substation_km} km`}</strong><span>{grid?.status === "available" ? `${grid.substations_found ?? 0} OSM records in ${grid.search_radius_km} km` : "Could not retrieve mapped grid records. Ask the agent to check utility sources."}</span></article>
        <article><small>TRANSMISSION LINES</small><strong>{grid?.status !== "available" ? "Lookup failed" : grid.transmission_lines_found === 0 ? "None found nearby" : `${grid.transmission_lines_found} mapped`}</strong><span>{grid?.status !== "available" ? "Could not retrieve mapped grid records. Ask the agent to check utility sources." : grid.nearest_transmission_line_km == null ? `No distance available in ${grid.search_radius_km} km` : `Nearest mapped feature approx. ${grid.nearest_transmission_line_km} km`}</span></article>
      </div>
      <div className={`protected-screen ${protectedScreen?.status === "potential_feature_found" ? "flag" : ""}`}><strong>{protectedScreen?.status === "potential_feature_found" ? "Potential protected feature nearby" : protectedScreen?.status === "no_osm_feature_found" ? "No protected features mapped nearby" : "Protected-area data not available"}</strong><span>{protectedScreen?.status === "unknown" ? "Map coverage is incomplete. Check official forest, wildlife, wetland, and environmental layers before ruling this site out." : protectedScreen?.status === "no_osm_feature_found" ? "No matching OSM feature surfaced in the local screen; this does not establish environmental clearance." : protectedScreen?.note}</span>{protectedScreen?.nearby_features?.map((feature,index)=><small key={`${feature.name}-${index}`}>{feature.name || "Unnamed mapped feature"} · {feature.distance_km} km</small>)}</div>
      {(grid?.status !== "available" || grid?.nearest_substation_km == null || grid?.transmission_lines_found == null || grid?.transmission_lines_found === 0 || protectedScreen?.status === "unknown") && <div className="agent-fallback"><div><strong>Need a fuller site check?</strong><span>Ask an AI agent to research government and utility sources for this exact point.</span></div><button className="copy-research-prompt" onClick={()=>void copyAgentPrompt()}>{copiedPrompt ? "Prompt copied" : "Copy agent research prompt"}</button></div>}
      <nav className="screening-links" aria-label="Open external screening maps">
        <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`} target="_blank" rel="noreferrer">OpenStreetMap ↗</a>
        <a href="https://bhuvan-app1.nrsc.gov.in/" target="_blank" rel="noreferrer">ISRO Bhuvan ↗</a>
        <a href="https://www.protectedplanet.net/en/thematic-areas/wdpa?tab=WDPA" target="_blank" rel="noreferrer">Protected Planet ↗</a>
      </nav>

      </> : null}
    </>}

      {(section === "all" || section === "cost") && <section className="cost-estimator"><div className="cost-estimator-heading"><div><strong>Illustrative project-cost worksheet</strong><p>Enter local assumptions. Include land, evacuation, site work, local fees and a contingency; avoid double-counting costs already inside EPC.</p></div><span>₹ CRORE</span></div>
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
      </section>}

      {(section === "all" || section === "agent") && <section className="policy-scout"><div className="policy-scout-heading"><div><small>POLICY RESEARCH · {state || "INDIA"}</small><strong>Solar project checks</strong></div>{state && inIndia && <button className="policy-refresh" onClick={()=>void runPolicySearch()} disabled={policyLoading}>{policyLoading ? "Searching…" : "Search official results"}</button>}</div>
        {!inIndia ? <p className="policy-search-state">This point resolves outside India ({context?.policy_research.country || "country unknown"}); Indian policy checks do not apply.</p> : policyLoading && !policyResults ? <p className="policy-search-state">Searching government sources for {state}…</p> : policyError ? <p className="policy-search-state">Live search is unavailable. Use the direct search or copy the research brief below.</p> : policyResults?.results.length ? <div className="policy-results">{policyResults.results.map((result,index)=><article className="policy-result" key={`${result.url}-${index}`}><a href={result.url} target="_blank" rel="noreferrer"><strong>{result.title}</strong><span>↗</span></a><small>{result.domain}{result.published ? ` · ${result.published}` : ""}</small><p>{result.description || "Open this government source to review the details."}</p></article>)}</div> : null}
        {inIndia && <><p className="policy-search-state">Start with these checks; applicability depends on project size, land status, and point of connection.</p><ul>{(context?.policy_research.checks?.length ? context.policy_research.checks : ["Confirm the current state renewable-energy policy and project eligibility.", "Verify land title, conversion, lease terms, and local zoning.", "Check grid connectivity, evacuation approvals, and regulator charges.", "Screen environmental and protected-area clearances."]).map((item,index)=><li key={index}>{item}</li>)}</ul><div className="agent-actions"><a className="policy-research-link" href={policySearchUrl} target="_blank" rel="noreferrer">Search government sources ↗</a><button className="copy-research-prompt" onClick={()=>void copyAgentPrompt()}>{copiedPrompt ? "Prompt copied" : "Copy agent research prompt"}</button></div>{policyResults && !policyResults.results.length && <p className="policy-search-state">No government pages matched. Use the agent brief to search utility, regulator, district, and environmental sources too.</p>}</>}
        <p>Search results are leads for review, not legal advice or clearance. Check the issuing authority, date, and current status.</p></section>}

      {section === "earth" && <section className="earth-view-panel"><div className="earth-view-heading"><div><strong>Google satellite view</strong><span>{lat.toFixed(5)}°, {lon.toFixed(5)}°</span></div><a href={`https://earth.google.com/web/@${lat},${lon},10000a,35y,0h,0t,0r`} target="_blank" rel="noreferrer">Open this location in Google Earth ↗</a></div><iframe title="Google satellite map for selected solar site" src={`https://maps.google.com/maps?q=${lat},${lon}&t=k&z=13&output=embed`} loading="lazy" allow="fullscreen" referrerPolicy="strict-origin-when-cross-origin"/><p>Satellite imagery and resolution depend on Google’s coverage. Use the link above to open the point in Google Earth.</p></section>}

      {(section === "all" || section === "general") && context && <p className="context-attribution">Screening sources: {context.sources.join(" · ")}. OSM coverage is community-mapped; confirm grid and environmental constraints with official agencies.</p>}
  </section>
}
