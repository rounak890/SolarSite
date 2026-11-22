export type Site = {
  site_id: string
  site_name?: string | null
  state?: string | null
  location?: { area?: string | null; city?: string | null; state?: string | null }
  sample_type?: "state_anchor" | "grid_sample" | string
  lat: number
  lon: number
  suitability_score: number
  regime_label: string
  mean_daily_yield_kwh: number
  variability_cv: number
  seasonal_stability: number
  peak_monthly_yield_kwh?: number | null
  peak_yield_month?: string | null
  lowest_monthly_yield_kwh?: number | null
  lowest_yield_month?: string | null
  top_k_freq?: number | null
  forecast_next_day_clearness: number
  forecast_interval_80: [number, number]
  data_sources: Record<string, unknown>
  [key: string]: unknown
}

export type SiteContext = {
  sources: string[]
  elevation: { value_m: number | null; dataset: string; status: string }
  grid_infrastructure: {
    status: string
    search_radius_km: number
    substations_found: number | null
    nearest_substation_km: number | null
    transmission_lines_found: number | null
    nearest_transmission_line_km: number | null
    source: string
  }
  protected_area_screen: {
    status: string
    osm_features_within_5km: number | null
    note: string
    nearby_features?: { name?: string | null; distance_km: number }[]
  }
  policy_research: { state?: string | null; status: string; checks: string[]; search_url: string; note: string }
}

export type PolicySearchResult = { title: string; url: string; domain: string; description: string; published?: string | null }
export type PolicySearchResponse = { state: string; query: string; provider: string; results: PolicySearchResult[] }

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function fetchSites(): Promise<Site[]> {
  const response = await fetch(`${API_URL}/sites`, { cache: "no-store" })
  if (!response.ok) throw new Error(`Site request failed: ${response.status}`)
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error("Expected /sites to return an array")
  return payload as Site[]
}

export async function fetchSite(siteId: string): Promise<Site> {
  const response = await fetch(`${API_URL}/sites/${encodeURIComponent(siteId)}`, { cache: "no-store" })
  if (!response.ok) throw new Error(`Site request failed: ${response.status}`)
  return await response.json() as Site
}

export async function fetchSiteContext(lat: number, lon: number): Promise<SiteContext> {
  const response = await fetch(`${API_URL}/site-context?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, { cache: "no-store" })
  if (!response.ok) throw new Error(`Site context request failed: ${response.status}`)
  return await response.json() as SiteContext
}

export async function fetchPolicySearch(state: string, lat: number, lon: number): Promise<PolicySearchResponse> {
  const params = new URLSearchParams({ state, lat: String(lat), lon: String(lon) })
  const response = await fetch(`${API_URL}/policy-search?${params}`, { cache: "no-store" })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail || `Policy search failed: ${response.status}`)
  }
  return await response.json() as PolicySearchResponse
}

/** Enhanced policy search that pre‑pends "solar" to the query,
 * making it far more likely to return solar‑installation‑relevant results
 * (net‑metering rules, state solar policies, environmental clearances, etc.). */
export async function fetchSolarPolicySearch(state: string, lat: number, lon: number): Promise<PolicySearchResponse> {
  const searchQuery = `solar installation regulations ${state || ""} ${lat} ${lon}`.trim()
  const params = new URLSearchParams({ state, lat: String(lat), lon: String(lon), query: searchQuery })
  const response = await fetch(`${API_URL}/policy-search?${params}`, { cache: "no-store" })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail || `Solar policy search failed: ${response.status}`)
  }
  return await response.json() as PolicySearchResponse
}

/** Enhanced policy search that specifically looks for solar‑related regulations. */
export async function fetchSolarPolicySearch(state: string, lat: number, lon: number): Promise<PolicySearchResponse> {
  // Build search query that includes solar keywords; the backend web‑search provider
  // may already filter by domain, but we prepend "solar" to focus results.
  const searchQuery = `solar installation regulations ${state} ${lat} ${lon}`
  const params = new URLSearchParams({ state, lat: String(lat), lon: String(lon), query: searchQuery })
  const response = await fetch(`${API_URL}/policy-search?${params}`, { cache: "no-store" })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail || `Solar policy search failed: ${response.status}`)
  }
  return await response.json() as PolicySearchResponse
}

export class LiveAnalysisError extends Error {
  constructor(public readonly status?: number) {
    super(`Live analysis failed${status ? `: ${status}` : ""}`)
    this.name = "LiveAnalysisError"
  }
}

export async function analyzeSite(lat: number, lon: number): Promise<Partial<Site>> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/analyze?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, { cache: "no-store" })
  } catch {
    throw new LiveAnalysisError()
  }
  if (!response.ok) throw new LiveAnalysisError(response.status)
  return await response.json() as Partial<Site>
}

export function siteColor(score: number) {
  if (score < 60) return "#c62828"
  if (score < 80) return "#d49b11"
  return "#00966b"
}
