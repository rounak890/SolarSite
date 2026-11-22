"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, CircleHelp, Layers3, Search, Sun, X } from "lucide-react"
import type { Site } from "@/lib/sites"
import { SiteDetail } from "@/components/site-detail"
import AboutPage from "@/components/about-page"
import { analyzeSite, fetchSite, fetchSiteContext, fetchSites, LiveAnalysisError, siteColor } from "@/lib/sites"
import type { SiteContext } from "@/lib/sites"

const SitesMap = dynamic(() => import("@/components/sites-map"), { ssr: false, loading: () => <div className="map-loading"><span className="spinner" /> Loading map…</div> })

function Header() {
  const pathname = usePathname()
  return <header className="topbar"><Link className="brand" href="/"><span className="brand-mark"><Sun size={19} /></span><span><strong>SolarSite</strong><small>Site Evaluation Platform</small></span></Link><nav aria-label="Main navigation"><Link className={pathname === "/" ? "active" : ""} href="/"><Layers3 size={15}/> Map</Link><Link className={pathname === "/rankings" ? "active" : ""} href="/rankings">Rankings</Link><Link className={pathname === "/about" ? "active" : ""} href="/about">About</Link></nav><div className="top-meta"><span className="source-pill"><i/> India solar study area <b>v2.4</b></span><button className="icon-button" aria-label="Help"><CircleHelp size={19}/></button><span className="avatar">S</span></div></header>
}

function Loading() { return <div className="center-state"><span className="spinner"/><p>Loading site data…</p></div> }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="center-state error-state"><div className="error-icon">!</div><h2>Can&apos;t connect to the site database</h2><p>Backend not reachable at localhost:8000</p><button className="black-button" onClick={onRetry}>Try again</button></div> }
type ScoreWeights = { yield: number; variability: number; seasonal: number }
type WeightedSite = Site & { user_weighted_score: number }
function WeightControls({ weights, onChange }: { weights: ScoreWeights; onChange: (key: keyof ScoreWeights, value: number) => void }) {
  const rows: [keyof ScoreWeights, string][] = [["yield","Solar yield"],["variability","Variability"],["seasonal","Seasonal stability"]]
  return <section className="priority-card"><div className="priority-heading"><div><strong>Set your priorities</strong><small>Adjust weights to reorder sites</small></div><span>SUM {Math.round(weights.yield+weights.variability+weights.seasonal)}%</span></div>{rows.map(([key,label])=><label className="priority-row" key={key}><span>{label}<b>{Math.round(weights[key])}%</b></span><input type="range" min="0" max="100" step="1" value={Math.round(weights[key])} onChange={event=>onChange(key,Number(event.target.value))}/></label>)}</section>
}

function quantile(values: number[], q: number) {
  const sorted = [...values].sort((a,b)=>a-b)
  if (!sorted.length) return 0
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position), fraction = position - lower
  return sorted[lower] * (1-fraction) + (sorted[Math.min(lower+1,sorted.length-1)] ?? sorted[lower]) * fraction
}

