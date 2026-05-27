// Single-state county map. Filters the bundled topojson to counties in the
// selected state (FIPS prefix match), reprojects to fit the state's bounding
// box, and renders each county as a clickable polygon.
//
// Coloring is delegated to a `colorFor(countyFips)` callback so the parent
// can drive the palette from whatever ownership data they have.

import React, { useMemo, useRef, useState } from 'react'
import { geoMercator, geoAlbers, geoPath } from 'd3-geo'
import { useMapData } from '../state/mapData'

const VIEW_W = 800
const VIEW_H = 600

const DEFAULT_COLOR = '#1e1e2a'
const STROKE        = '#2a2a3a'
const STROKE_HOVER  = '#c9a84c'

const MIN_SCALE = 1
const MAX_SCALE = 8
// A pointermove totaling more than this in client px counts as a drag, not a tap.
const TAP_SLOP_PX = 6

// FIPS '02' = Alaska — needs rotation to avoid the antimeridian breaking
// fitSize. Other states use plain Mercator which is good enough at the
// state scale.
function pickProjection(stateFips) {
  if (stateFips === '02') {
    return geoAlbers()
      .rotate([154, 0])
      .center([0, 62])
      .parallels([55, 65])
  }
  if (stateFips === '15') {
    // Hawaii — spread islands look better in an equal-area conic with a
    // mid-Pacific rotation than in raw Mercator.
    return geoAlbers()
      .rotate([157, 0])
      .center([0, 20])
      .parallels([8, 18])
  }
  return geoMercator()
}

