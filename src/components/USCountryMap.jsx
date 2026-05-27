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

// Props:
//   colorFor(stateFips, postalCode) → string  — fill color for that state
//   onStateClick(stateFeature)               — tap handler (Phase 3b drills in)
//   height                                    — CSS height; width is responsive
//   label                                     — optional title shown above the map
export function USCountryMap({ colorFor, onStateClick, height = '58vh' }) {
  const { data, error } = useMapData()
  const [hover, setHover] = useState(null)
  const containerRef = useRef(null)

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

  return (
    <div ref={containerRef} style={{
      width: '100%', height,
      background: '#0d0d15',
      borderRadius: 16, overflow: 'hidden',
      position: 'relative',
    }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        {/* State polygons */}
        <g>
          {paths.map(p => {
            const isHover = hover === p.id
            return (
              <path
                key={p.id}
                d={p.d}
                fill={colorFor ? colorFor(p.id, p.code) : DEFAULT_COLOR}
                stroke={isHover ? STROKE_HOVER : STROKE}
                strokeWidth={isHover ? 1.4 : 0.6}
                onClick={() => onStateClick && onStateClick({ fips: p.id, code: p.code, name: p.name })}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                style={{
                  cursor: onStateClick ? 'pointer' : 'default',
                  transition: 'stroke 0.15s, stroke-width 0.15s',
                }}
              />
            )
          })}
        </g>

        {/* State postal-code labels at centroids */}
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
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.5,
                fontFamily: 'inherit',
                userSelect: 'none',
              }}
            >{p.code}</text>
          ))}
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
    </div>
  )
}
