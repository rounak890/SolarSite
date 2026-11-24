import { NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "Valid lat and lon query parameters are required" }, { status: 400 });
  }

  const upstream = new URL("/site-context", API_URL);
  upstream.searchParams.set("lat", String(lat));
  upstream.searchParams.set("lon", String(lon));

  try {
    const response = await fetch(upstream, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.detail || `Site context service returned ${response.status}` },
        { status: response.status },
      );
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Site context service unavailable:", error);
    return NextResponse.json({ error: "Site context service is unavailable" }, { status: 502 });
  }
}
