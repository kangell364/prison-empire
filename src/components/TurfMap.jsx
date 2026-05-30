// TurfMap — Map 2, the Atlas-Earth-style continuous top-down view.
//
// A real dark slippy map (Leaflet + Carto dark tiles) you pan and zoom freely,
// with every trap house placed as a marker on actual geography:
//   business — capturable county node (tap → scout/attack). Placeholder glyph.
//   personal — a player's home (the cut-out trap-house art).
//   mansion  — a mob HQ. Placeholder glyph.
// Opened centered on a tapped county; roam out to the whole country from there.
// Capturing a house recolors the overview map (Map 1) — same source of truth.

import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const GOLD = '#c9a84c'

function markerHtml(h) {
  const label = (txt, color = '#fff') =>
    `<div style="font:700 10px system-ui;color:${color};text-shadow:0 0 3px #000,0 0 3px #000,0 0 3px #000;margin-top:1px;white-space:nowrap">${txt}</div>`

  if (h.kind === 'personal') {
    return `<div style="text-align:center;transform:translateY(-6px)">
      <img src="/trap-house-personal.png" style="width:46px;height:auto;display:block;margin:0 auto;filter:drop-shadow(0 2px 3px rgba(0,0,0,.7))"/>
      ${label(h.name + (h.isYou ? ' <span style="color:' + GOLD + '">(YOU)</span>' : ''))}
    </div>`
  }
  const glyph = h.kind === 'business' ? '🏪' : '🏛️'
  const color = h.color || GOLD
  return `<div style="text-align:center">
    <div style="width:40px;height:40px;border-radius:9px;background:#13131f;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto;box-shadow:0 2px 5px rgba(0,0,0,.7)">${glyph}</div>
    ${label(h.name)}
    ${label(h.kind === 'business' ? 'BUSINESS' : 'MANSION', color)}
  </div>`
}

export function TurfMap({ houses, center, label, onScout, onBack }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const housesRef = useRef(houses)
  const onScoutRef = useRef(onScout)
  housesRef.current = houses
  onScoutRef.current = onScout

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: center || [39.8283, -98.5795],
      zoom: center ? 11 : 5,
      minZoom: 4, maxZoom: 18,
      maxBounds: [[15, -170], [72, -50]], maxBoundsViscosity: 0.7,
      zoomControl: true, attributionControl: false,
      dragging: true, tap: true,
    })
    mapRef.current = map
    L.tileLayer(DARK_TILES, { subdomains: 'abcd', maxZoom: 19, attribution: ATTRIBUTION }).addTo(map)
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)
    const t = setTimeout(() => { try { map.invalidateSize() } catch {} }, 150)
    return () => { clearTimeout(t); try { map.remove() } catch {}; mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Draw / redraw house markers when the set changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !houses) return
    const layer = L.layerGroup().addTo(map)
    houses.forEach(h => {
      if (typeof h.lat !== 'number' || typeof h.lng !== 'number') return
      const color = h.color || GOLD
      const d = 0.011   // ~1.2km half-side — a visible claimed plot
      const onTap = (h.kind === 'business' && h.facility) ? () => onScoutRef.current && onScoutRef.current(h.facility) : null

      // Glowing claimed parcel (soft halo + brighter plot) under the house.
      L.rectangle([[h.lat - d * 1.7, h.lng - d * 1.7], [h.lat + d * 1.7, h.lng + d * 1.7]],
        { stroke: false, fillColor: color, fillOpacity: 0.1, interactive: false }).addTo(layer)
      const plot = L.rectangle([[h.lat - d, h.lng - d], [h.lat + d, h.lng + d]],
        { color, weight: 2, opacity: 0.95, fillColor: color, fillOpacity: 0.22 }).addTo(layer)
      if (onTap) plot.on('click', onTap)

      const icon = L.divIcon({ className: 'turf-marker', iconSize: [60, 70], iconAnchor: [30, 56], html: markerHtml(h) })
      const m = L.marker([h.lat, h.lng], { icon }).addTo(layer)
      if (onTap) m.on('click', onTap)
    })
    return () => { try { map.removeLayer(layer) } catch {} }
  }, [houses])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', zIndex: 210, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 8px' }}>
        <button className="btn btn-dark" onClick={onBack} style={{ padding: '8px 12px', fontSize: 13 }}>
          <i className="ti ti-arrow-left" /> Map
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Turf Map</div>
          <div style={{ color: '#555', fontSize: 11 }}>{label || 'drag to roam · pinch to zoom'} · tap a business to scout</div>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: '#0d0d15' }} />
      </div>
    </div>
  )
}