export default function SolarSiteApp() {
  const pathname = usePathname()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Site | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [livePoint, setLivePoint] = useState<{lat:number;lon:number}|null>(null)
  const [outsidePoint, setOutsidePoint] = useState<{lat:number;lon:number}|null>(null)
  const [liveOpen, setLiveOpen] = useState(false)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState(false)
  const [liveSite, setLiveSite] = useState<Site|null>(null)
  const [siteContext, setSiteContext] = useState<SiteContext|null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [contextError, setContextError] = useState(false)
  const contextRequest = useRef(0)
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<keyof Site>("suitability_score")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [weights, setWeights] = useState<ScoreWeights>({yield:60,variability:20,seasonal:20})

  const loadSites = useCallback(async () => {
    setLoading(true); setFailed(false)
    try { setSites(await fetchSites()) } catch { setFailed(true) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void loadSites() }, [loadSites])
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let cancelled = false
    setDetailLoading(true)
    fetchSite(selectedId).then((item) => { if (!cancelled) setDetail(item) }).catch(() => { if (!cancelled) setDetail(sites.find((site) => site.site_id === selectedId) ?? null) }).finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selectedId, sites])

  const weightedSites = useMemo<WeightedSite[]>(() => {
    const criteria: [keyof ScoreWeights, keyof Site, boolean][] = [["yield","mean_daily_yield_kwh",true],["variability","variability_cv",false],["seasonal","seasonal_stability",true]]
    const ranges = Object.fromEntries(criteria.map(([,field])=>[field,[quantile(sites.map(s=>Number(s[field])||0),.05),quantile(sites.map(s=>Number(s[field])||0),.95)]])) as Record<string,[number,number]>
    return sites.map(site=>{
      const score=criteria.reduce((total,[key,field,higher])=>{
        const [lo,hi]=ranges[field as string]
        let normalized=(Number(site[field]) - lo)/(hi-lo+1e-9)
        normalized=Math.max(.05,Math.min(1,normalized))
        if(!higher) normalized=1-normalized
        return total+(normalized*weights[key]/100)
      },0)
      const userScore=Math.round(score*1000)/10
      return {...site,user_weighted_score:userScore,suitability_score:userScore}
    })
  }, [sites,weights])
  const changeWeight = (key: keyof ScoreWeights, value: number) => setWeights(current=>{
    const others=(Object.keys(current) as (keyof ScoreWeights)[]).filter(item=>item!==key)
    const otherTotal=current[others[0]]+current[others[1]]
    const remaining=100-value
    return {...current,[key]:value,[others[0]]:otherTotal?remaining*current[others[0]]/otherTotal:remaining/2,[others[1]]:otherTotal?remaining*current[others[1]]/otherTotal:remaining/2}
  })
  const topSites = useMemo(() => [...weightedSites].sort((a,b) => Number(b.user_weighted_score)-Number(a.user_weighted_score)).slice(0,5), [weightedSites])
  const filtered = useMemo(() => weightedSites.filter((site) => `${displaySiteName(site)} ${site.state ?? ""} ${site.site_id} ${site.regime_label}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => {
    const av = sortKey==="suitability_score"?a.user_weighted_score:a[sortKey], bv = sortKey==="suitability_score"?b.user_weighted_score:b[sortKey]
    const comparison = typeof av === "number" && typeof bv === "number" ? av-bv : String(av ?? "").localeCompare(String(bv ?? ""))
    return sortDirection === "asc" ? comparison : -comparison
  }), [weightedSites, query, sortKey, sortDirection])
  const toggleSort = (key: keyof Site) => { if (sortKey === key) setSortDirection(sortDirection === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDirection("desc") } }
  const loadContext = async (point: {lat:number;lon:number}) => {
    const requestId = ++contextRequest.current
    setSiteContext(null); setContextLoading(true); setContextError(false)
    try {
      const result = await fetchSiteContext(point.lat, point.lon)
      if (contextRequest.current === requestId) setSiteContext(result)
    } catch {
      if (contextRequest.current === requestId) setContextError(true)
    } finally {
      if (contextRequest.current === requestId) setContextLoading(false)
    }
  }
  const openSite = (id: string) => {
    setLiveOpen(false)
    setLivePoint(null)
    setOutsidePoint(null)
    setLiveError(false)
    setLiveSite(null)
    setSelectedId(id)
    const site = sites.find((item) => item.site_id === id)
    if (site) void loadContext({lat:site.lat,lon:site.lon})
  }
  const requestLiveSite = async (point: {lat:number;lon:number}) => {
    setSelectedId(null)
    setLivePoint(point)
    setOutsidePoint(null)
    setLiveOpen(true)
    setLiveLoading(true)
    setLiveError(false)
    setLiveSite(null)
    void loadContext(point)
    try {
      const result = await analyzeSite(point.lat, point.lon)
      const resultSite={ ...result, site_id: result.site_id || "LIVE SITE LOOKUP", lat: point.lat, lon: point.lon } as Site
      const comparison = weightedSites
      const criteria: [keyof ScoreWeights, keyof Site, boolean][] = [["yield","mean_daily_yield_kwh",true],["variability","variability_cv",false],["seasonal","seasonal_stability",true]]
      const dynamicScore=criteria.reduce((total,[key,field,higher])=>{
        const values=comparison.map(item=>Number(item[field])||0)
        let normalized=(Number(resultSite[field]) - quantile(values,.05))/(quantile(values,.95)-quantile(values,.05)+1e-9)
        normalized=Math.max(.05,Math.min(1,normalized))
        if(!higher) normalized=1-normalized
        return total+normalized*weights[key]/100
      },0)
      setLiveSite({ ...resultSite, suitability_score:Math.round(dynamicScore*1000)/10 })
    } catch (error) {
      if (error instanceof LiveAnalysisError && error.status === 400) {
        setOutsidePoint(point)
        setLiveOpen(false)
      } else {
        setLiveError(true)
      }
    } finally {
      setLiveLoading(false)
    }
  }

  return <div className="app-shell"><Header/>
    {loading ? <Loading/> : failed ? <ErrorState onRetry={() => void loadSites()}/> : pathname === "/about" ? <AboutPage/> : pathname === "/rankings" ? <main className="rankings-page">
      <div className="rank-intro"><div><div className="eyebrow"><span className="live-dot"/> EVALUATION MATRIX <span className="slash">/</span> INDIA SAMPLE SITES</div><h1>Solar Resource Rankings</h1><p>Compare {sites.length.toLocaleString()} sampled locations using historical solar yield, variability, and seasonal stability.</p></div><div className="rank-summary"><div><small>LOCATIONS</small><strong>{sites.length.toLocaleString()}</strong><span>Across multiple states</span></div><div><small>TOP SITE SCORE</small><strong>{weightedSites.length ? Math.max(...weightedSites.map(s=>Number(s.user_weighted_score))).toFixed(1) : "—"}</strong><span className="green-text">Your selected weights</span></div><div><small>WESTERN GRID</small><strong>~100 km</strong><span>Plus state anchors</span></div></div></div>
      <WeightControls weights={weights} onChange={changeWeight}/>
      <section className="rank-table-card"><div className="table-toolbar"><label className="searchbox"><Search size={17}/><input aria-label="Filter sites" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter by site name, coordinates, or site ID…"/></label><span className="table-count">{filtered.length.toLocaleString()} sites</span></div><div className="table-scroll"><table><thead><tr>{([["rank","Rank"],["site_id","Site name / ID"],["suitability_score","Weather score"],["regime_label","Regime"],["mean_daily_yield_kwh","Daily yield"],["variability_cv","Variability"],["top_k_freq","Top-k frequency"]] as [string,string][]).map(([key,label])=><th key={key}><button onClick={()=>key!=="rank"&&toggleSort(key as keyof Site)}>{label}{key!=="rank"&&(sortKey===key?(sortDirection==="asc"?<ArrowUp size={13}/>:<ArrowDown size={13}/>):<ArrowUpDown size={13}/>)}</button></th>)}</tr></thead><tbody>{filtered.map((site,index)=><tr key={site.site_id} onClick={()=>openSite(site.site_id)} tabIndex={0} onKeyDown={e=>e.key==="Enter"&&openSite(site.site_id)}><td><span className="rank-number">{index+1}</span></td><td><strong className="site-id">{displaySiteName(site)}</strong><small className="coordinates">{site.site_id} · {site.lat.toFixed(3)}° N · {Math.abs(site.lon).toFixed(3)}° {site.lon < 0 ? "W" : "E"}</small></td><td><div className="score-cell"><strong>{site.suitability_score.toFixed(1)}</strong><span className="score-track"><i style={{width:`${Math.max(0,Math.min(100,site.suitability_score))}%`,background:siteColor(site.suitability_score)}}/></span></div></td><td><span className="regime-chip" style={{color:siteColor(site.suitability_score)}}>{site.regime_label || "Unclassified"}</span></td><td>{formatNumber(site.mean_daily_yield_kwh)} <small>kWh/day</small></td><td>{formatPercent(site.variability_cv)}</td><td>{site.top_k_freq ?? "—"}</td></tr>)}</tbody></table>{filtered.length===0&&<div className="empty-state">No sites match that search.</div>}</div><div className="table-footer">Showing {filtered.length ? 1 : 0}–{filtered.length.toLocaleString()} of {sites.length.toLocaleString()} candidate sites <span>Weather score ranks against reference sites <ChevronRight size={14}/></span></div></section>
      <div className="ranking-notes"><div><span className="legend-dot high"/> 80–100 <b>High suitability</b></div><div><span className="legend-dot medium"/> 60–79 <b>Moderate</b></div><div><span className="legend-dot low"/> &lt;60 <b>Constrained</b></div></div>
    </main> : <main className="map-page"><div className="map-heading"><div><div className="eyebrow"><span className="live-dot"/> SOLAR CADASTRE <span className="slash">/</span> LIVE SITE EVALUATION</div><h1>Discover your next <em>solar site.</em></h1><p>Explore the western India grid and representative city anchors across all Indian states and union territories using NASA POWER data.</p></div><div className="total-sites"><span className="live-dot"/><strong>{sites.length.toLocaleString()}</strong><small>sites evaluated</small></div></div>
      <div className="workspace"><section className="map-card"><div className="map-toolbar"><span className="map-toolbar-title"><Layers3 size={15}/> India · weather score</span><span><i className="legend-dot high"/> High</span><span><i className="legend-dot medium"/> Moderate</span><span><i className="legend-dot low"/> Constrained</span><span className="live-legend"><i/> Live lookup</span><span className="map-toolbar-count">{sites.length} sites</span></div><SitesMap sites={weightedSites} selectedId={selectedId} livePoint={livePoint} outsidePoint={outsidePoint} onSelect={openSite} onMapClick={requestLiveSite}/><div className="map-footer"><span><span className="live-dot"/> NASA POWER solar data</span><span>Western grid + state/UT city anchors <b>·</b> WGS 84</span></div></section>
      <aside className="top-sites"><div className="side-heading"><div><div className="eyebrow">LEADING LOCATIONS</div><h2>Top solar-resource sites</h2></div><Link href="/rankings">View all <ChevronRight size={14}/></Link></div><WeightControls weights={weights} onChange={changeWeight}/><div className="top-list">{topSites.map((site,index)=><button key={site.site_id} className={`site-card ${selectedId===site.site_id?"selected":""}`} onClick={()=>openSite(site.site_id)}><span className="site-rank">{String(index+1).padStart(2,"0")}</span><span className="site-card-main"><strong>{displaySiteName(site)}</strong><small>{site.lat.toFixed(3)}° N, {Math.abs(site.lon).toFixed(3)}° {site.lon < 0 ? "W" : "E"}</small><span className="regime-label"><i style={{background:siteColor(site.suitability_score)}}/>{site.regime_label || "Evaluated location"}</span></span><span className="site-card-score" style={{color:siteColor(site.suitability_score)}}>{site.suitability_score.toFixed(1)}<small>/100</small></span></button>)}{topSites.length===0&&<p className="muted">No sites available.</p>}</div><div className="method-card"><span className="method-icon"><Sun size={16}/></span><div><strong>Weather-based comparison</strong><p>Scores use solar yield, variability, and seasonal stability. They do not include parcel, terrain, grid, or permitting data.</p></div></div></aside></div>
    </main>}
    <footer className="site-footer"><span>© 2025 SolarSite Analytics Inc. <b>Precision geospatial infrastructure.</b></span><span>NASA POWER DAILY SOLAR DATA <b>·</b> PLACE NAMES © OPENSTREETMAP CONTRIBUTORS</span></footer>
    {(selectedId||liveOpen)&&<div className="detail-backdrop" onClick={()=>{setSelectedId(null);setLiveOpen(false)}}><aside className="detail-drawer" onClick={e=>e.stopPropagation()}><button className="drawer-close" aria-label="Close details" onClick={()=>{setSelectedId(null);setLiveOpen(false)}}><X size={19}/></button>{liveOpen?liveLoading?<div className="drawer-loading"><span className="spinner"/> Analyzing selected location…</div>:liveError?<div className="live-error-panel"><span className="status-pill"><i/> LIVE SITE LOOKUP</span><h2>Analysis temporarily unavailable</h2><p>Live lookup failed — NASA&apos;s data service may be slow right now, try again</p><button className="black-button" onClick={()=>livePoint&&void requestLiveSite(livePoint)}>Retry analysis</button></div>:liveSite?<SiteDetail site={liveSite} context={siteContext} contextLoading={contextLoading} contextError={contextError} showFullPageLink/>:null:detailLoading&&!detail?<div className="drawer-loading"><span className="spinner"/> Loading site details…</div>:detail?<SiteDetail site={detail} scoreOverride={Number(weightedSites.find(site=>site.site_id===selectedId)?.user_weighted_score)} context={siteContext} contextLoading={contextLoading} contextError={contextError} showFullPageLink/>:<div className="drawer-loading">Site details unavailable.</div>}</aside></div>}
  </div>
}
function displaySiteName(site: Site) { return site.site_name ? `${site.site_name}${site.state ? `, ${site.state}` : ""}` : `Solar site ${site.lat.toFixed(2)}°N · ${Math.abs(site.lon).toFixed(2)}°${site.lon < 0 ? "W" : "E"}` }
function formatNumber(value?: number) { return value == null ? "—" : new Intl.NumberFormat("en-US", {maximumFractionDigits:1}).format(value) }
function formatPercent(value?: number) { return value == null ? "—" : `${(value <= 1 ? value*100 : value).toFixed(1)}%` }
