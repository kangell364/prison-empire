// US country-view SVG map. Renders the 50 states as polygons via d3-geo's
// Albers USA projection (which auto-positions AK + HI as insets). Each state
// is tappable; coloring is driven by the `colorFor` callback so callers can
// drive the palette from whatever ownership data they have.

import React, { useMemo, useRef, useState } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { useMapData, STATE_FIPS_TO_CODE } from '../state/mapData'

const VIEW_W = 960
const VIEW_H = 600

const DEFAULT_COLOR = '#1e1e2a'
const STROKE        = '#2a2a3a'
const STROKE_HOVER  = '#c9a84c'

const MIN_SCALE = 1
const MAX_SCALE = 8
// Anything past this in client px since pointerdown counts as a drag, not a tap.
const TAP_SLOP_PX = 6

// Props:
//   colorFor(stateFips, postalCode) → string  — fill color for that state
//   onStateClick(stateFeature)               — tap handler (Phase 3b drills in)
//   height                                    — CSS height; width is responsive
//   label                                     — optional title shown above the map
export function USCountryMap({ colorFor, onStateClick, height = '58vh' }) {
  const { data, error } = useMapData()
  const [hover, setHover] = useState(null)
  const containerRef = useRef(null)

  // Pinch-zoom + pan transform applied to the inner <g>.
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const pointersRef = useRef(new Map())
  const pinchRef = useRef(null)
  const dragMovedRef = useRef(0)

  function clientToViewBox(clientX, clientY) {
    const r = containerRef.current.getBoundingClientRect()
    return {
      x: ((clientX - r.left) / r.width)  * VIEW_W,
      y: ((clientY - r.top)  / r.height) * VIEW_H,
    }
  }

  function clamp(s) { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)) }

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
      const [a, b] = [...pointersRef.current.values()]
      const newDist = Math.hypot(b.x - a.x, b.y - a.y)
      const newMid  = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const ratio = newDist / pinchRef.current.dist
      const midSvg = clientToViewBox(pinchRef.current.mid.x, pinchRef.current.mid.y)
      zoomAt(midSvg.x, midSvg.y, ratio)
      pinchRef.current = { dist: newDist, mid: newMid }
      dragMovedRef.current += TAP_SLOP_PX + 1
    } else if (pointersRef.current.size === 1) {
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

  function handleStateClick(p) {
    if (dragMovedRef.current > TAP_SLOP_PX) return
    if (onStateClick) onStateClick({ fips: p.id, code: p.code, name: p.name })
  }

  function resetView() { setView({ scale: 1, tx: 0, ty: 0 }) }

  // Project once data is ready. Albers USA handles the 50 states + DC and
  // produces a fitted projection so the country fills the viewBox.
  const { paths, labels } = useMemo(() => {
    if (!data) return { paths: [], labels: [] }
    const proj = geoAlbersUsa().fitSize([VIEW_W, VIEW_H], data.states)
    const path = geoPath(proj)
    const paths = data.states.features.map(f => ({
      id:   String(f.id),
      name: f.properties.name,
      code: STATE_FIPS_TO_CODE[String(f.id)] || '?',
      d:    path(f),
      centroid: path.centroid(f),
    }))
    // Filter to skip territories (no AS/GU/etc in our city data) — they're
    // also off-projection so paths come back null for them.
    const inProjection = paths.filter(p => p.d != null)
    return {
      paths: inProjection,
      labels: inProjection.filter(p => {
        // Hide labels on the tiniest states so they don't overlap their neighbors.
        const [x, y] = p.centroid
        return Number.isFinite(x) && Number.isFinite(y)
      }),
    }
  }, [data])

  if (error) {
    return (
      <div style={{
        height, background: '#0d0d15', border: '0.5px solid #8b1a1a',
        borderRadius: 16, padding: 16, color: '#ff8a8a', fontSize: 12,
      }}>
        Map data failed to load: {error.message}
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
        LOADING TERRITORY DATA…
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
        touchAction: 'none',
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
          {/* State polygons */}
          {paths.map(p => {
            const isHover = hover === p.id
            // Counter-scale so borders don't get chunky when zoomed in.
            const sw = (isHover ? 1.4 : 0.6) / view.scale
            return (
              <path
                key={p.id}
                d={p.d}
                fill={colorFor ? colorFor(p.id, p.code) : DEFAULT_COLOR}
                stroke={isHover ? STROKE_HOVER : STROKE}
                strokeWidth={sw}
                onClick={() => handleStateClick(p)}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                style={{
                  cursor: onStateClick ? 'pointer' : 'default',
                  transition: 'stroke 0.15s',
                }}
              />
            )
          })}

          {/* State postal-code labels at centroids — also counter-scaled so the
              text stays the same screen size at any zoom level. */}
          <g pointerEvents="none">
            {labels.map(p => (
              <text
                key={p.id}
                x={p.centroid[0]}
                y={p.centroid[1]}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: '#666',
                  fontSize: 10 / view.scale,
                  fontWeight: 700,
                  letterSpacing: 0.5 / view.scale,
                  fontFamily: 'inherit',
                  userSelect: 'none',
                }}
              >{p.code}</text>
            ))}
          </g>
        </g>
      </svg>

      {hover && (
        <div style={{
          position: 'absolute', top: 10, left: 12,
          background: 'rgba(13,13,21,0.85)',
          border: '0.5px solid #2a2a3a',
          borderRadius: 8, padding: '5px 9px',
          color: '#c9a84c', fontSize: 11, fontWeight: 600,
          pointerEvents: 'none',
        }}>
          {paths.find(p => p.id === hover)?.name}
        </div>
      )}

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