// Props:
//   stateFips         — 2-digit FIPS code of the state to show
//   stateName         — display name (for empty-result message)
//   colorFor(fips,name)       → string  (fill)
//   strokeFor(fips,name)      → string  (outline; optional)
//   strokeWidthFor(fips,name) → number  (outline width; optional, default 0.6)
//   onCountyClick(county)
//   height            — CSS height
export function USStateMap({
  stateFips, stateName,
  colorFor, strokeFor, strokeWidthFor,
  onCountyClick, height = '58vh',
}) {
  const { data, error } = useMapData()
  const [hover, setHover] = useState(null)

  // Pinch-zoom + pan transform. The inner <g> renders at translate(tx,ty) scale(s).
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const containerRef = useRef(null)
  // Active pointers by pointerId — used to detect 1-finger drag vs 2-finger pinch.
  const pointersRef = useRef(new Map())
  // Snapshot of the previous pinch frame: distance + midpoint in client coords.
  const pinchRef = useRef(null)
  // Accumulated movement in client px since the last pointerdown. Anything past
  // TAP_SLOP_PX disables the click that would otherwise fire on the released county.
  const dragMovedRef = useRef(0)

  function clientToViewBox(clientX, clientY) {
    const r = containerRef.current.getBoundingClientRect()
    return {
      x: ((clientX - r.left) / r.width)  * VIEW_W,
      y: ((clientY - r.top)  / r.height) * VIEW_H,
    }
  }

  function clamp(s) { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)) }

  // Apply a zoom factor `ratio` anchored on the viewBox point (anchorX, anchorY).
  // Keeps the world point currently under the anchor stuck to the anchor after scaling.
  function zoomAt(anchorX, anchorY, ratio) {
    setView(v => {
      const newScale = clamp(v.scale * ratio)
      if (newScale === v.scale) return v
      const worldX = (anchorX - v.tx) / v.scale
      const worldY = (anchorY - v.ty) / v.scale
      return {
        scale: newScale,
        tx: anchorX - worldX * newScale,
        ty: anchorY - worldY * newScale,
      }
    })
  }

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    dragMovedRef.current = 0
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      pinchRef.current = {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        mid:  { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
    }
  }

  function onPointerMove(e) {
    if (!pointersRef.current.has(e.pointerId)) return
    const prev = pointersRef.current.get(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2 && pinchRef.current) {
      // Two-finger pinch: zoom by the ratio of new finger distance to old,
      // anchored on the midpoint between the fingers (in viewBox coords).
      const [a, b] = [...pointersRef.current.values()]
      const newDist = Math.hypot(b.x - a.x, b.y - a.y)
      const newMid  = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const ratio = newDist / pinchRef.current.dist
      const midSvg = clientToViewBox(pinchRef.current.mid.x, pinchRef.current.mid.y)
      zoomAt(midSvg.x, midSvg.y, ratio)
      pinchRef.current = { dist: newDist, mid: newMid }
      dragMovedRef.current += TAP_SLOP_PX + 1   // suppress click on release
    } else if (pointersRef.current.size === 1) {
      // One-finger pan — only when already zoomed in (otherwise pan is pointless
      // and would just stick the map off-center).
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      dragMovedRef.current += Math.abs(dx) + Math.abs(dy)
      if (view.scale > 1) {
        const r = containerRef.current.getBoundingClientRect()
        const dxV = (dx / r.width)  * VIEW_W
        const dyV = (dy / r.height) * VIEW_H
        setView(v => ({ ...v, tx: v.tx + dxV, ty: v.ty + dyV }))
      }
    }
  }

  function onPointerUp(e) {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
  }

  function handleCountyClick(p) {
    // Swallow the click that fires at the end of a pan/pinch gesture.
    if (dragMovedRef.current > TAP_SLOP_PX) return
    if (onCountyClick) onCountyClick({ fips: p.id, name: p.name })
  }

  function resetView() {
    setView({ scale: 1, tx: 0, ty: 0 })
  }

  const { paths, count } = useMemo(() => {
    if (!data) return { paths: [], count: 0 }
    // County FIPS = 5 digits. First 2 = state FIPS.
    const stateCounties = {
      type: 'FeatureCollection',
      features: data.counties.features.filter(f =>
        String(f.id).padStart(5, '0').startsWith(stateFips)
      ),
    }
    if (stateCounties.features.length === 0) return { paths: [], count: 0 }
    // Alaska's Aleutian Islands cross the antimeridian; Mercator + fitSize
    // sees the geometry as spanning the entire globe and produces a postage-
    // stamp result. A rotated Albers conic centred on Alaska puts the whole
    // state in one continuous frame.
    const proj = pickProjection(stateFips)
      .fitExtent([[20, 20], [VIEW_W - 20, VIEW_H - 20]], stateCounties)
    const path = geoPath(proj)
    return {
      paths: stateCounties.features.map(f => ({
        id:   String(f.id).padStart(5, '0'),
        name: f.properties.name,
        d:    path(f),
        centroid: path.centroid(f),
      })),
      count: stateCounties.features.length,
    }
  }, [data, stateFips])

  if (error) {
    return (
      <div style={{
        height, background: '#0d0d15', border: '0.5px solid #8b1a1a',
        borderRadius: 16, padding: 16, color: '#ff8a8a', fontSize: 12,
      }}>
        County data failed to load: {error.message}
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{
        height, background: '#0d0d15', borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#555', fontSize: 12, letterSpacing: 1.5,
      }}>
        LOADING COUNTIES…
      </div>
    )
  }

  if (paths.length === 0) {
    return (
      <div style={{
        height, background: '#0d0d15', borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#555', fontSize: 12,
      }}>
        No counties found for {stateName}.
      </div>
    )
  }

  const zoomed = view.scale > 1.001

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height,
        background: '#0d0d15',
        borderRadius: 16, overflow: 'hidden',
        position: 'relative',
        touchAction: 'none',   // we own the gestures inside the map
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          {paths.map(p => {
            const isHover = hover === p.id
            const fill        = colorFor       ? colorFor(p.id, p.name)       : DEFAULT_COLOR
            const stroke      = strokeFor      ? strokeFor(p.id, p.name)      : STROKE
            const strokeWidth = strokeWidthFor ? strokeWidthFor(p.id, p.name) : 0.6
            // Counter-scale the stroke so outlines don't get thick when zoomed in.
            const renderedStroke = (isHover ? 1.8 : (strokeWidth ?? 0.6)) / view.scale
            return (
              <path
                key={p.id}
                d={p.d}
                fill={fill}
                stroke={isHover ? STROKE_HOVER : stroke}
                strokeWidth={renderedStroke}
                onClick={() => handleCountyClick(p)}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                style={{
                  cursor: onCountyClick ? 'pointer' : 'default',
                  transition: 'stroke 0.15s',
                }}
              />
            )
          })}
        </g>
      </svg>

      {/* County counter (bottom-right) */}
      <div style={{
        position: 'absolute', bottom: 10, right: 12,
        background: 'rgba(13,13,21,0.85)',
        border: '0.5px solid #2a2a3a',
        borderRadius: 8, padding: '4px 8px',
        color: '#888', fontSize: 10, fontWeight: 500,
        pointerEvents: 'none',
      }}>{count} counties</div>

      {/* Zoom badge + reset (top-right) — only when zoomed in */}
      {zoomed && (
        <button
          onClick={resetView}
          style={{
            position: 'absolute', top: 10, right: 12,
            background: 'rgba(13,13,21,0.85)',
            border: '0.5px solid #c9a84c66',
            borderRadius: 8, padding: '5px 9px',
            color: '#c9a84c', fontSize: 11, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {view.scale.toFixed(1)}× — Reset
        </button>
      )}

      {/* Hover/tap label (top-left) */}
      {hover && (
        <div style={{
          position: 'absolute', top: 10, left: 12,
          background: 'rgba(13,13,21,0.85)',
          border: '0.5px solid #2a2a3a',
          borderRadius: 8, padding: '5px 9px',
          color: '#c9a84c', fontSize: 11, fontWeight: 600,
          pointerEvents: 'none',
        }}>
          {paths.find(p => p.id === hover)?.name} County
        </div>
      )}

      {/* First-time hint, only at default zoom */}
      {!zoomed && (
        <div style={{
          position: 'absolute', bottom: 10, left: 12,
          color: '#555', fontSize: 10, letterSpacing: 0.5,
          pointerEvents: 'none',
        }}>
          Pinch to zoom · drag to pan
        </div>
      )}
    </div>
  )
}
