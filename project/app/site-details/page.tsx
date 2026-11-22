"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowLeft, Sun } from "lucide-react"
import { SiteDetail } from "@/components/site-detail"
import { analyzeSite, fetchSite, fetchSiteContext, type Site, type SiteContext } from "@/lib/sites"

export default function SiteDetailsPage() {
  const [site, setSite] = useState<Site | null>(null)
  const [context, setContext] = useState<SiteContext | null>(null)
  const [scoreOverride, setScoreOverride] = useState<number | undefined>()
  const [loading, setLoading] = useState(true)
  const [contextLoading, setContextLoading] = useState(true)
  const [error, setError] = useState(false)
  const [contextError, setContextError] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const siteId = params.get("siteId")
    const requestedScore = Number(params.get("score"))
    if (params.has("score") && Number.isFinite(requestedScore)) setScoreOverride(requestedScore)
    const lat = Number(params.get("lat"))
    const lon = Number(params.get("lon"))
    const isLive = !siteId && Number.isFinite(lat) && Number.isFinite(lon) && params.has("lat") && params.has("lon")
    if (!siteId && !isLive) {
      setError(true)
      setLoading(false)
      setContextLoading(false)
      return
    }

    let cancelled = false
    const load = siteId ? fetchSite(siteId) : analyzeSite(lat, lon).then(result => ({ ...result, site_id: result.site_id || `live_${lat}_${lon}`, lat, lon } as Site))
    load.then(value => { if (!cancelled) setSite(value) }).catch(() => { if (!cancelled) setError(true) }).finally(() => { if (!cancelled) setLoading(false) })
    load.then(value => fetchSiteContext(value.lat, value.lon)).catch(() => null).then(value => {
      if (cancelled) return
      if (value) setContext(value)
      else setContextError(true)
    }).finally(() => { if (!cancelled) setContextLoading(false) })
    return () => { cancelled = true }
  }, [])

  return <div className="app-shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-mark"><Sun size={19}/></span><span><strong>SolarSite</strong><small>Site Evaluation Platform</small></span></Link><nav><Link href="/">Map</Link><Link href="/rankings">Rankings</Link><Link href="/about">About</Link></nav></header>
    <main className="standalone-detail-page"><Link className="back-to-map" href="/"><ArrowLeft size={15}/> Back to map</Link>{loading ? <div className="drawer-loading"><span className="spinner"/> Loading complete site details…</div> : error || !site ? <section className="live-error-panel"><h2>Could not load this site</h2><p>Return to the map and open the site details again.</p></section> : <SiteDetail site={site} scoreOverride={scoreOverride} context={context} contextLoading={contextLoading} contextError={contextError}/>}</main>
  </div>
}
