"use client"

import { useEffect, useState } from "react"
import { SolarRuleAnalysis } from "@/lib/sites"

interface SolarRulesDisplayProps {
  lat: number
  lon: number
}

export function SolarRulesDisplay({ lat, lon }: SolarRulesDisplayProps) {
  const [analysis, setAnalysis] = useState<SolarRuleAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const res = await fetch(`/api/solar-rules?lat=${lat}&lon=${lon}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as SolarRuleAnalysis
        setAnalysis(data)
      } catch (e: any) {
        setError(e instanceof Error ? e.message : "Failed to load solar rules.")
      } finally {
        setLoading(false)
      }
    }

    fetchAnalysis()
  }, [lat, lon])

  if (loading) {
    return <p>Loading solar rules…</p>
  }

  if (error) {
    return <p className="error">Error: {error}</p>
  }

  if (!analysis) {
    return <p>No solar rules data available.</p>
  }

  const { zoning_restrictions, permit_requirements, protected_area_overlaps, grid_connection, flagged_restrictions, source_notes } = analysis

  return (
    <section className="solar-rules-panel">
      <h2>Solar Installation Rules</h2>

      {/* Zoning / Land Use Restrictions */}
      <div className="subsection">
        <h3>Zoning / Land Use Restrictions</h3>
        {zoning_restrictions.map((z, i) => (
          <div key={i} className={`restriction severity-${z.severity}`}>
            <strong>{z.type}</strong>: {z.description}
            {z.affected_area && <span> · {z.affected_area}</span>}
          </div>
        ))}
        {zoning_restrictions.length === 0 && <p>None identified.</p>}
      </div>

      {/* Permit Requirements */}
      <div className="subsection">
        <h3>Permit Requirements</h3>
        {permit_requirements.map((p, i) => (
          <div key={i}>
            <strong>{p.type}</strong>: {p.description} <span>{p.status}</span>
          </div>
        ))}
        {permit_requirements.length === 0 && <p>None identified.</p>}
      </div>

      {/* Protected Area Overlaps */}
      <div className="subsection">
        <h3>Protected Area Overlaps</h3>
        {protected_area_overlaps.map((p, i) => (
          <div key={i} className={p.status === "within" ? "overlap-within" : "overlap-buffer"}>
            <strong>{p.type}</strong>: {p.description}
            <span> · {p.distance_km} km · {p.status}</span>
          </div>
        ))}
        {protected_area_overlaps.length === 0 && <p>No protected areas overlapping.</p>}
      </div>

      {/* Grid Connection Feasibility */}
      <div className="subsection">
        <h3>Grid Connection Feasibility</h3>
        <p>
          <strong>Status:</strong> {grid_connection.status}
          {grid_connection.notes && <br /> {grid_connection.notes}}
        </p>
        <p>
          <strong>Nearest substation:</strong> {grid_connection.nearest_substation_km} km
          {grid_connection.capacity_mw !== null && <br /> " capacity: " + grid_connection.capacity_mw + " MW"}
        </p>
      </div>

      {/* Flagged Restrictions */}
      {flagged_restrictions.length > 0 && (
        <div className="subsection flagged">
          <h3>Flagged Restrictions</h3>
          <ul>
            {flagged_restrictions.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Source Notes */}
      <p className="source-note">
        {source_notes}
      </p>
    </section>
  )
}