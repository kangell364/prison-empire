// HouseIntegrityBar — the trap-house integrity (HP) bar, shown when you tap a
// rival house on the map or get raided. Like the player's health pool, integrity
// regenerates over time; this bar ticks the value up live and shows a "full in"
// countdown so you can time an attack (or know when your own house is safe).

import React, { useEffect, useState } from 'react'
import { houseIntegrity } from '../state/sharedHousesStore'

const RED = '#e74c3c'
const GREEN = '#2ecc71'
const DIM = '#666'

function fmtDur(sec) {
  if (sec <= 0) return 'full'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function HouseIntegrityBar({ house, label = 'HOUSE INTEGRITY' }) {
  // Re-render every second so the regenerating value + countdown stay live.
  const [, force] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => force(t => t + 1), 1000)
    return () => clearInterval(iv)
  }, [])

  const { hp, hpMax, full, fullInSec } = houseIntegrity(house)
  const pct = Math.max(0, Math.min(100, Math.round((hp / hpMax) * 100)))
  const ok = pct > 33

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: DIM, letterSpacing: 0.5, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: ok ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>{hp} / {hpMax}</span>
      </div>
      <div style={{ height: 8, borderRadius: 5, background: '#0a0a12', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: ok ? 'linear-gradient(90deg,#2ecc71,#27ae60)' : 'linear-gradient(90deg,#e74c3c,#c0392b)', transition: 'width .4s' }} />
      </div>
      <div style={{ marginTop: 5, fontSize: 10, display: 'flex', alignItems: 'center', gap: 5, color: full ? GREEN : '#7a8a99' }}>
        {full
          ? <><i className="ti ti-shield-check" style={{ fontSize: 11 }} /> Fully fortified</>
          : <><i className="ti ti-shield-half-filled" style={{ fontSize: 11, color: GREEN }} /> Rebuilding · full in {fmtDur(fullInSec)}</>}
      </div>
    </div>
  )
}
