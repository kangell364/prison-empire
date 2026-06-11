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
import { GRID, getBlock, subscribeBlocks, subscribeActivity, subscribePayout, CREW_COLORS } from '../state/blocksStore'
import { getMyGangId, subscribeGang } from '../state/gangStore'
import { blockColor } from '../state/gangTurf'

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const GOLD = '#c9a84c'
// Zoom the turf map opens at when entering a county — a metro-wide view (your
// trap house + surrounding turf in frame), NOT street level. Tune to taste.
const OPEN_ZOOM = 11

// --- Block shape -----------------------------------------------------------
// Prototype: draw each block as a HEXAGON (Million Lords look) instead of the
// uniform square grid. Flip HEX to false to restore the original squares.
// Ownership/income are unchanged — blocks are still keyed by (gx, gy); this
// only changes geometry + lattice, reinterpreting (gx, gy) as hex offset coords.
const HEX = false
// Counter Leaflet's Mercator vertical stretch so hexes read as REGULAR on
// screen (cos of Harris County's latitude). Without this they look squashed.
const HEX_ASPECT = Math.cos(29.76 * Math.PI / 180)
// Center-to-corner radius in degrees. sqrt(3)*R = GRID keeps column spacing
// (and thus block density across) identical to the old square grid.
const HEX_R = GRID / Math.sqrt(3)
const HEX_COL = Math.sqrt(3) * HEX_R   // lng step between columns
const HEX_ROW = 1.5 * HEX_R * HEX_ASPECT // lat step between rows (aspect-corrected)
// Pointy-top hex: 6 [lat,lng] corners around a center, aspect-corrected. `scale`
// grows the ring for the soft glow underlay drawn beneath owned blocks.
function hexCorners(cy, cx, scale = 1) {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30)
    pts.push([cy + HEX_R * scale * Math.sin(a) * HEX_ASPECT, cx + HEX_R * scale * Math.cos(a)])
  }
  return pts
}
// [lat,lng] center of block (gx,gy) on the active lattice (hex offset or square).
function blockCenter(gx, gy) {
  if (HEX) return [gy * HEX_ROW, gx * HEX_COL + (Math.abs(gy % 2) ? HEX_COL / 2 : 0)]
  return [gy * GRID + GRID / 2, gx * GRID + GRID / 2]
}

// --- Terrain tint ----------------------------------------------------------
// Prototype: tint each VACANT block by a deterministic "terrain" so the board
// reads as a varied honeycomb (Million Lords look) instead of uniform grey —
// but in the game's dark palette so it doesn't fight the crime aesthetic. The
// terrain is purely cosmetic and stable per block (same hash style the store
// uses for owners). Owned blocks keep their crew color. Flip to false for plain.
const TERRAIN = false
// Prototype: the "juice" layer — a soft glow under owned hexes + a pop burst when
// turf changes hands. This is the Million-Lords *feel* a static tint can't give.
const JUICE = true
// Dark, muted tiles: deep water, dim park-green, industrial tan, urban grey.
// Weighted mostly urban so the city still reads as a city, with pockets of
// green/water/industrial for texture.
const TERRAINS = [
  { p: 0.12, fill: '#1b3a5c', stroke: '#2c5680', opacity: 0.20 }, // water
  { p: 0.30, fill: '#2e4d2e', stroke: '#3f6b3f', opacity: 0.18 }, // park / green
  { p: 0.45, fill: '#4a3f2a', stroke: '#6b5a3a', opacity: 0.16 }, // industrial / tan
  { p: 1.00, fill: '#3a3a4a', stroke: '#50506a', opacity: 0.10 }, // urban grey
]
function terrainOf(gx, gy) {
  const h = Math.abs((Math.sin(gx * 41.17 + gy * 289.3) * 21971.7) % 1)
  for (const t of TERRAINS) if (h < t.p) return t
  return TERRAINS[TERRAINS.length - 1]
}

