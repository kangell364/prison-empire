// US country-view SVG map. Renders the 50 states as polygons via d3-geo's
// Albers USA projection (which auto-positions AK + HI as insets). Each state
// is tappable; coloring is driven by the `colorFor` callback so callers can
// drive the palette from whatever ownership data they have.

import React, { useMemo, useState } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { useMapData, STATE_FIPS_TO_CODE } from '../state/mapData'
import { useMapGestures } from './useMapGestures'

const VIEW_W = 960
const VIEW_H = 600

const DEFAULT_COLOR = '#1e1e2a'
const STROKE        = '#2a2a3a'
const STROKE_HOVER  = '#c9a84c'

// Props:
//   colorFor(stateFips, postalCode) → string  — fill color for that state
//   onStateClick(stateFeature)               — tap handler (Phase 3b drills in)
//   height                                    — CSS height; width is responsive
//   marker      [lng, lat]                    — "you are here" flashing dot (your trap house)
export function USCountryMap({ colorFor, onStateClick, height = '58vh', marker }) {
  const { data, error } = useMapData()
  const [hover, setHover] = useState(null)
  const { view, ref, handlers, zoomed, resetView, suppressTap } =
    useMapGestures({ viewW: VIEW_W, viewH: VIEW_H })

  function handleStateClick(p) {
    if (suppressTap()) return
    if (onStateClick) onStateClick({ fips: p.id, code: p.code, name: p.name })
  }

  // Project once data is ready. Albers USA handles the 50 states + DC and
  // produces a fitted projection so the country fills the viewBox.
  const { paths, labels, markerXY } = useMemo(() => {
    if (!data) return { paths: [], labels: [], markerXY: null }
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
    // Project the "you are here" marker through the same Albers projection
    // (returns null if the point falls outside the contiguous-US/AK/HI insets).
    const mxy = marker && Number.isFinite(marker[0]) && Number.isFinite(marker[1])
      ? proj(marker) : null
    return {
      paths: inProjection,
      labels: inProjection.filter(p => {
        // Hide labels on the tiniest states so they don't overlap their neighbors.
        const [x, y] = p.centroid
        return Number.isFinite(x) && Number.isFinite(y)
      }),
      markerXY: mxy && Number.isFinite(mxy[0]) && Number.isFinite(mxy[1]) ? mxy : null,
    }
  }, [data, marker])

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

  return (
    <div
      ref={ref}
      {...handlers}
      style={{
        width: '100%', height,
        background: '#0d0d15',
        borderRadius: 16, overflow: 'hidden',
        position: 'relative',
        touchAction: 'none',
      }}
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

          {/* "You are here" — a GPS-blue flashing dot at your trap house. Blue
              (not gold) so it reads instantly as YOU and never blends into the
              gold "owned" state fill. Radii are counter-scaled so the dot keeps
              a constant screen size at any zoom level. */}
          {markerXY && (
            <g transform={`translate(${markerXY[0]} ${markerXY[1]})`} pointerEvents="none">
              <circle className="loc-ping-ring" r={5 / view.scale}
                fill="none" stroke="#4aa8ff" strokeWidth={1.5 / view.scale} />
              <circle r={4 / view.scale} fill="#4aa8ff" stroke="#0d0d15" strokeWidth={1 / view.scale} />
              <circle className="loc-ping-dot" r={4 / view.scale} fill="#4aa8ff" />
            </g>
          )}
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
