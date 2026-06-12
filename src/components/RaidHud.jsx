// RaidHud — global PvP raid alerts. Mounted once in App.js so an incoming raid
// shows up on EVERY screen (home, cards, map…), not just the turf map. Renders
// the in-flight banners (incoming with a Reinforce CTA, outgoing countdown) and
// the landing result modal. The attack-car animation stays in TurfMap (it needs
// the Leaflet map); this is just the heads-up + actions.

import React, { useState, useEffect, useMemo } from 'react'
import { CountdownRing } from './CountdownRing'
import { usePlayers } from '../state/playersStore'
import { useAuth } from '../state/profileStore'
import { useSharedHouses, houseIntegrity, houseLevel, vaultProtected, raidLootFor } from '../state/sharedHousesStore'
import { useActiveRaids, useRaidResolver, reinforceMyHouse, REINFORCE_COST } from '../state/raidsStore'
import { getCash, addCash, spendCash } from '../state/cashStore'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#555'

export function RaidHud({ onGoToMap }) {
  const auth = useAuth()
  const sharedHouses = useSharedHouses()
  const activeRaids = useActiveRaids()
  const myHouse = useMemo(() => (sharedHouses || []).find(h => h.owner_id === auth.userId) || null, [sharedHouses, auth.userId])

  const [landedQ, setLandedQ] = useState([])
  // On a knockover, move CASH: the attacker loots a level-based cut; the defender
  // loses up to that from cash ABOVE their vault. Runs once per raid (the resolver
  // fires onResolved a single time), on each participant's own client.
  useRaidResolver(activeRaids, (raid, result) => {
    let loot = 0, vault = 0
    if (result?.outcome === 'knocked_over') {
      const targetHouse = (sharedHouses || []).find(h => h.id === raid.target_house_id)
      const dLevel = houseLevel(targetHouse)
      const gross = raidLootFor(dLevel)
      vault = vaultProtected(dLevel)
      if (raid.attacker_id === auth.userId) {
        loot = gross
        addCash(loot)
      } else if (raid.defender_id === auth.userId) {
        const lootable = Math.max(0, getCash() - vault)
        loot = Math.min(lootable, gross)
        if (loot > 0) spendCash(loot)
      }
    }
    setLandedQ(q => [...q, { raid, result, loot, vault }])
    sfx.boom?.()
  })
  const landed = landedQ[0] || null

  const incoming = activeRaids.incoming || []
  const outgoing = activeRaids.outgoing || []
  const hasRaids = incoming.length > 0 || outgoing.length > 0

  // Tick every second so the countdowns move.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!hasRaids) return
    const iv = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(iv)
  }, [hasRaids])

  const doReinforce = async () => {
    if (!myHouse) return
    const r = await reinforceMyHouse(myHouse)
    if (r.ok) sfx.buy?.(); else sfx.deny?.()
  }

  if (!hasRaids && !landed) return null

  return (
    <>
      {hasRaids && (
        <div style={{ margin: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {incoming.map(r => (
            <IncomingBanner key={r.id} raid={r} myHouse={myHouse} onReinforce={doReinforce} onTap={onGoToMap} />
          ))}
          {outgoing.map(r => (
            <OutgoingBanner key={r.id} raid={r} onTap={onGoToMap} />
          ))}
        </div>
      )}
      {landed && (
        <RaidLandedModal entry={landed} myUserId={auth.userId} onClose={() => setLandedQ(q => q.slice(1))} />
      )}
    </>
  )
}

function remainingOf(raid) {
  return Math.max(0, Math.ceil((new Date(raid.ends_at).getTime() - Date.now()) / 1000))
}
// Each raid has its own (distance-based) duration, so the ring total comes from
// the raid's own started_at → ends_at span, not a fixed constant.
function totalOf(raid) {
  return Math.max(1, Math.round((new Date(raid.ends_at).getTime() - new Date(raid.started_at).getTime()) / 1000))
}

// Defender: someone is raiding YOUR trap house. Reinforce or ride it out.
function IncomingBanner({ raid, myHouse, onReinforce, onTap }) {
  const { name } = usePlayers()
  const total = totalOf(raid)
  const remaining = remainingOf(raid)
  const { hp, hpMax, full } = houseIntegrity(myHouse)

  return (
    <div className="attack-banner-in" style={{
      background: 'linear-gradient(135deg, #2a0a0a 0%, #100404 100%)',
      border: `1px solid ${RED}88`, borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <CountdownRing remaining={remaining} total={total} size={60} strokeWidth={4} variant="incoming" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: RED, fontSize: 13, fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-alert-triangle-filled" /> Trap House Under Fire
        </div>
        <div onClick={onTap} style={{ color: '#fff', fontSize: 13, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: onTap ? 'pointer' : 'default' }}>
          {name(raid.attacker_id)} is rolling on you — {hp}/{hpMax} HP
        </div>
        <button className="btn" onClick={onReinforce} disabled={full} style={{
          background: full ? '#1a1a28' : GOLD, color: full ? DIM : '#1a1205', border: 'none',
          borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: full ? 'default' : 'pointer',
        }}>
          <i className="ti ti-shield-half-filled" style={{ marginRight: 5 }} />
          {full ? 'House at full HP' : `Reinforce · $${REINFORCE_COST.toLocaleString()}`}
        </button>
      </div>
    </div>
  )
}

// Attacker: your crew is en route.
function OutgoingBanner({ raid, onTap }) {
  const { name } = usePlayers()
  const total = totalOf(raid)
  const remaining = remainingOf(raid)
  const isClose = remaining <= Math.min(60, Math.floor(total / 3))

  return (
    <div className="attack-banner-in" onClick={onTap} style={{
      background: isClose ? 'linear-gradient(135deg, #2a0a0a 0%, #100404 100%)' : 'linear-gradient(135deg, #1a0d00 0%, #100a02 100%)',
      border: `1px solid ${isClose ? RED + '88' : GOLD + '44'}`, borderRadius: 16, padding: 14,
      display: 'flex', alignItems: 'center', gap: 14, cursor: onTap ? 'pointer' : 'default', transition: 'background 0.5s, border-color 0.5s',
    }}>
      <CountdownRing remaining={remaining} total={total} size={60} strokeWidth={4} variant={isClose ? 'incoming' : 'outbound'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: isClose ? RED : GOLD, fontSize: 13, fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-sword" /> {isClose ? 'Raid Closing In' : 'Raid En Route'}
        </div>
        <div style={{ color: '#fff', fontSize: 13, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>→ {name(raid.defender_id)}'s trap house</div>
        <div style={{ color: DIM, fontSize: 10 }}>{isClose ? 'Almost on them' : 'Crew is moving — they may reinforce'}</div>
      </div>
    </div>
  )
}

// Both sides see this when a raid lands.
function RaidLandedModal({ entry, myUserId, onClose }) {
  const { name } = usePlayers()
  const { raid, result, loot = 0, vault = 0 } = entry
  const iAttacked = raid.attacker_id === myUserId
  const other = name(iAttacked ? raid.defender_id : raid.attacker_id)
  const outcome = result?.outcome
  const damage = result?.damage || 0

  let accent = GOLD, title = '', body = ''
  if (outcome === 'knocked_over') {
    accent = iAttacked ? '#2ecc71' : RED
    title = iAttacked ? 'House Knocked Over!' : 'Trap House Knocked Over'
    body = iAttacked
      ? `You busted down ${other}'s trap house. They'll have to rebuild.`
      : `${other} busted down your trap house. Reinforce to lock it back up.`
  } else if (outcome === 'held') {
    accent = iAttacked ? GOLD : '#2ecc71'
    title = iAttacked ? 'Defense Held' : 'You Held the Line'
    body = iAttacked
      ? `${other}'s house took ${damage} damage but didn't fall. Hit again to break it.`
      : `${other} chipped ${damage} HP off your house but it held. Reinforce to stay strong.`
  } else if (outcome === 'immune') {
    accent = DIM; title = 'Raid Fizzled'
    body = iAttacked
      ? `${other}'s house was still locked down from a recent hit. No damage.`
      : `Your house was still locked down from a recent hit — the raid fizzled.`
  } else {
    accent = DIM; title = 'Raid Over'; body = 'The target was gone.'
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={onClose}>
      <div className="animate-in" style={{ background: '#13131f', borderRadius: 18, padding: 24, width: '100%', maxWidth: 340, margin: 16, textAlign: 'center', border: `1px solid ${accent}55` }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 44 }}>{outcome === 'knocked_over' ? '💥' : outcome === 'held' ? '🛡️' : '🚗'}</div>
        <div style={{ color: accent, fontSize: 11, letterSpacing: 2, fontWeight: 700, marginTop: 8 }}>RAID {iAttacked ? 'OUTGOING' : 'INCOMING'}</div>
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginTop: 4 }}>{title}</div>
        <div style={{ color: '#aaa', fontSize: 13, lineHeight: 1.55, marginTop: 10 }}>{body}</div>

        {/* Loot line on a knockover — green when you cashed in, red when you got hit */}
        {outcome === 'knocked_over' && (
          iAttacked
            ? <div style={{ marginTop: 12, color: '#2ecc71', fontSize: 18, fontWeight: 800 }}>
                <i className="ti ti-cash" style={{ marginRight: 6 }} />+${loot.toLocaleString()} looted
              </div>
            : <div style={{ marginTop: 12 }}>
                <div style={{ color: RED, fontSize: 18, fontWeight: 800 }}>
                  <i className="ti ti-cash" style={{ marginRight: 6 }} />−${loot.toLocaleString()} stolen
                </div>
                <div style={{ color: DIM, fontSize: 11, marginTop: 4 }}>
                  <i className="ti ti-lock" style={{ marginRight: 4 }} />Vault shielded ${vault.toLocaleString()} of your stash
                </div>
              </div>
        )}

        <button className="btn btn-gold" style={{ width: '100%', padding: 12, marginTop: 18 }} onClick={onClose}>OK</button>
      </div>
    </div>
  )
}
