"use client"

import { Activity, ArrowUpRight, ExternalLink, MapPin, Sun } from "lucide-react"
import { useState } from "react"
import type { Site } from "@/lib/sites"
import type { SiteContext } from "@/lib/sites"
import { siteColor } from "@/lib/sites"
import { SiteContextPanel, type SiteDetailTab } from "@/components/site-context-panel"

function display(value: unknown) { return value == null ? "—" : typeof value === "number" ? new Intl.NumberFormat("en-US", {maximumFractionDigits:2}).format(value) : String(value) }
function sourceLabel(key: string) {
  return ({ weather_irradiance: "Solar weather", place_name: "Location name", score_basis: "How the score is calculated", limitation: "What this score does not cover" } as Record<string, string>)[key] ?? key.replaceAll("_", " ").replace(/^\w/, letter => letter.toUpperCase())
}
function percent(value?: number) { return value == null ? "—" : `${(value <= 1 ? value*100 : value).toFixed(1)}%` }

export function SiteDetail({ site, scoreOverride, context, contextLoading, contextError, showFullPageLink = false, tabbed = false }: { site: Site; scoreOverride?: number; context: SiteContext | null; contextLoading: boolean; contextError: boolean; showFullPageLink?: boolean; tabbed?: boolean }) {
  const [activeTab, setActiveTab] = useState<SiteDetailTab>("general")
  const isLive = site.site_id.startsWith("live_")
  const place = [site.location?.area, site.location?.city, site.location?.state, site.location?.country].filter(Boolean).filter((part,index,array)=>array.indexOf(part)===index).join(", ") || (site.site_name ? `${site.site_name}${site.state ? `, ${site.state}` : ""}${site.country && site.country.toLowerCase()!=="india" ? `, ${site.country}` : ""}` : "")
  const interval = site.forecast_interval_80 ?? [0,0]
  const low = Number(interval[0] ?? 0), high = Number(interval[1] ?? 0), next = Number(site.forecast_next_day_clearness ?? 0)
  const min = Math.min(low, high, next), max = Math.max(low, high, next, 1), range = max-min || 1
  const left = ((low-min)/range)*100, width = Math.max(3,((high-low)/range)*100)
  const shownScore = Number.isFinite(scoreOverride) ? Number(scoreOverride) : site.suitability_score
  const scoreColor = siteColor(shownScore)
  const pageScore = Number.isFinite(scoreOverride) ? Number(scoreOverride) : isLive ? site.suitability_score : undefined
  const detailHref = `${isLive ? `/site-details?lat=${site.lat}&lon=${site.lon}` : `/site-details?siteId=${encodeURIComponent(site.site_id)}`}${pageScore != null ? `&score=${pageScore}` : ""}`
  return <div className={`detail-content ${tabbed ? "detail-content-tabbed" : ""}`}>
    {tabbed && <nav className="site-detail-tabs" role="tablist" aria-label="Site detail sections">{([["general","General data"],["cost","Cost estimation"],["agent","Agent search results"],["earth","Google Earth"]] as [SiteDetailTab,string][]).map(([key,label])=><button key={key} role="tab" aria-selected={activeTab===key} className={activeTab===key ? "active" : ""} onClick={()=>setActiveTab(key)}>{label}</button>)}</nav>}
    {(!tabbed || activeTab === "general") && <>
    <div className="detail-kicker"><span className="status-pill"><i/> {isLive ? "LIVE WEATHER ESTIMATE" : site.sample_type === "state_anchor" ? "STATE SAMPLE ANCHOR" : "PRECOMPUTED SITE"}</span><span className="mono">SITE-ID: {site.site_id}</span></div><h2>{place || (isLive ? "Clicked location" : site.site_id)}</h2>{showFullPageLink&&<a className="full-detail-link" href={detailHref} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Open detailed view in new tab</a>}<div className="detail-location"><MapPin size={15}/><span>{site.lat.toFixed(4)}° N, {Math.abs(site.lon).toFixed(4)}° {site.lon < 0 ? "W" : "E"}</span>{place&&<><span className="muted">·</span><span>{place}</span></>}</div>
    <section className="score-panel"><div className="score-panel-head"><span>{isLive ? "WEATHER REFERENCE SCORE" : "WEATHER RESOURCE SCORE"}</span><span className="status-pill tier"><i/> {site.regime_label || "Evaluated site"}</span></div><div className="big-score">{shownScore.toFixed(1)}<small>/100</small></div><div className="score-track large"><i style={{width:`${Math.max(0,Math.min(100,shownScore))}%`,background:scoreColor}}/></div><div className="score-meta"><span>{scoreOverride != null || isLive ? "Score uses your selected weights" : "Historical solar metrics vs. reference sites"}</span><span>{isLive ? "Indicative" : "Precomputed ranking"}</span></div></section>
    <div className="detail-section-title"><span>PERFORMANCE METRICS</span><span>WEATHER RESOURCE</span></div><div className="detail-stats"><div><Sun size={15}/><small>DAILY YIELD</small><strong>{display(site.mean_daily_yield_kwh)}</strong><span>kWh/day · 1,000 m² reference</span></div><div><Activity size={15}/><small>VARIABILITY</small><strong>{percent(site.variability_cv)}</strong><span>Coefficient of variation</span></div><div><ArrowUpRight size={15}/><small>STABILITY</small><strong>{percent(site.seasonal_stability)}</strong><span>Lowest / highest monthly average</span></div></div>
    {(site.peak_monthly_yield_kwh != null || site.lowest_monthly_yield_kwh != null) && <section className="monthly-yield"><div><small>BEST-MONTH AVERAGE</small><strong>{display(site.peak_monthly_yield_kwh)} <small>kWh/day · {site.peak_yield_month ?? "—"}</small></strong></div><div><small>LOWEST-MONTH AVERAGE</small><strong>{display(site.lowest_monthly_yield_kwh)} <small>kWh/day · {site.lowest_yield_month ?? "—"}</small></strong></div><p>Monthly means from the available NASA POWER history, for the same 1,000 m² reference system.</p></section>}
    <section className="forecast-card"><div className="forecast-title"><span><Sun size={15}/> NEXT-DAY FORECAST</span><span>80% INTERVAL</span></div><div className="forecast-value">{display(site.forecast_next_day_clearness)}<small> clearness</small></div><div className="forecast-band" aria-label={`80 percent forecast interval ${display(low)} to ${display(high)}`}><span className="forecast-range" style={{left:`${left}%`,width:`${width}%`}}/><span className="forecast-point" style={{left:`${((next-min)/range)*100}%`}}/></div><div className="forecast-range-labels"><span>{display(low)} lower bound</span><span>{display(high)} upper bound</span></div></section>
    <section className="sources-section"><div className="detail-section-title"><span>DATA & METHOD</span><span>{isLive ? "LIVE LOOKUPS" : "REFERENCE DATA"}</span></div><div className="source-list">{Object.entries(site.data_sources ?? {}).map(([key,value])=><div key={key}><span>{sourceLabel(key)}</span><strong>{display(value)}</strong></div>)}</div><p className="source-note">Weather scores compare solar conditions with the reference grid. They are an early screen, not a parcel or project feasibility assessment.</p></section>
    <SiteContextPanel context={context} loading={contextLoading} error={contextError} lat={site.lat} lon={site.lon} section={tabbed ? "general" : "all"}/>
    <div className="detail-coordinates"><span>LATITUDE <b>{site.lat.toFixed(5)}°</b></span><span>LONGITUDE <b>{site.lon.toFixed(5)}°</b></span></div>
    </>}
    {tabbed && activeTab !== "general" && <div className="detail-tab-panel"><SiteContextPanel context={context} loading={contextLoading} error={contextError} lat={site.lat} lon={site.lon} section={activeTab}/></div>}
  </div>
}
