"use client"

import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMapEvents } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { Site } from "@/lib/sites"
import { siteColor } from "@/lib/sites"

const INDIA_BOUNDS: [[number, number], [number, number]] = [[6, 68], [37.5, 97.5]]
type Point = { lat: number; lon: number }

function MapClickHandler({ onMapClick }: { onMapClick: (point: Point) => void }) {
  useMapEvents({ click: (event) => onMapClick({ lat: event.latlng.lat, lon: event.latlng.lng }) })
  return null
}

export default function SitesMap({ sites, selectedId, livePoint, outsidePoint, onSelect, onMapClick }: {
  sites: Site[]
  selectedId: string | null
  livePoint: Point | null
  outsidePoint: Point | null
  onSelect: (id: string) => void
  onMapClick: (point: Point) => void
}) {
  return <div className="leaflet-wrap"><MapContainer center={[22, 79]} zoom={5} minZoom={5} maxBounds={INDIA_BOUNDS} maxBoundsViscosity={1} scrollWheelZoom className="leaflet-map" zoomControl={false}>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
    <MapClickHandler onMapClick={onMapClick}/>
    {sites.map(site=><CircleMarker key={site.site_id} center={[site.lat, site.lon]} radius={selectedId===site.site_id?10:7} pathOptions={{color:"#fff",weight:2,fillColor:siteColor(site.suitability_score),fillOpacity:.94}} eventHandlers={{click:(event)=>{event.originalEvent.stopPropagation();onSelect(site.site_id)}}}><Tooltip direction="top" offset={[0,-8]}><strong>{site.site_name || site.site_id}</strong>{site.state&&<><br/>{site.state}</>}<br/>Weather score {site.suitability_score.toFixed(1)}</Tooltip></CircleMarker>)}
    {livePoint&&<CircleMarker center={[livePoint.lat,livePoint.lon]} radius={9} pathOptions={{color:"#102a43",weight:2.5,dashArray:"4 4",fillColor:"#38bdf8",fillOpacity:.9}} eventHandlers={{click:(event)=>event.originalEvent.stopPropagation()}}>{outsidePoint&&<Popup autoPan={false} closeButton={false}><span className="outside-popup">Outside supported region</span></Popup>}<Tooltip direction="top" offset={[0,-8]}>Live site lookup</Tooltip></CircleMarker>}
  </MapContainer><div className="map-scale"><span/> 100 km</div><div className="map-click-hint">Click anywhere to analyze a site</div></div>
}
