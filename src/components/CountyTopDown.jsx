// CountyTopDown — Map 2 (the tactical top-down view of a single county).
//
// Reached by tapping a facility-county on the overview map. Renders the county
// polygon as the "ground" (its border is the framing the design calls for) and
// places the trap houses inside it as art tiles with names:
//   business — the capturable county node (tap → scout/attack). Placeholder art.
//   personal — a player's home (the cut-out trap-house art).
//   mansion  — a mob HQ. Placeholder art.
// Business/mansion placeholders swap for real art later with no other change.

import React, { useMemo } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { useMapData } from '../state/mapData'
import { sfx } from '../sounds'

const VIEW_W = 800
const VIEW_H = 600
const GOLD = '#c9a84c'
const DIM  = '#555'

const PERSONAL_ART = '/trap-house-personal.png'
const KIND_GLYPH = { business: '🏪', mansion: '🏛️' }

export function CountyTopDown({ county, entries, onBack, onScout }) {
  const { data } = useMapData()

  const geo = useMemo(() => {
    if (!data) return null
    const feat = data.counties.features.find(
      f => String(f.id).padStart(5, '0') === county.fips
    )
    if (!feat) return null
    const proj = geoMercator().fitExtent([[60, 60], [VIEW_W - 60, VIEW_H - 60]], feat)
    const gp = geoPath(proj)
    return { d: gp(feat), centroid: gp.centroid(feat) }
  }, [data, county.fips])

  // Lay the houses out in a centered row near the county centroid.
  const placed = useMemo(() => {
    const cx = geo?.centroid?.[0] ?? VIEW_W / 2
    const cy = geo?.centroid?.[1] ?? VIEW_H / 2
    const n = entries.length
    const spacing = 180
    return entries.map((e, i) => {
      const x = Math.max(120, Math.min(VIEW_W - 120, cx + (i - (n - 1) / 2) * spacing))
      return { ...e, x, y: Math.max(150, Math.min(VIEW_H - 90, cy)) }
    })
  }, [entries, geo])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', zIndex: 210, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 8px' }}>
        <button className="btn btn-dark" onClick={onBack} style={{ padding: '8px 12px', fontSize: 13 }}>
          <i className="ti ti-arrow-left" /> Map
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{county.name} County</div>
          <div style={{ color: DIM, fontSize: 11 }}>{county.stateCode} · tap a trap house</div>
        </div>
      </div>

      {/* Top-down ground */}
      <div style={{ flex: 1, position: 'relative' }}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', display: 'block' }}>
          {/* County polygon = the ground + border */}
          {geo?.d && (
            <path d={geo.d} fill="#14141f" stroke={`${GOLD}aa`} strokeWidth={2}
              strokeLinejoin="round" />
          )}

          {/* House tiles */}
          {placed.map(e => (
            <HouseTile key={e.id} entry={e}
              onTap={e.kind === 'business' ? () => { sfx.tap(); onScout(e.facility) } : null} />
          ))}
        </svg>

        {!data && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, fontSize: 12, letterSpacing: 1.5 }}>
            LOADING COUNTY…
          </div>
        )}
        {data && entries.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, fontSize: 12 }}>
            No trap houses here yet.
          </div>
        )}
      </div>
    </div>
  )
}

function HouseTile({ entry, onTap }) {
  const { kind, name, color = GOLD, x, y } = entry
  const clickable = !!onTap

  return (
    <g transform={`translate(${x} ${y})`} onClick={onTap || undefined}
      style={{ cursor: clickable ? 'pointer' : 'default' }}>
      {/* ground shadow */}
      <ellipse cx={0} cy={6} rx={52} ry={12} fill="rgba(0,0,0,0.45)" />

      {kind === 'personal' ? (
        <image href={PERSONAL_ART} x={-58} y={-118} width={116} height={118} />
      ) : (
        // Placeholder card for business / mansion (swap for real art later).
        <g>
          <rect x={-62} y={-104} width={124} height={104} rx={14}
            fill="#13131f" stroke={color} strokeWidth={1.5} />
          <rect x={-62} y={-104} width={124} height={6} rx={3} fill={color} />
          <text x={0} y={-44} textAnchor="middle" fontSize={46}>{KIND_GLYPH[kind] || '🏠'}</text>
        </g>
      )}

      {/* name plate */}
      <text x={0} y={28} textAnchor="middle" fill="#fff" fontSize={17} fontWeight="700"
        style={{ paintOrder: 'stroke', stroke: '#0a0a0f', strokeWidth: 4 }}>
        {name}
      </text>
      {kind !== 'personal' && (
        <text x={0} y={46} textAnchor="middle" fill={color} fontSize={12} fontWeight="600"
          style={{ paintOrder: 'stroke', stroke: '#0a0a0f', strokeWidth: 3, letterSpacing: 1 }}>
          {kind === 'business' ? 'BUSINESS' : 'MOB MANSION'}
        </text>
      )}
    </g>
  )
}
