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
import { GRID, getBlock, subscribeBlocks, CREW_COLORS } from '../state/blocksStore'

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const GOLD = '#c9a84c'

function markerHtml(h) {
  const label = (txt, color = '#fff') =>
    `<div style="font:700 9px system-ui;color:${color};text-shadow:0 0 3px #000,0 0 3px #000;margin-top:1px;white-space:nowrap">${txt}</div>`

  if (h.kind === 'personal') {
    return `<div style="text-align:center;transform:translateY(-4px)">
      <img src="/trap-house-personal.png" style="width:34px;height:auto;display:block;margin:0 auto;filter:drop-shadow(0 2px 3px rgba(0,0,0,.7))"/>
      ${label(h.name + (h.isYou ? ' <span style="color:' + GOLD + '">(YOU)</span>' : ''))}
    </div>`
  }
  const glyph = h.kind === 'business' ? '🏪' : '🏛️'
  const color = h.color || GOLD
  return `<div style="text-align:center">
    <div style="width:32px;height:32px;border-radius:8px;background:#13131f;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto;box-shadow:0 2px 5px rgba(0,0,0,.7)">${glyph}</div>
    ${label(h.name)}
  </div>`
}

export function TurfMap({ houses, center, label, onScout, onBlockTap, onBack }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const housesRef = useRef(houses)
  const onScoutRef = useRef(onScout)
  const onBlockTapRef = useRef(onBlockTap)
  housesRef.current = houses
  onScoutRef.current = onScout
  onBlockTapRef.current = onBlockTap

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: center || [39.8283, -98.5795],
      zoom: center ? 14 : 5,
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

  // Block grid (street-zoom economic layer). A large uniform ~440m grid laid
  // over the map; blocks held by a crew are colored + have an NPC standing on
  // them, vacant blocks are faint claimable outlines. Only drawn at street zoom.
  // NOTE: owners are deterministic placeholders for now — the real loyalty-market
  // data model (recruit / poach / income) wires in next.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let layer = null
    const draw = () => {
      if (layer) { try { map.removeLayer(layer) } catch {}; layer = null }
      if (map.getZoom() < 13) return
      const b = map.getBounds()
      const x0 = Math.floor(b.getWest() / GRID), x1 = Math.ceil(b.getEast() / GRID)
      const y0 = Math.floor(b.getSouth() / GRID), y1 = Math.ceil(b.getNorth() / GRID)
      if ((x1 - x0) * (y1 - y0) > 700) return   // safety cap
      layer = L.layerGroup().addTo(map)
      for (let gx = x0; gx < x1; gx++) for (let gy = y0; gy < y1; gy++) {
        const blk = getBlock(gx, gy)
        const owner = blk.owner
        const color = owner ? (owner === 'you' ? CREW_COLORS.you : blk.color) : '#3a3a4a'
        const w = gx * GRID, s = gy * GRID
        const rect = L.rectangle([[s, w], [s + GRID, w + GRID]], {
          color, weight: owner ? 1.5 : 0.5, opacity: owner ? 0.9 : 0.3,
          fillColor: owner ? color : '#888', fillOpacity: owner ? 0.18 : 0.04, interactive: true,
        }).addTo(layer)
        rect.on('click', () => onBlockTapRef.current && onBlockTapRef.current(gx, gy))
        if (owner) {
          const npc = L.divIcon({ className: '', iconSize: [28, 36], iconAnchor: [14, 30], html: `<div style="text-align:center"><div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid #0a0a0f;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 4px rgba(0,0,0,.7);margin:0 auto">🕴️</div></div>` })
          L.marker([s + GRID / 2, w + GRID / 2], { icon: npc })
            .on('click', () => onBlockTapRef.current && onBlockTapRef.current(gx, gy)).addTo(layer)
        }
      }
    }
    map.on('moveend zoomend', draw)
    const unsub = subscribeBlocks(draw)   // redraw when blocks change
    draw()
    return () => { map.off('moveend zoomend', draw); unsub(); if (layer) { try { map.removeLayer(layer) } catch {} } }
  }, [])

  // Draw / redraw house markers when the set changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !houses) return
    const layer = L.layerGroup().addTo(map)
    houses.forEach(h => {
      if (typeof h.lat !== 'number' || typeof h.lng !== 'number') return
      const color = h.color || GOLD
      const d = 0.002   // ~220m half-side — a tight, Atlas-Earth-style lot
      const onTap = (h.kind === 'business' && h.facility) ? () => onScoutRef.current && onScoutRef.current(h.facility) : null

      // Glowing claimed parcel (soft halo + brighter plot) under the house.
      L.rectangle([[h.lat - d * 1.5, h.lng - d * 1.5], [h.lat + d * 1.5, h.lng + d * 1.5]],
        { stroke: false, fillColor: color, fillOpacity: 0.12, interactive: false }).addTo(layer)
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