export function TurfMap({ center, label, counties, onBlockTap, onBack, trapHouse, trapHouseName, onTrapHouseTap, onHouseTap, otherHouses, myUserId, raidDrive, onRaidArrive }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const onBlockTapRef = useRef(onBlockTap)
  const onTrapTapRef = useRef(onTrapHouseTap)
  const onHouseTapRef = useRef(onHouseTap)
  const onRaidArriveRef = useRef(onRaidArrive)
  const [countyName, setCountyName] = useState(label || '')   // live "which county am I in" HUD
  onBlockTapRef.current = onBlockTap
  onTrapTapRef.current = onTrapHouseTap
  onHouseTapRef.current = onHouseTap
  onRaidArriveRef.current = onRaidArrive
  // Your owned blocks currently drawn on-screen — captured each redraw so the
  // hourly payout can pulse exactly the turf that's in view (no full re-scan).
  const ownedInViewRef = useRef([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    // Open centered on the player's own trap house (so it's in view) at a
    // metro-wide zoom; fall back to the county center, then the US view.
    const openCenter = (trapHouse && trapHouse.lat != null) ? [trapHouse.lat, trapHouse.lng] : center
    const map = L.map(containerRef.current, {
      center: openCenter || [39.8283, -98.5795],
      zoom: openCenter ? OPEN_ZOOM : 5,
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
  // over the map; blocks held by a crew are colored + have a trap house in their
  // center, vacant blocks are faint claimable outlines. Only drawn at street zoom.
  // NOTE: owners are deterministic placeholders for now — the real loyalty-market
  // data model (recruit / poach / income) wires in next.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let layer = null
    const draw = () => {
      if (layer) { try { map.removeLayer(layer) } catch {}; layer = null }
      const b = map.getBounds()
      // Hex lattice: columns step by GRID in lng (= sqrt(3)*HEX_R), rows step by
      // 1.5*HEX_R in lat (aspect-corrected). Squares step by GRID in both.
      const COL = HEX ? Math.sqrt(3) * HEX_R : GRID
      const ROW = HEX ? 1.5 * HEX_R * HEX_ASPECT : GRID
      const x0 = Math.floor(b.getWest() / COL) - 1, x1 = Math.ceil(b.getEast() / COL) + 1
      const y0 = Math.floor(b.getSouth() / ROW) - 1, y1 = Math.ceil(b.getNorth() / ROW) + 1
      // No hard zoom floor — let the count cap decide. Now that blocks are the
      // ~1.8km merged unit, a viewport holds 16× fewer, so you can pan/zoom way
      // out and still see colored turf (a generous metro-wide view). Past the cap
      // it's too zoomed out for blocks to be useful, so we stop drawing.
      if ((x1 - x0) * (y1 - y0) > 3000) return
      const showIcons = map.getZoom() >= OPEN_ZOOM  // trap-house icons from the default open zoom up (only owned blocks get one, so cheap)
      const myGangId = getMyGangId()                 // for the relative block coloring
      layer = L.layerGroup().addTo(map)
      const ownedHere = []                     // your blocks in this viewport (for payout pulse)
      for (let gx = x0; gx < x1; gx++) for (let gy = y0; gy < y1; gy++) {
        const blk = getBlock(gx, gy)
        if (blk.land === false) continue   // ocean / Canada / Mexico — off the board, draw nothing
        const owner = blk.owner
        const terr = (!owner && TERRAIN) ? terrainOf(gx, gy) : null
        // Relative 3-color allegiance: GOLD = your block, GREEN = your gang's
        // turf, RED = anyone else. Falls back to terrain/neutral when vacant.
        const color = owner ? blockColor(gx, gy, blk, myGangId) : (terr ? terr.stroke : '#3a3a4a')
        const [cy, cx] = blockCenter(gx, gy)
        // Juice: a soft, color-matched glow under owned blocks (a larger blurred
        // tile beneath) so held turf reads as "lit up", Million-Lords style. Works
        // on either shape — a scaled hex on the hex board, a grown square otherwise.
        const mine = owner === 'you'
        if (mine) ownedHere.push([gx, gy])
        if (JUICE && owner) {
          // Slightly richer glow on YOUR turf (bigger, warmer) so it reads as the
          // hero color; rivals get a tighter, dimmer halo. `.pe-mine-glow` is the
          // hook the hourly payout flashes.
          const glowStyle = {
            className: mine ? 'pe-hex-glow pe-mine-glow' : 'pe-hex-glow',
            stroke: false, fillColor: color,
            fillOpacity: mine ? 0.36 : 0.20, interactive: false,
          }
          const scale = mine ? 1.42 : 1.28
          const g = HEX
            ? L.polygon(hexCorners(cy, cx, scale), glowStyle)
            : L.rectangle([[cy - GRID * 0.5 * scale, cx - GRID * 0.5 * scale], [cy + GRID * 0.5 * scale, cx + GRID * 0.5 * scale]], glowStyle)
          g.addTo(layer)
        }
        const shapeStyle = {
          color, weight: owner ? 1.5 : 0.5, opacity: owner ? 0.9 : (terr ? 0.45 : 0.3),
          fillColor: owner ? color : (terr ? terr.fill : '#888'),
          fillOpacity: owner ? 0.18 : (terr ? terr.opacity : 0.04), interactive: true,
        }
        const shape = HEX
          ? L.polygon(hexCorners(cy, cx), shapeStyle)
          : L.rectangle([[cy - GRID / 2, cx - GRID / 2], [cy + GRID / 2, cx + GRID / 2]], shapeStyle)
        shape.addTo(layer)
        shape.on('click', () => onBlockTapRef.current && onBlockTapRef.current(gx, gy))
        if (owner && showIcons) {
          // A trap house centered in the middle of the owned block (replaces the
          // old standing-NPC figure), tinted by the owning crew's color.
          const house = L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: `<div style="width:28px;height:28px;border-radius:8px;background:${color};border:2px solid #0a0a0f;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 5px rgba(0,0,0,.7)">🏚️</div>` })
          L.marker([cy, cx], { icon: house })
            .on('click', () => onBlockTapRef.current && onBlockTapRef.current(gx, gy)).addTo(layer)
        }
      }
      ownedInViewRef.current = ownedHere
    }
    map.on('moveend zoomend', draw)
    const unsub = subscribeBlocks(draw)   // redraw when blocks change
    const unsubGang = subscribeGang(draw) // recolor when your gang allegiance changes
    draw()
    return () => { map.off('moveend zoomend', draw); unsub(); unsubGang(); if (layer) { try { map.removeLayer(layer) } catch {} } }
  }, [])

  // Juice: claim-burst pop. When turf changes hands, drop a one-shot animated
  // marker on that hex — gold "＋" when YOU take it, red "✕" when a rival takes
  // yours. Decoupled from the grid redraw so the pop plays cleanly then removes
  // itself. Fed by the block store's activity bus (recruit / poach / raid).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !JUICE) return
    return subscribeActivity(ev => {
      if (!ev || (ev.mine !== true && ev.tookFromMe !== true)) return
      const mine = ev.mine === true
      const col = mine ? CREW_COLORS.you : '#e74c3c'
      const [lat, lng] = blockCenter(ev.gx, ev.gy)
      const icon = L.divIcon({
        className: '', iconSize: [64, 64], iconAnchor: [32, 32],
        html: `<div class="pe-claim-burst" style="--c:${col}"><span class="ring"></span><span class="core">${mine ? '＋' : '✕'}</span></div>`,
      })
      const m = L.marker([lat, lng], { icon, interactive: false, zIndexOffset: 1500 }).addTo(map)
      setTimeout(() => { try { map.removeLayer(m) } catch {} }, 950)
    })
  }, [])

  // Juice: payout pulse. On the hourly block payout, your turf visibly "pays" —
  // every owned glow in view flashes once and a gold "＄" pops on a sample of
  // your blocks. Sampled (≤16) so a big empire doesn't carpet the map with
  // markers. Fed by the block store's payout bus (same tick that banks income).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !JUICE) return
    return subscribePayout(() => {
      // Flash the persistent gold glows already on the map (one-shot CSS class).
      const glows = document.querySelectorAll('.pe-mine-glow')
      glows.forEach(g => {
        g.classList.add('pe-glow-flash')
        setTimeout(() => { try { g.classList.remove('pe-glow-flash') } catch {} }, 1200)
      })
      // Pop a "＄" on a sample of your in-view blocks.
      const owned = ownedInViewRef.current || []
      if (!owned.length) return
      const step = Math.max(1, Math.ceil(owned.length / 16))
      const markers = []
      owned.forEach(([gx, gy], i) => {
        if (i % step !== 0) return
        const [lat, lng] = blockCenter(gx, gy)
        const icon = L.divIcon({
          className: '', iconSize: [64, 64], iconAnchor: [32, 32],
          html: `<div class="pe-claim-burst pe-payout-burst" style="--c:${CREW_COLORS.you}"><span class="ring"></span><span class="core">＄</span></div>`,
        })
        const mk = L.marker([lat, lng], { icon, interactive: false, zIndexOffset: 1400 }).addTo(map)
        markers.push(mk)
      })
      setTimeout(() => { markers.forEach(mk => { try { map.removeLayer(mk) } catch {} }) }, 1200)
    })
  }, [])

  // Your gang's Trap House — a single marker at your home turf. Tap it to open
  // the grow-and-sell shop. (Phase 2: map presence. Raids land in Phase 3.)
  const tLat = trapHouse ? trapHouse.lat : null
  const tLng = trapHouse ? trapHouse.lng : null
  useEffect(() => {
    const map = mapRef.current
    if (!map || tLat == null || tLng == null) return
    const myName = String(trapHouseName || 'You').replace(/[<>]/g, '')
    const icon = L.divIcon({
      className: '', iconSize: [44, 64], iconAnchor: [22, 46],
      html: `<div style="text-align:center;cursor:pointer">
        <div style="width:38px;height:38px;border-radius:11px;background:#1a1510;border:2px solid ${GOLD};display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 8px rgba(0,0,0,.7);margin:0 auto">🏚️</div>
        <div style="margin:2px auto 0;width:8px;height:8px;background:${GOLD};transform:rotate(45deg);box-shadow:0 1px 3px rgba(0,0,0,.6)"></div>
        <div style="margin:3px auto 0;font-size:9px;font-weight:700;color:${GOLD};background:rgba(0,0,0,.62);border-radius:4px;padding:1px 4px;white-space:normal;max-width:120px;line-height:1.2;display:inline-block">${myName}</div>
      </div>`,
    })
    const m = L.marker([tLat, tLng], { icon, zIndexOffset: 1000 }).addTo(map)
    m.on('click', () => onTrapTapRef.current && onTrapTapRef.current())
    return () => { try { map.removeLayer(m) } catch {} }
  }, [tLat, tLng, trapHouseName])

  // OTHER players' trap houses (the shared world). Red-tinted house pins with
  // the owner's name; excludes your own (which has its own gold pin above).
  const othersKey = (otherHouses || [])
    .filter(h => h.owner_id !== myUserId).map(h => `${h.id}:${h.lat}:${h.lng}:${h.name}`).join('|')
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const houses = (otherHouses || []).filter(h => h.owner_id !== myUserId && h.lat != null && h.lng != null)
    if (!houses.length) return
    const layer = L.layerGroup().addTo(map)
    houses.forEach(h => {
      const name = String(h.name || 'Player').replace(/[<>]/g, '')
      const icon = L.divIcon({ className: '', iconSize: [40, 48], iconAnchor: [20, 42], html: `<div style="text-align:center;cursor:pointer">
        <div style="width:32px;height:32px;border-radius:10px;background:#1a1015;border:2px solid #e74c3c;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 2px 8px rgba(0,0,0,.7);margin:0 auto">🏚️</div>
        <div style="margin-top:2px;font-size:9px;color:#fff;background:rgba(0,0,0,.62);border-radius:4px;padding:1px 4px;white-space:normal;max-width:120px;line-height:1.2;margin-left:auto;margin-right:auto;display:inline-block">${name}</div>
      </div>` })
      L.marker([h.lat, h.lng], { icon })
        .on('click', () => onHouseTapRef.current && onHouseTapRef.current(h))
        .addTo(layer)
    })
    return () => { try { map.removeLayer(layer) } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [othersKey])

  // Attack-car drive — the raid "en route" cinematic, SYNCED to the real attack
  // timer. The car leaves the attacker the moment the raid starts and travels at
  // constant speed so it ARRIVES exactly when the raid lands (ends_at) — the
  // drive length == the countdown the defender is watching, not a quick flourish
  // that finishes minutes early. Three beats:
  //   1. OUT  — attacker -> defender over (endsAt - startedAt), LINEAR so the
  //             car's position always == the raid's progress (so a reload
  //             mid-raid resumes the car in the right spot, not back at the start)
  //   2. HOLD — car vanishes at the defender's house (the hit goes down)
  //   3. BACK — a quick return defender -> attacker, then vanish at home
  // Falls back to a short distance-based drive if no timer is supplied.
  // The sprite faces LEFT by default, so it's flipped to face each leg's travel
  // direction. On completion it notifies the parent.
  const raidDriveId = raidDrive && raidDrive.id
  useEffect(() => {
    const map = mapRef.current
    if (!map || !raidDrive) return
    const { from, to, startedAt, endsAt } = raidDrive
    if (from == null || to == null) return

    const sepDeg = Math.sqrt((to.lat - from.lat) ** 2 + (to.lng - from.lng) ** 2)
    // OUT window: the live attack timer when present (car matches the countdown);
    // otherwise a short distance-based fallback. landAt is the wall-clock instant
    // the car reaches the defender — i.e. when the raid lands.
    const hasTimer = startedAt != null && endsAt != null && endsAt > startedAt
    const outStart = hasTimer ? startedAt : Date.now()
    const landAt   = hasTimer ? endsAt   : Date.now() + Math.round(Math.max(2500, Math.min(11000, (sepDeg / 0.26) * 11000)))
    const total    = Math.max(1, landAt - outStart)
    const HOLD = 1800
    // The return leg stays a quick flourish (never the full timer).
    const BACK = Math.round(Math.max(2500, Math.min(8000, (sepDeg / 0.26) * 8000)))
    const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2   // easeInOutQuad (BACK only)
    const outRight  = to.lng > from.lng       // heading toward defender
    const backRight = from.lng > to.lng       // heading back toward attacker
    const lerpOut = e => [from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e]

    let marker = null
    const makeMarker = (lat, lng, facingRight) => {
      const icon = L.divIcon({
        className: '', iconSize: [100, 42], iconAnchor: [50, 21],
        html: `<div style="transform:scaleX(${facingRight ? -1 : 1});filter:drop-shadow(0 4px 7px rgba(0,0,0,.65))">
          <img src="/attack-car.png" alt="" style="width:100px;display:block" />
        </div>`,
      })
      return L.marker([lat, lng], { icon, zIndexOffset: 2000, interactive: false }).addTo(map)
    }
    const removeMarker = () => { if (marker) { try { map.removeLayer(marker) } catch {} ; marker = null } }
    let pathLine = null
    const removePath = () => { if (pathLine) { try { map.removeLayer(pathLine) } catch {} ; pathLine = null } }

    // Frame both endpoints so the whole round trip stays in view.
    try { map.fitBounds([[from.lat, from.lng], [to.lat, to.lng]], { padding: [90, 90], maxZoom: 15, animate: true }) } catch {}

    // Pulsing dotted path from attacker -> defender for the duration of the raid run.
    pathLine = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
      color: '#e74c3c', weight: 2.5, dashArray: '2 9', lineCap: 'round',
      className: 'raid-path-line', interactive: false,
    }).addTo(map)

    // Spawn the car at its CURRENT progress so a reload mid-raid picks it up in
    // the right spot instead of snapping back to the attacker.
    const startE = Math.max(0, Math.min(1, (Date.now() - outStart) / total))
    marker = makeMarker(...lerpOut(startE), outRight)

    let raf = null, backStart = null, done = false
    const step = () => {
      const now = Date.now()
      if (now < landAt) {
        // 1. drive out — linear position == raid progress, arrives at landAt
        if (!marker) marker = makeMarker(...lerpOut(0), outRight)
        marker.setLatLng(lerpOut(Math.max(0, Math.min(1, (now - outStart) / total))))
        raf = requestAnimationFrame(step)
      } else if (now < landAt + HOLD) {
        // 2. the attack — car is gone while the hit goes down
        removeMarker()
        raf = requestAnimationFrame(step)
      } else if (now < landAt + HOLD + BACK) {
        // 3. drive back home (quick, eased)
        if (backStart == null) backStart = landAt + HOLD
        if (!marker) marker = makeMarker(to.lat, to.lng, backRight)
        const e = ease((now - backStart) / BACK)
        marker.setLatLng([to.lat + (from.lat - to.lat) * e, to.lng + (from.lng - to.lng) * e])
        raf = requestAnimationFrame(step)
      } else if (!done) {
        // arrived home — vanish + notify
        done = true
        removeMarker()
        removePath()
        onRaidArriveRef.current && onRaidArriveRef.current()
      }
    }
    raf = requestAnimationFrame(step)
    return () => { if (raf) cancelAnimationFrame(raf); removeMarker(); removePath() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raidDriveId])

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
