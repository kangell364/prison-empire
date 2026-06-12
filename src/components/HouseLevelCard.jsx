// HouseLevelCard — your own trap house's level + upgrade control, shown on the
// map. Leveling up spends Cash + a build timer and raises the house's max
// integrity (and regen), making it tougher to raid. Lean MVP: integrity +
// defense only. Needs the house_levels.txt migration applied.

import React, { useEffect, useRef, useState } from 'react'
import {
  houseLevel, hpMaxForLevel, upgradeCost, upgradeSec, UPGRADE_MAX_LEVEL,
  isUpgrading, upgradeRemainingSec, upgradeMyHouse, settleUpgrade,
} from '../state/sharedHousesStore'
import { useCash } from '../state/cashStore'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const GREEN = '#2ecc71'
const RED = '#e74c3c'
const DIM = '#666'

function fmtClock(s) {
  if (s >= 3600) { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}h ${m}m` }
  const m = Math.floor(s / 60); const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function HouseLevelCard({ house }) {
  const cash = useCash()
  const [, force] = useState(0)
  const [err, setErr] = useState(null)
  const settledFor = useRef(null)
  useEffect(() => { const iv = setInterval(() => force(t => t + 1), 1000); return () => clearInterval(iv) }, [])

  const level = houseLevel(house)
  const maxed = level >= UPGRADE_MAX_LEVEL
  const building = isUpgrading(house)
  const remain = upgradeRemainingSec(house)

  // When the build timer elapses, the owner's client commits the level-up —
  // once per build (settledFor guards against firing every tick before the
  // realtime refresh clears upgrading_until).
  useEffect(() => {
    const until = house?.upgrading_until
    if (until && remain <= 0 && settledFor.current !== until) {
      settledFor.current = until
      settleUpgrade(house)
    }
  }, [house, remain])

  if (!house) return null

  const cost = upgradeCost(level)
  const canAfford = cash >= cost
  const curMax = hpMaxForLevel(level)
  const nextMax = hpMaxForLevel(level + 1)
  const buildTotal = Math.max(1, upgradeSec(level))
  const progress = Math.max(0, Math.min(100, Math.round((1 - remain / buildTotal) * 100)))

  const doUpgrade = async () => {
    setErr(null)
    const r = await upgradeMyHouse(house)
    if (r.ok) sfx.buy?.()
    else {
      sfx.deny?.()
      setErr(r.error === 'broke' ? `Need $${cost.toLocaleString()}`
        : r.error === 'busy' ? 'Already upgrading'
        : r.error === 'max' ? 'Max level'
        : 'Upgrade unavailable — apply house_levels.txt')
    }
  }

  return (
    <div style={{ padding: '10px 16px 0' }}>
      <div style={{ background: '#13131f', border: `0.5px solid ${GOLD}44`, borderRadius: 14, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `${GOLD}1f`, color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>L{level}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontSize: 10, letterSpacing: 1, fontWeight: 700 }}>HOUSE LEVEL {level}{maxed ? ' · MAX' : ''}</div>
            <div style={{ color: '#aaa', fontSize: 11, marginTop: 2 }}>
              Max integrity {curMax}{!maxed && <span style={{ color: GREEN }}> → {nextMax}</span>}
            </div>
          </div>
          {maxed
            ? <span style={{ color: GREEN, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}><i className="ti ti-crown" /> Maxed</span>
            : !building && (
              <button onClick={doUpgrade} disabled={!canAfford} style={{ background: canAfford ? GOLD : '#1e1e2a', color: canAfford ? '#0a0a0f' : DIM, border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 11, fontWeight: 800, cursor: canAfford ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                <i className="ti ti-arrow-big-up-lines" style={{ marginRight: 4 }} />${cost.toLocaleString()}
              </button>
            )}
        </div>

        {building && (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: GOLD, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-hammer" /> Upgrading to L{level + 1} · {fmtClock(remain)}
            </div>
            <div style={{ height: 4, background: '#0a0a12', borderRadius: 2, overflow: 'hidden', marginTop: 5 }}>
              <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg,${GOLD},#f0d080)`, borderRadius: 2, transition: 'width 1s linear' }} />
            </div>
          </div>
        )}
        {err && <div style={{ color: RED, fontSize: 10.5, marginTop: 6 }}>{err}</div>}
        {!maxed && !building && (
          <div style={{ color: DIM, fontSize: 10, marginTop: 6 }}>Higher level = tougher house: more integrity &amp; faster rebuild.</div>
        )}
      </div>
    </div>
  )
}
