// BlockSheet — tap a block on the turf map to open this. Three states:
//   vacant → Recruit a member (Hustle) to work it
//   yours  → Collect its income
//   rival  → Poach the member's loyalty (+10%) to take the block
// Home-turf blocks (near your trap house) are cheaper + earn more.

import React, { useEffect } from 'react'
import { useHustle, useDisplayName, usePlayerLook, resolveLook } from '../state/profileStore'
import { usePlayers } from '../state/playersStore'
import { Avatar } from './Avatar'
import {
  getBlock, useBlocksVersion, effectiveLoyalty, poachPrice, recruitCost,
  pendingIncome, onCooldown, cooldownLeft, recruit, poach, collect,
} from '../state/blocksStore'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#666'

export function BlockSheet({ gx, gy, homeTurf, onClose }) {
  useBlocksVersion()
  const hustle = useHustle()
  const myName = useDisplayName()
  const myLook = resolveLook(usePlayerLook())
  const { players, name: playerName, refresh } = usePlayers()
  const b = getBlock(gx, gy)
  const yours  = b.owner === 'you'
  const vacant = !b.owner
  const color  = yours ? GOLD : (b.color || DIM)

  // Who actually HOLDS this block — show their player card (avatar + name) so you
  // can see who you're taking it from. Real players only (you or a rival with an
  // owner_id); ambient AI crews have no player behind them.
  const holder = yours
    ? { name: myName, look: myLook }
    : (b.owner === 'rival' && b.owner_id)
      ? { name: playerName(b.owner_id), look: resolveLook(players[b.owner_id]?.player_look_id) }
      : null
  // Pull names/looks if this rival isn't in the directory yet.
  useEffect(() => { if (b.owner_id && !players[b.owner_id]) refresh() }, [b.owner_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const loyalty = effectiveLoyalty(b)
  const cost    = vacant ? recruitCost(b, homeTurf) : poachPrice(b, homeTurf)
  const pending = yours ? pendingIncome(gx, gy) : 0
  const cd      = !yours && !vacant && onCooldown(b)
  const cdLeft  = cd ? cooldownLeft(b) : 0
  const afford  = hustle >= cost

  const doRecruit = () => { const r = recruit(gx, gy, homeTurf); r.ok ? sfx.buy?.() : sfx.deny?.() }
  const doPoach   = () => { const r = poach(gx, gy, homeTurf);   r.ok ? sfx.buy?.() : sfx.deny?.() }
  const doCollect = () => { if (collect(gx, gy) > 0) sfx.buy?.() }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 230, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: '#13131f', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '18px 18px 100px', borderTop: `2px solid ${color}` }}>
        {/* Header — the HOLDER's player card (avatar + name) when a real player
            holds it, so you see who you're taking the block from; the NPC working
            the corner sits underneath as secondary detail. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {holder
            ? <Avatar src={holder.look?.avatar} emoji={holder.look?.emoji} size={46} radius={12} style={{ border: `1px solid ${color}` }} />
            : <div style={{ width: 46, height: 46, borderRadius: 12, background: `${color}22`, border: `1px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🕴️</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color, fontSize: 11, letterSpacing: 1, fontWeight: 700 }}>
              {yours ? 'YOUR BLOCK' : vacant ? 'UNCLAIMED BLOCK' : `${b.owner.toUpperCase()} CREW`}
            </div>
            {/* Holding player's name — above the NPC name. */}
            {holder && (
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {holder.name}
              </div>
            )}
            <div style={{ color: holder ? DIM : '#fff', fontSize: holder ? 12.5 : 17, fontWeight: holder ? 400 : 600 }}>
              {vacant ? 'Open Corner' : <>🕴️ {b.npc}{!vacant && <span style={{ color: DIM, fontSize: 12, fontWeight: 400 }}> · working the block</span>}</>}
            </div>
          </div>
          {homeTurf && <div style={{ background: `${GOLD}22`, border: `0.5px solid ${GOLD}`, color: GOLD, fontSize: 9, fontWeight: 800, letterSpacing: 1, borderRadius: 6, padding: '3px 7px' }}>HOME TURF</div>}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <Stat label="Income" value={`${b.incomePerHr}/hr`} color={GOLD} />
          <Stat label={vacant ? 'Recruit Cost' : 'Loyalty'} value={(vacant ? cost : loyalty).toLocaleString()} color="#4a9eff" />
        </div>

        {/* Action */}
        {yours ? (
          <>
            <div style={{ color: DIM, fontSize: 12, textAlign: 'center', marginBottom: 10 }}>{pending.toLocaleString()} Hustle waiting</div>
            <button className="btn btn-gold btn-full" style={{ padding: 14, opacity: pending > 0 ? 1 : 0.5 }} disabled={pending <= 0} onClick={doCollect}>
              {pending > 0 ? `Collect ${pending.toLocaleString()} Hustle` : 'Nothing to collect yet'}
            </button>
          </>
        ) : (
          <>
            {cd && <div style={{ color: RED, fontSize: 12, textAlign: 'center', marginBottom: 10 }}>Locked — re-poach in {cdLeft}s</div>}
            {!cd && !afford && <div style={{ color: RED, fontSize: 12, textAlign: 'center', marginBottom: 10 }}>Not enough Hustle ({hustle.toLocaleString()} / {cost.toLocaleString()})</div>}
            <button className="btn btn-gold btn-full" style={{ padding: 14, opacity: (cd || !afford) ? 0.5 : 1 }} disabled={cd || !afford} onClick={vacant ? doRecruit : doPoach}>
              {vacant ? `Recruit — ${cost.toLocaleString()} Hustle` : `Poach — ${cost.toLocaleString()} Hustle`}
            </button>
            {!vacant && <div style={{ color: DIM, fontSize: 10, textAlign: 'center', marginTop: 8 }}>Buy out their loyalty (+10%) — they get paid a cut</div>}
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#0a0a0f', border: '0.5px solid #2a2a3a', borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ color, fontSize: 18, fontWeight: 600 }}>{value}</div>
      <div style={{ color: '#666', fontSize: 10, letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
    </div>
  )
}
