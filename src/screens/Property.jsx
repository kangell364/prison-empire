import React, { useState, useMemo } from 'react'
import { PROPERTIES, PROPERTY_COST_GROWTH, PLAYER } from '../data/gameData'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const GREEN = '#2ecc71'
const DIM = '#555'

// Pretty big-number formatter for Hustle amounts (K / M / B / T).
function formatHustle(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T'
  if (n >= 1e9)  return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (n >= 1e6)  return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3)  return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toLocaleString()
}

// Per-item next-unit price after `owned` purchases.
function unitCost(baseCost, owned) {
  return Math.round(baseCost * Math.pow(PROPERTY_COST_GROWTH, owned))
}

// Total cost to buy `qty` units starting from `owned` already owned.
// (Sum of unit costs at each step — each unit costs more than the last.)
function bulkCost(baseCost, owned, qty) {
  let total = 0
  for (let i = 0; i < qty; i++) total += unitCost(baseCost, owned + i)
  return total
}

const QTY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export default function Property() {
  const playerLevel = PLAYER.level
  // Local state — owned counts per property id. Resets on refresh until
  // persistence lands. Currency check is intentionally NOT enforced for v1
  // (the user wants to balance pricing later).
  const [owned, setOwned] = useState({})
  // Per-card transient feedback ("Bought 3 for 1,540 Hustle, +15/hr")
  const [flash, setFlash] = useState({})

  // Find the next unlock tier above the player's current level (or null).
  const nextUnlock = useMemo(() => {
    const tiers = [...new Set(PROPERTIES.map(p => p.minLevel))].sort((a, b) => a - b)
    return tiers.find(l => l > playerLevel) ?? null
  }, [playerLevel])

  // Properties unlocked at the current player level — keep them grouped by
  // minLevel so the UI can show tier headers.
  const unlocked = useMemo(() => (
    PROPERTIES.filter(p => p.minLevel <= playerLevel)
  ), [playerLevel])

  const tiers = useMemo(() => {
    const groups = {}
    unlocked.forEach(p => {
      if (!groups[p.minLevel]) groups[p.minLevel] = []
      groups[p.minLevel].push(p)
    })
    return Object.entries(groups)
      .map(([lvl, items]) => ({ level: Number(lvl), items }))
      .sort((a, b) => a.level - b.level)
  }, [unlocked])

  const totalPerHr = useMemo(() => (
    unlocked.reduce((sum, p) => sum + (owned[p.id] || 0) * p.perHr, 0)
  ), [unlocked, owned])

  const onPurchase = (p, qty) => {
    const have = owned[p.id] || 0
    const cost = bulkCost(p.baseCost, have, qty)
    const at = Date.now()
    setOwned(o => ({ ...o, [p.id]: have + qty }))
    setFlash(f => ({ ...f, [p.id]: { qty, cost, perHrAdded: qty * p.perHr, at } }))
    sfx.buy()
    // Clear the flash after a few seconds — unless a newer purchase replaced it
    setTimeout(() => {
      setFlash(f => {
        if (f[p.id]?.at !== at) return f
        const next = { ...f }
        delete next[p.id]
        return next
      })
    }, 4000)
  }

  return (
    <div className="scroll-area animate-in">
      {/* Header + total income */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          background: 'linear-gradient(135deg, #15110a 0%, #13131f 100%)',
          border: `1px solid ${GOLD}44`,
          borderRadius: 16,
          padding: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>Property</div>
              <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                Build your empire. Every property pays Hustle every hour.
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                color: GREEN, fontSize: 22, fontWeight: 700, lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>+{formatHustle(totalPerHr)}</div>
              <div style={{ color: '#888', fontSize: 10, marginTop: 2, letterSpacing: 1 }}>HUSTLE / HR</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tiered property list */}
      {tiers.map(tier => (
        <div className="section" key={tier.level} style={{ marginTop: 16 }}>
          <div className="section-label">
            {tier.level === 1 ? 'Available — Starter' : `Available — Level ${tier.level}`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tier.items.map(p => (
              <PropertyCard
                key={p.id}
                property={p}
                owned={owned[p.id] || 0}
                flash={flash[p.id]}
                onPurchase={onPurchase}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Next unlock teaser */}
      {nextUnlock != null && (
        <div className="section">
          <div className="card card-pad" style={{
            textAlign: 'center',
            padding: '24px 18px',
            background: '#0d0d15',
            borderColor: '#1e1e2a',
          }}>
            <i className="ti ti-lock" style={{ color: DIM, fontSize: 24, display: 'block', marginBottom: 8 }} />
            <div style={{ color: '#888', fontSize: 13, lineHeight: 1.5 }}>
              More properties unlock at{' '}
              <span style={{ color: GOLD, fontWeight: 700 }}>Level {nextUnlock}</span>
            </div>
            <div style={{ color: DIM, fontSize: 10, marginTop: 4 }}>
              You're Level {playerLevel} — {nextUnlock - playerLevel} to go.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------

function PropertyCard({ property, owned, flash, onPurchase }) {
  const [qty, setQty] = useState(1)
  const cost = useMemo(() => bulkCost(property.baseCost, owned, qty), [property.baseCost, owned, qty])

  return (
    <div className="card" style={{
      padding: 0, position: 'relative', overflow: 'hidden',
      borderColor: owned > 0 ? `${GOLD}44` : '#2a2a3a',
      background: owned > 0
        ? 'linear-gradient(135deg, #15110a 0%, #13131f 70%)'
        : '#13131f',
    }}>
      {owned > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 0,
          background: GOLD, color: '#0a0a0f',
          fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
          padding: '3px 10px',
          borderBottomRightRadius: 10,
          zIndex: 2,
        }}>PURCHASED · {owned}</div>
      )}

      <div style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Image */}
        <div style={{
          width: 56, height: 56, borderRadius: 12,
          background: '#1e1e2a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30, flexShrink: 0,
          marginTop: owned > 0 ? 14 : 0,
        }}>{property.emoji}</div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0, marginTop: owned > 0 ? 14 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{property.name}</div>
              <div style={{ color: GREEN, fontSize: 12, fontWeight: 600, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                +{formatHustle(property.perHr)} <span style={{ color: '#888', fontWeight: 400 }}>Hustle/hr</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ color: '#666', fontSize: 9, letterSpacing: 1 }}>COST</div>
              <div style={{ color: GOLD, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {formatHustle(cost)}
              </div>
            </div>
          </div>

          <div style={{ color: DIM, fontSize: 10, marginTop: 4 }}>
            Min Level: {property.minLevel}
            {owned > 0 && (
              <> · Next unit: <span style={{ color: '#888' }}>{formatHustle(unitCost(property.baseCost, owned + qty - 1))}</span></>
            )}
          </div>

          {/* Feedback flash */}
          {flash && (
            <div style={{
              marginTop: 8,
              background: '#0e1a0e',
              border: `0.5px solid ${GREEN}55`,
              borderRadius: 8,
              padding: '6px 8px',
              fontSize: 11,
              color: GREEN,
              lineHeight: 1.4,
            }}>
              ✓ Bought {flash.qty} for {formatHustle(flash.cost)} Hustle. +{formatHustle(flash.perHrAdded)} Hustle/hr.
            </div>
          )}
        </div>
      </div>

      {/* Footer: qty picker + purchase */}
      <div style={{
        padding: '10px 14px 12px',
        display: 'flex', gap: 8, alignItems: 'center',
        borderTop: '0.5px solid #1e1e2a',
      }}>
        <QtySelect value={qty} onChange={setQty} />
        <button
          onClick={() => onPurchase(property, qty)}
          style={{
            flex: 1,
            background: GOLD, color: '#0a0a0f',
            border: 'none', borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12, fontWeight: 700, letterSpacing: 1,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <i className="ti ti-shopping-cart" style={{ fontSize: 13 }} />
          PURCHASE
        </button>
      </div>
    </div>
  )
}

function QtySelect({ value, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: '#1e1e2a',
      border: '0.5px solid #2a2a3a',
      borderRadius: 8,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <span style={{
        color: DIM, fontSize: 9, fontWeight: 600, letterSpacing: 1,
        padding: '0 8px 0 10px',
      }}>QTY</span>
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          background: 'transparent',
          color: '#fff', fontSize: 13, fontWeight: 600,
          border: 'none',
          padding: '8px 8px',
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          cursor: 'pointer',
        }}
      >
        {QTY_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <i className="ti ti-chevron-down" style={{ color: '#888', fontSize: 12, paddingRight: 8, pointerEvents: 'none' }} />
    </div>
  )
}
