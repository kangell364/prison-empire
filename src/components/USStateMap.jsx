// Single-state county map. Filters the bundled topojson to counties in the
// selected state (FIPS prefix match), reprojects to fit the state's bounding
// box, and renders each county as a clickable polygon.
//
// Coloring is delegated to a `colorFor(countyFips)` callback so the parent
// can drive the palette from whatever ownership data they have.

import React, { useMemo, useState } from 'react'
import { geoMercator, geoAlbers, geoPath } from 'd3-geo'
import { useMapData } from '../state/mapData'

const VIEW_W = 800
const VIEW_H = 600

const DEFAULT_COLOR = '#1e1e2a'
const STROKE        = '#2a2a3a'
const STROKE_HOVER  = '#c9a84c'

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

  return (
    <div style={{
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
        <g>
          {paths.map(p => {
            const isHover = hover === p.id
            const fill        = colorFor       ? colorFor(p.id, p.name)       : DEFAULT_COLOR
            const stroke      = strokeFor      ? strokeFor(p.id, p.name)      : STROKE
            const strokeWidth = strokeWidthFor ? strokeWidthFor(p.id, p.name) : 0.6
            return (
              <path
                key={p.id}
                d={p.d}
                fill={fill}
                stroke={isHover ? STROKE_HOVER : stroke}
                strokeWidth={isHover ? 1.8 : (strokeWidth ?? 0.6)}
                onClick={() => onCountyClick && onCountyClick({
                  fips: p.id, name: p.name,
                })}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                style={{
                  cursor: onCountyClick ? 'pointer' : 'default',
                  transition: 'stroke 0.15s, stroke-width 0.15s',
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
    </div>
  )
}
