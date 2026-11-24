"use client"

import { useCallback, useEffect, useState } from "react"

/** Fetches the solar‑rules analysis from the API and renders it in collapsible sections. */
export function SolarRulesDisplay({ lat, lon }: { lat: number; lon: number }) {
  const [analysis, setAnalysis] = useState<SolarRuleAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalysis = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/solar-rules?lat=${lat}&lon=${lon}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as SolarRuleAnalysis
      setAnalysis(data)
    } catch (e: any) {
      setError(e.message || "Failed to load solar rules")
    } finally {
      setLoading(false)
    }
  }, [lat, lon])

  useEffect(() => {
    fetchAnalysis()
  }, [fetchAnalysis])

  if (loading) return <p className="context-note">Analyzing solar rules…</p>
  if (error) return <p className="context-note policy-search-error">{error}</p>
  if (!analysis) return null

  return (
    <section className="context-section">
      <div className="detail-section-title">
        <span>SOLAR RULES & REGULATIONS</span>
        <span className="status-pill tier">AI‑AGENT INSIGHT</span>
      </div>

      {/* ZONING */}
      <details>
        <summary>Zoning / Land‑Use Restrictions</summary>
        <p>{analysis.zoning.note}{" "}
        <span style={{ color: analysis.zoning.severity === "high" ? "#b00" : analysis.zoning.severity === "medium" ? "#b50" : "#0a0" }}>
          Severity: {analysis.zoning.severity}</span></p>
        {analysis.zoning.zoning_restrictions?.map((r, i) => (
          <div key={i} style={{ marginTop: "0.5rem" }}>
            <strong>{r.type}:</strong> {r.description}
          </div>
        ))}
      </details>

      {/* PERMITS */}
      <details>
        <summary>Permit Requirements</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <p><strong>Building permit:</strong> {analysis.permits.building.required ? "Required" : "Not required"} – {analysis.permits.building.note}</p>
          <p><strong>Electrical permit:</strong> {analysis.permits.electrical.required ? "Required" : "Not required"} – {analysis.permits.electrical.note}</p>
          <p><strong>Interconnection permit:</strong> {analysis.permits.interconnection.required ? "Required" : "Not required"} – {analysis.permits.interconnection.note}</p>
          <p><strong>Environmental permit:</strong> {analysis.permits.environmental.required ? "Required" : "Not required"} – {analysis.permits.environmental.note}</p>
        </div>
      </details>

      {/* PROTECTED AREAS */}
      <details>
        <summary>Protected‑Area Overlaps</summary>
        {analysis.protectedAreas.length > 0 ? (
          analysis.protectedAreas.map((pa, i) => (
            <div key={i} style={{ marginTop: "0.5rem" }}>
              <strong>{pa.name} ({pa.type}):</strong> {pa.description} – {pa.distance_km} km ({pa.status})
            </div>
          ))
        ) : (
          <p>No protected areas detected within 10 km.</p>
        )}
      </details>

      {/* GRID CONNECTION */}
      <details>
        <summary>Grid‑Connection Feasibility</summary>
        <p>
          <strong>Nearest substation:</strong> {analysis.gridConnection.nearestSubstationKm} km{" "}
        </p>
        <p><strong>Feasible:</strong> {analysis.gridConnection.feasible ? "Yes" : "No"} – {analysis.gridConnection.note}</p>
        {analysis.gridConnection.capacityMw && (
          <p><strong>Noted capacity:</strong> {analysis.gridConnection.capacityMw} MW</p>
        )}
      </details>

      {/* FLAGGED RESTRICTIONS */}
      {analysis.flagged.length > 0 && (
        <details>
          <summary>Flagged Restrictions (<span style={{ color: "red" }}>{analysis.flagged.length}</span>)</summary>
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.2rem" }}>
            {analysis.flagged.map((f, i) => (
              <li key={i} style={{ color: f.severity === "high" ? "#b00" : f.severity === "medium" ? "#b50" : "#0a0" }}>
                [{f.severity.toUpperCase()}] {f.description}
              </li>
            ))
          </ul>
        </div>
      )}

      {/* SOURCE NOTE */}
      <p className="context-attribution" style={{ fontSize: "0.85rem", marginTop: "0.8rem", color: "#555" }}>
        {analysis.sourceNote}
      </p>
    </section>
  )
}

/** Type – matches the structure returned by /api/solar-rules */
type SolarRuleAnalysis = {
  zoning: {
    status: "clear" | "restricted" | "prohibited"
    note: string
    severity: "low" | "medium" | "high"
    zoning_restrictions?: { type: string; description: string }[]
  }
  permits: {
    building: { required: boolean; note: string }
    electrical: { required: boolean; note: string }
    interconnection: { required: boolean; note: string }
    environmental: { required: boolean; note: string }
  }
  protectedAreas: { name: string; type: string; distance_km: number; status: "inside" | "nearby" }[]
  gridConnection: {
    nearestSubstationKm: number
    capacityMw?: number
    feasible: boolean
    note: string
  }
  flagged: { category: string; description: string; severity: "low" | "medium" | "high" }[]
  sourceNote: string
}