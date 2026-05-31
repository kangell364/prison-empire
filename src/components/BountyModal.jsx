import React, { useState } from 'react'
import { useHustle } from '../state/profileStore'
import { useHitList, placeBounty } from '../state/hitListStore'
import { Avatar } from './Avatar'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#666'

// K / M / B / T formatter for Hustle.
export function formatHustle(n) {
  n = Math.floor(n || 0)
  if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T'
  if (n >= 1e9)  return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (n >= 1e6)  return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3)  return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toLocaleString()
}

const QUICK = [1000, 5000, 25000, 100000]

export function BountyModal({ opponent, onClose }) {
  const hustle = useHustle()
  const list = useHitList()
  const existing = list.targets[opponent.id]?.bounty || 0
  const [amount, setAmount] = useState(0)

  const num = Math.max(0, Math.floor(amount || 0))
  const canAfford = num > 0 && num <= hustle

  const addQuick = (q) => setAmount(a => Math.floor(Number(a) || 0) + q)

  const place = () => {
    if (!canAfford) { sfx.deny?.(); return }
    if (placeBounty(opponent, num)) { sfx.buy?.(); onClose() }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,10,0.7)', zIndex: 320, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 390, background: '#0d0d15', borderTop: `1px solid ${GOLD}33`, borderRadius: '18px 18px 0 0', padding: 18 }}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Avatar src={opponent.avatar} emoji={opponent.emoji} size={48} radius={12} style={{ background: '#1e1e2a' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>Bounty on {opponent.name}</div>
            <div style={{ color: DIM, fontSize: 11, marginTop: 1 }}>
              Lv {opponent.level}
              {existing > 0 && <> · current pot <span style={{ color: GOLD }}>{formatHustle(existing)} Hustle</span></>}
            </div>
          </div>
        </div>

        {/* Amount */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ color: '#888', fontSize: 11 }}>Bounty (Hustle)</span>
          <span style={{ color: num > hustle ? RED : '#888', fontSize: 11 }}>
            <i className="ti ti-coin" style={{ color: GOLD, fontSize: 12, marginRight: 3 }} />you have {formatHustle(hustle)}
          </span>
        </div>
        <input
          type="number" inputMode="numeric" min={0} value={amount || ''} placeholder="0"
          onChange={e => setAmount(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', background: '#13131f',
            border: `0.5px solid ${num > hustle ? RED : '#2a2a3a'}`, borderRadius: 10,
            padding: '12px 14px', color: '#fff', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {QUICK.map(q => (
            <button key={q} onClick={() => addQuick(q)} disabled={q > hustle}
              style={{ flex: 1, background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 8, padding: '8px 0', color: q > hustle ? '#444' : GOLD, fontSize: 11, fontWeight: 700, cursor: q > hustle ? 'not-allowed' : 'pointer' }}>
              +{formatHustle(q)}
            </button>
          ))}
        </div>

        <button onClick={place} disabled={!canAfford}
          style={{
            marginTop: 14, width: '100%', background: canAfford ? GOLD : '#1e1e2a',
            color: canAfford ? '#0a0a0f' : '#555', border: 'none', borderRadius: 12,
            padding: 15, fontSize: 14, fontWeight: 800, letterSpacing: 1,
            cursor: canAfford ? 'pointer' : 'not-allowed',
          }}>
          <i className="ti ti-crosshair" style={{ fontSize: 15, marginRight: 5 }} />
          {num > hustle ? 'NOT ENOUGH HUSTLE' : existing > 0 ? `ADD ${formatHustle(num)} TO BOUNTY` : `PLACE ${formatHustle(num)} BOUNTY`}
        </button>
        <button onClick={onClose} style={{ marginTop: 8, width: '100%', background: 'transparent', color: '#888', border: '0.5px solid #2a2a3a', borderRadius: 10, padding: 12, fontSize: 12, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>
          CANCEL
        </button>
      </div>
    </div>
  )
}
