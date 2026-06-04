// TurfMap — Map 2, the Atlas-Earth-style continuous top-down view.
//
// A real dark slippy map (Leaflet + Carto dark tiles) you pan and zoom freely.
// This map is dedicated to the BLOCK / NPC economy: recruit / poach / collect
// turf, block by block. Trap houses, businesses, and mob mansions deliberately
// do NOT live here — they get their own map view in a separate tab so this one
// stays a clean "take over the blocks" surface. County borders + a live
// county-name HUD help you track which area you're working.

import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { geoBounds, geoContains } from 'd3-geo'
import { GRID, getBlock, subscribeBlocks, CREW_COLORS } from '../state/blocksStore'

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const GOLD = '#c9a84c'

export function TurfMap({ center, label, counties, onBlockTap, onBack, trapHouse, onTrapHouseTap }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const onBlockTapRef = useRef(onBlockTap)
  const onTrapTapRef = useRef(onTrapHouseTap)
  const [countyName, setCountyName] = useState(label || '')   // live "which county am I in" HUD
  onBlockTapRef.current = onBlockTap
  onTrapTapRef.current = onTrapHouseTap

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

  // Block grid (street-zoom economic layer). A large uniform ~1.8km (4×4 merged) grid laid
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
      const b = map.getBounds()
      const x0 = Math.floor(b.getWest() / GRID), x1 = Math.ceil(b.getEast() / GRID)
      const y0 = Math.floor(b.getSouth() / GRID), y1 = Math.ceil(b.getNorth() / GRID)
      // No hard zoom floor — let the count cap decide. Now that blocks are the
      // ~1.8km merged unit, a viewport holds 16× fewer, so you can pan/zoom way
      // out and still see colored turf (a generous metro-wide view). Past the cap
      // it's too zoomed out for blocks to be useful, so we stop drawing.
      if ((x1 - x0) * (y1 - y0) > 3000) return
      const showIcons = map.getZoom() >= 13    // NPC icons only up close (perf + clutter)
      layer = L.layerGroup().addTo(map)
      for (let gx = x0; gx < x1; gx++) for (let gy = y0; gy < y1; gy++) {
        const blk = getBlock(gx, gy)
        if (blk.land === false) continue   // ocean / Canada / Mexico — off the board, draw nothing
        const owner = blk.owner
        const color = owner ? (owner === 'you' ? CREW_COLORS.you : blk.color) : '#3a3a4a'
        const w = gx * GRID, s = gy * GRID
        const rect = L.rectangle([[s, w], [s + GRID, w + GRID]], {
          color, weight: owner ? 1.5 : 0.5, opacity: owner ? 0.9 : 0.3,
          fillColor: owner ? color : '#888', fillOpacity: owner ? 0.18 : 0.04, interactive: true,
        }).addTo(layer)
        rect.on('click', () => onBlockTapRef.current && onBlockTapRef.current(gx, gy))
        if (owner && showIcons) {
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

  // Your gang's Trap House — a single marker at your home turf. Tap it to open
  // the grow-and-sell shop. (Phase 2: map presence. Raids land in Phase 3.)
  const tLat = trapHouse ? trapHouse.lat : null
  const tLng = trapHouse ? trapHouse.lng : null
  useEffect(() => {
    const map = mapRef.current
    if (!map || tLat == null || tLng == null) return
    const icon = L.divIcon({
      className: '', iconSize: [44, 52], iconAnchor: [22, 46],
      html: `<div style="text-align:center;cursor:pointer">
        <div style="width:38px;height:38px;border-radius:11px;background:#1a1510;border:2px solid ${GOLD};display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 8px rgba(0,0,0,.7);margin:0 auto">🏚️</div>
        <div style="margin:2px auto 0;width:8px;height:8px;background:${GOLD};transform:rotate(45deg);box-shadow:0 1px 3px rgba(0,0,0,.6)"></div>
      </div>`,
    })
    const m = L.marker([tLat, tLng], { icon, zIndexOffset: 1000 }).addTo(map)
    m.on('click', () => onTrapTapRef.current && onTrapTapRef.current())
    return () => { try { map.removeLayer(m) } catch {} }
  }, [tLat, tLng])

  // County borders + the live "which county am I in" HUD. Faint outlines for the
  // counties in view (so you can see where the lines are as you roam), the
  // county under the map CENTER highlighted gold, and its name pushed to the
  // top-right chip. Recomputed on every pan/zoom — cross a county line and the
  // name flips, so you always know what turf you're working. Bounding boxes are
  // precomputed once; a cheap bbox test prefilters before the precise contains.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !counties || !counties.features) return
    const feats = counties.features.map(f => ({ f, name: f.properties?.name || '', bbox: geoBounds(f) }))
    const inBox  = (bb, lng, lat) => lng >= bb[0][0] && lng <= bb[1][0] && lat >= bb[0][1] && lat <= bb[1][1]
    const hitsView = (bb, b) => !(bb[1][0] < b.getWest() || bb[0][0] > b.getEast() || bb[1][1] < b.getSouth() || bb[0][1] > b.getNorth())

    let layer = null
    const draw = () => {
      if (layer) { try { map.removeLayer(layer) } catch {}; layer = null }
      const c = map.getCenter()
      // Which county holds the center point (bbox prefilter → precise contains).
      const cur = feats.find(x => inBox(x.bbox, c.lng, c.lat) && geoContains(x.f, [c.lng, c.lat]))
      setCountyName(cur ? `${cur.name} County` : '')
      // Outline the counties in view (capped for perf), current one in gold.
      const b = map.getBounds()
      const vis = feats.filter(x => hitsView(x.bbox, b))
      if (vis.length && vis.length <= 400) {
        layer = L.layerGroup().addTo(map)
        vis.forEach(x => {
          const isCur = cur && x.f === cur.f
          L.geoJSON(x.f, {
            interactive: false,
            style: { color: isCur ? GOLD : '#8a8a9a', weight: isCur ? 2.5 : 0.6, opacity: isCur ? 0.95 : 0.35, fill: false },
          }).addTo(layer)
        })
      }
    }
    map.on('moveend zoomend', draw)
    draw()
    return () => { map.off('moveend zoomend', draw); if (layer) { try { map.removeLayer(layer) } catch {} } }
  }, [counties])

  return (
    <div className="app-overlay" style={{ position: 'fixed', inset: 0, background: '#0a0a0f', zIndex: 210, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 8px' }}>
        <button className="btn btn-dark" onClick={onBack} style={{ padding: '8px 12px', fontSize: 13 }}>
          <i className="ti ti-arrow-left" /> Map
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Turf Map</div>
          <div style={{ color: '#555', fontSize: 11 }}>drag to roam · pinch to zoom · tap a block to take it over</div>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: '#0d0d15' }} />
        {/* Jump to your gang's Trap House on the map. */}
        {trapHouse && (
          <button
            onClick={() => { const m = mapRef.current; if (m) m.flyTo([trapHouse.lat, trapHouse.lng], 15, { duration: 0.8 }) }}
            style={{
              position: 'absolute', bottom: 16, left: 12, zIndex: 500,
              background: 'rgba(26,21,16,0.92)', border: `0.5px solid ${GOLD}88`, borderRadius: 10,
              padding: '9px 13px', color: GOLD, fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3,
              boxShadow: '0 2px 8px rgba(0,0,0,.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            🏚️ My Trap House
          </button>
        )}
        {/* Live "you are in" county chip — updates as you pan across county lines. */}
        {countyName && (
          <div style={{
            position: 'absolute', top: 10, right: 10, zIndex: 500,
            background: 'rgba(13,13,21,0.88)', border: `0.5px solid ${GOLD}66`,
            borderRadius: 10, padding: '6px 11px', color: GOLD, fontSize: 13, fontWeight: 700,
            letterSpacing: 0.3, pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,.5)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <i className="ti ti-map-pin" /> {countyName}
          </div>
        )}
      </div>
    </div>
  )
}
