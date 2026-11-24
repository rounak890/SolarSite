import { NextResponse } from "next/server"

type ZoningRestriction = {
  type: "zoning" | "land_use" | "setback" | "height_limit"
  description: string
  affected_area?: string
  severity: "low" | "medium" | "high"
}

type PermitRequirement = {
  type: "building_permit" | "electrical_permit" | "interconnection" | "environmental"
  description: string
  status: "required" | "optional" | "exempt"
}

type ProtectedAreaOverlap = {
  type: "wildlife_refuge" | "wetland" | "forest_conservation" | "cultural_site"
  description: string
  distance_km: number
  status: "within" | "buffer_zone"
}

type GridConnectionFeasibility = {
  status: "feasible" | "challenging" | "not_feasible"
  nearest_substation_km: number
  capacity_mw: number | null
  notes?: string
}

type SolarRuleAnalysis = {
  lat: number
  lon: number
  zoning_restrictions: ZoningRestriction[]
  permit_requirements: PermitRequirement[]
  protected_area_overlaps: ProtectedAreaOverlap[]
  grid_connection: GridConnectionFeasibility
  flagged_restrictions: string[]
  source_notes: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get("lat") ? Number(searchParams.get("lat")) : null
  const lon = searchParams.get("lon") ? Number(searchParams.get("lon")) : null

  if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: "lat and lon query parameters are required" }, { status: 400 })
  }

  // TODO: Replace with real lookups (zoning DB, permit database, protected areas, grid data).
  // For now, provide placeholder analysis based on coarse state lookup.

  // Simple state inference from lat/lon (India-focused approximate)
  let state: string = "Maharashtra" // placeholder; real implementation would geocode

  // Mock data generation (example only)
  const zoning: ZoningRestriction[] = []
  if (state === "Maharashtra") {
    zoning.push({
      type: "setback",
      description: "Minimum 6 m setback from road centerline required for solar installations.",
      severity: "medium",
    })
    zoning.push({
      type: "height_limit",
      description: "Maximum panel height 3 m above ground in residential zones.",
      severity: "low",
    })
  } else {
    zoning.push({
      type: "zoning",
      description: "Solar conversion requires change-of-use approval from municipal corporation.",
      severity: "high",
    })
  }

  const permits: PermitRequirement[] = [
    {
      type: "building_permit",
      description: "Standard building permit for structural mounting; approval time ~30 days.",
      status: "required",
    },
    {
      type: "electrical_permit",
      description: "Electrical safety compliance and net-metering application.",
      status: "required",
    },
  ]

  const protectedAreas: ProtectedAreaOverlap[] = []
  if (state === "Kerala") {
    protectedAreas.push({
      type: "wetland",
      description: "Nearest wetland within 2 km; environmental clearance required.",
      distance_km: 1.8,
      status: "buffer_zone",
    })
  }

  const grid: GridConnectionFeasibility = {
    status: "feasible",
    nearest_substation_km: 3.2,
    capacity_mw: 5,
    notes: "Nearest 11 kV substation within 5 km; interconnection application recommended.",
  }

  const flagged: string[] = []
  if (zoning.some(z => z.severity === "high")) flagged.push("High-severity zoning restriction – consult municipal planner.")
  if (protectedAreas.some(p => p.status === "within")) flagged.push("Protected area overlap – further study required.")

  const sourceNotes = "Rules synthesized from Maharashtra State Solar Policy (2023) and typical Indian municipal regulations. Verify with local authorities."

  const analysis: SolarRuleAnalysis = {
    lat,
    lon,
    zoning_restrictions: zoning,
    permit_requirements: permits,
    protected_area_overlaps: protectedAreas,
    grid_connection: grid,
    flagged_restrictions: flagged,
    source_notes: sourceNotes,
  }

  return NextResponse.json(analysis)
}