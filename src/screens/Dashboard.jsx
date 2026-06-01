import React, { useState, useEffect } from 'react'
import { PLAYER, PLAYER_LOOKS, RESOURCES, CARDS_COLLECTION, LEADERBOARD, RARITY_COLORS, RANKED_PLAYERS } from '../data/gameData'
import { useHustle, useDisplayName, usePlayerLook } from '../state/profileStore'
import { useBlocksVersion, yourBlockCount, yourBlockIncomePerHr, yourPendingIncome, useNextPayoutCountdown, subscribePayout, blockCap, resetTurf } from '../state/blocksStore'
import { useCrew, atkOf, defOf, baseAtk, baseDef } from '../state/crewStore'
import { useUpgrades, flatAtLevel } from '../state/upgradesStore'
import { useVitals, msToNextStamina, msToNextHealth, openNurse } from '../state/vitalsStore'
import { useProgress } from '../state/progressionStore'
import { usePlayerStats } from '../state/statsStore'
import { xpForLevel } from '../data/bossLadder'
import { Avatar, KoOverlay, KO_FILTER } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import { SwapLookModal } from '../components/SwapLookModal'
import { StoreModal } from '../components/StoreModal'
import { useGang, GANG_CAPACITY } from '../state/gangStore'
import { sfx } from '../sounds'

export default function Dashboard({ onNavigate }) {
  const [detailChar, setDetailChar] = useState(null)
  const [showSwap, setShowSwap] = useState(false)
  const [showStore, setShowStore] = useState(false)

  const prog = useProgress()
  const xpNeed = xpForLevel(prog.level)
  const xpPct = Math.round((prog.xp / xpNeed) * 100)
  // Live "Your Turf" block economy — re-renders when blocks change (recruit /
  // poach / collect / AI poach).
  useBlocksVersion()
  const blocksOwned = yourBlockCount()
  const blockIncomeHr = yourBlockIncomePerHr()
  const blockPending  = yourPendingIncome()
  // Global hourly payout clock (UTC-aligned — same countdown for everyone). The
  // payout itself fires app-wide from App's useBlockPayoutTicker; here we just
  // show the countdown and chime when one banks while you're on this screen.
  const payoutMsLeft = useNextPayoutCountdown()
  useEffect(() => subscribePayout(() => sfx.buy()), [])
  // Live crew — the real 12-slot roster (1 Leader + 11 Members) from crewStore,
  // resolved against the card catalog. Mirrors the Cards → My Crew screen.
  const crew = useCrew()
  const flat = flatAtLevel(useUpgrades(), 1)   // Level-1 ATK/DEF upgrades, same as My Crew
  const cardById = new Map(CARDS_COLLECTION.map(c => [c.id, c]))
  const crewSlots = [
    { card: crew.leader != null ? cardById.get(crew.leader) : null, isLeader: true },
    ...crew.members.map(id => ({ card: id != null ? cardById.get(id) : null, isLeader: false })),
  ]
  const crewFilled = crewSlots.filter(s => s.card).length
  // Combined crew ATK/DEF (with upgrades) — mirrors the My Crew header totals.
  const crewTotals = crewSlots.reduce((acc, s) => {
    if (s.card) { acc.atk += atkOf(s.card, flat); acc.def += defOf(s.card, flat) }
    return acc
  }, { atk: 0, def: 0 })
  const playerName = useDisplayName()
  const playerKo = useVitals().ko                    // KO treatment on the player's own portrait
  const liveStats = usePlayerStats()                 // real ATK/DEF/HP from traits
  const livePower = liveStats.atk + liveStats.def    // leaderboard "power" = ATK+DEF
  const lookId = usePlayerLook()
  // The home-screen player card is now a cosmetic "look" (see SWAP). Level, XP
  // and stats are unaffected — only the art + name change.
  const look = PLAYER_LOOKS.find(l => l.id === lookId) || PLAYER_LOOKS[0]
  const lookColor = RARITY_COLORS[look.rarity] || '#c9a84c'

  return (
    <div className="scroll-area animate-in">

      {/* Vitals HUD — health + stamina with live regen countdown */}
      <VitalsHud />

      {/* Player Card */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Your Card</div>
        <div className="card card-pad" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* Card Art — the player's chosen cosmetic look (swappable). Tap to
              open the full player (SR) view. */}
          <div
            onClick={() => { sfx.tap?.(); onNavigate('profile') }}
            style={{
            width: 105, height: 138,
            background: '#1a1a2e',
            borderRadius: 15,
            border: `1px solid ${lookColor}44`,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-end',
            flexShrink: 0, position: 'relative', overflow: 'hidden', cursor: 'pointer',
          }}>
            {look.avatar ? (
              <img src={look.avatar} alt={look.name}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', filter: playerKo ? KO_FILTER : 'none' }} />
            ) : (
              <div style={{ fontSize: 45, marginBottom: 6, filter: playerKo ? KO_FILTER : 'none' }}>{look.emoji}</div>
            )}
            {playerKo && <KoOverlay fontSize={24} />}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: lookColor }} />
            <div style={{
              position: 'relative', zIndex: 1, width: '100%',
              background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.85) 60%)',
              padding: '18px 6px 5px',
            }}>
              <div style={{ color: lookColor, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textAlign: 'center' }}>{playerName.toUpperCase()}</div>
              <div style={{ color: '#bbb', fontSize: 12, marginTop: 2, textAlign: 'center' }}>LVL {prog.level}</div>
            </div>
          </div>

          {/* Player Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 500 }}>{playerName}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(201,168,76,0.1)', border: '0.5px solid rgba(201,168,76,0.3)', borderRadius: 20, padding: '3px 10px', margin: '5px 0 8px' }}>
              <i className="ti ti-building" style={{ color: '#c9a84c', fontSize: 11 }} />
              <span style={{ color: '#c9a84c', fontSize: 11 }}>{PLAYER.facility} — {PLAYER.state}</span>
            </div>

            {/* XP Bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#555', fontSize: 10 }}>XP to Level {prog.level + 1}</span>
                <span style={{ color: '#888', fontSize: 10 }}>{prog.xp.toLocaleString()} / {xpNeed.toLocaleString()}</span>
              </div>
              <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${xpPct}%`, background: 'linear-gradient(90deg, #c9a84c, #f0d080)', borderRadius: 2 }} />
              </div>
            </div>

            {/* Stats — the player's own ATK/DEF (from Power). */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { val: baseAtk(PLAYER).toLocaleString(), lbl: 'Attack',  color: '#e74c3c' },
                { val: baseDef(PLAYER).toLocaleString(), lbl: 'Defense', color: '#4a9eff' },
              ].map(s => (
                <div key={s.lbl} style={{ background: '#1e1e2a', borderRadius: 8, padding: '5px 10px', textAlign: 'center' }}>
                  <div style={{ color: s.color, fontSize: 13, fontWeight: 500 }}>{s.val}</div>
                  <div style={{ color: '#444', fontSize: 9 }}>{s.lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SWAP — opens the cosmetic player-card picker. Muted gray with the
            same text color as the "XP to Level" label (#555). */}
        <button
          onClick={() => { sfx.tap?.(); setShowSwap(true) }}
          className="btn"
          style={{
            width: '100%', marginTop: 10, padding: '11px 0', borderRadius: 12,
            background: '#1e1e2a', border: '0.5px solid #2a2a3a',
            color: '#555', fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <i className="ti ti-repeat" /> SWAP
        </button>
      </div>

      {/* Resources */}
      <div className="section">
        <div className="section-label">Commissary Store</div>
        {/* STORE entry — tap the art to open the store view. Art is a placeholder
            for now; another piece may replace it later. */}
        <div
          onClick={() => { sfx.tap?.(); setShowStore(true) }}
          className="card"
          style={{ overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
        >
          <img src="/STORE.png" alt="Commissary Store"
            style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>
      </div>

      {/* City */}
      <div className="section">
        <div className="section-label">Your Turf</div>
        <div className="card">
          {/* Live block economy — total Hustle/hr from every block you run. */}
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>Block Income</div>
              <div style={{ color: '#666', fontSize: 11 }}>{blocksOwned}/{blockCap()} blocks</div>
            </div>
            <div style={{ color: '#555', fontSize: 11, marginTop: 2 }}>
              {blocksOwned === 0 ? 'Claim turf on the map to start earning passive Hustle.' : 'Auto-pays every hour — same clock for every player'}
            </div>
            <div style={{ display: 'flex', gap: 22, marginTop: 12 }}>
              <div>
                <div style={{ color: '#c9a84c', fontSize: 15, fontWeight: 500 }}>{blocksOwned}</div>
                <div style={{ color: '#444', fontSize: 10 }}>Blocks</div>
              </div>
              <div>
                <div style={{ color: '#c9a84c', fontSize: 15, fontWeight: 500 }}>+{blockIncomeHr.toLocaleString()}</div>
                <div style={{ color: '#444', fontSize: 10 }}>Hustle/hr</div>
              </div>
            </div>
            {/* Global hourly payout — same countdown for everyone, auto-banks at 0. */}
            <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 12, background: '#1a1510', border: '0.5px solid #c9a84c33', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <i className="ti ti-clock-hour-4" style={{ color: '#c9a84c', fontSize: 18 }} />
                <div>
                  <div style={{ color: '#888', fontSize: 9, letterSpacing: 0.5, fontWeight: 600 }}>NEXT PAYOUT</div>
                  <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtCountdown(payoutMsLeft)}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#888', fontSize: 9, letterSpacing: 0.5, fontWeight: 600 }}>PAYING OUT</div>
                <div style={{ color: '#c9a84c', fontSize: 16, fontWeight: 700 }}>+{blockPending.toLocaleString()}</div>
              </div>
            </div>
            {/* DEV — TODO REMOVE BEFORE LAUNCH: wipe your turf back to zero. */}
            <button
              onClick={() => { if (window.confirm('Reset ALL your blocks back to zero?')) { resetTurf(); sfx.deny?.() } }}
              style={{ marginTop: 10, width: '100%', background: 'transparent', border: '0.5px dashed #3a2a2a', color: '#7a4a4a', fontSize: 10, padding: 7, borderRadius: 8, letterSpacing: 0.5, cursor: 'pointer' }}>
              <i className="ti ti-trash" /> Reset Turf (dev)
            </button>
          </div>
        </div>
      </div>

      {/* Crew — the real 12-slot roster (Leader + 11 Members) from crewStore */}
      <div className="section">
        <div className="section-label">Your Crew ({crewFilled}/{crewSlots.length})</div>
        {/* Combined crew ATK / DEF — same totals as the My Crew header. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div style={{ background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ color: '#e74c3c', fontSize: 18, fontWeight: 600, lineHeight: 1 }}>{crewTotals.atk.toLocaleString()}</div>
            <div style={{ color: '#555', fontSize: 10, marginTop: 5, letterSpacing: 0.5 }}>Crew ATK</div>
          </div>
          <div style={{ background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ color: '#4a9eff', fontSize: 18, fontWeight: 600, lineHeight: 1 }}>{crewTotals.def.toLocaleString()}</div>
            <div style={{ color: '#555', fontSize: 10, marginTop: 5, letterSpacing: 0.5 }}>Crew DEF</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {crewSlots.map((slot, i) => {
            const c = slot.card
            const rc = c ? (RARITY_COLORS[c.rarity] || '#c9a84c') : '#1e1e2a'
            const power = c ? atkOf(c, flat) + defOf(c, flat) : 0
            return (
              <div key={i}
                onClick={() => { sfx.tap?.(); onNavigate('cards', { tab: 'crew' }) }}
                style={{
                position: 'relative',
                background: '#13131f',
                border: `0.5px solid ${c ? rc + '55' : '#1e1e2a'}`,
                borderRadius: 14, padding: '10px 8px',
                textAlign: 'center',
                opacity: c ? 1 : 0.5,
                cursor: 'pointer',
              }}>
                {slot.isLeader && (
                  <div style={{ position: 'absolute', top: -6, right: -4, width: 20, height: 20, borderRadius: '50%', background: '#c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.6)' }}>
                    <i className="ti ti-crown" style={{ color: '#0a0a0f', fontSize: 12 }} />
                  </div>
                )}
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#1e1e2a', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, overflow: 'hidden' }}>
                  {c ? <Avatar src={c.avatar} emoji={c.emoji} size={40} radius={12} /> : <i className="ti ti-plus" style={{ color: '#333' }} />}
                </div>
                <div style={{ color: c ? '#888' : '#333', fontSize: 9, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c ? c.name : (slot.isLeader ? 'Leader' : 'Empty')}
                </div>
                {c
                  ? <div style={{ color: '#c9a84c', fontSize: 11, marginTop: 2 }}>+{power}</div>
                  : <div style={{ color: '#333', fontSize: 9, marginTop: 2 }}>{slot.isLeader ? 'slot' : 'open'}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Your Gang — opens the full Gang view (found/join/manage). */}
      <div className="section">
        <div className="section-label">Your Gang</div>
        <YourGangCard onNavigate={onNavigate} />
      </div>

      {/* Leaderboard */}
      <div className="section">
        <div className="section-label">Texas Leaderboard</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LEADERBOARD.map(p => (
            <div key={p.rank} className="card card-pad" style={{
              padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 12,
              borderColor: p.isYou ? '#c9a84c44' : '#2a2a3a',
              cursor: 'pointer',
            }} onClick={() => {
              if (p.isYou) {
                const base = RANKED_PLAYERS.find(rp => rp.isYou) || p
                setDetailChar({ ...base, name: playerName, level: prog.level, atk: liveStats.atk, def: liveStats.def, hp: liveStats.hp, power: livePower })
              } else {
                setDetailChar(RANKED_PLAYERS.find(rp => rp.name === p.name) || p)
              }
            }}>
              <div style={{ color: p.rank === 1 ? '#c9a84c' : p.rank === 2 ? '#888' : p.rank === 3 ? '#8b6914' : '#555', fontSize: 14, fontWeight: 500, width: 20 }}>{p.rank}</div>
              <Avatar src={p.avatar} emoji={p.emoji} size={36} radius={10} ko={p.isYou && playerKo}
                style={{ background: '#1e1e2a' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: p.isYou ? '#c9a84c' : '#fff', fontSize: 13, fontWeight: 500 }}>{p.isYou ? playerName : p.name}{p.isYou ? ' (You)' : ''}</div>
                <div style={{ color: '#555', fontSize: 10 }}>{p.facility} — {p.state}</div>
              </div>
              <div style={{ color: p.isYou ? '#c9a84c' : '#888', fontSize: 14, fontWeight: 500 }}>{(p.isYou ? livePower : p.power).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {detailChar && (
        <CharacterDetailModal character={detailChar} onClose={() => setDetailChar(null)} />
      )}

      {showSwap && <SwapLookModal onClose={() => setShowSwap(false)} />}
      {showStore && <StoreModal onClose={() => setShowStore(false)} />}

    </div>
  )
}

// ---------------------------------------------------------------------
// Vitals HUD — just the health + stamina regen TIMERS (no bars; the bars
// live on the Profile screen). Sits at the top of the home screen, under
// the header. Each shows current value + a live "+1 in m:ss" countdown.
// ---------------------------------------------------------------------
function VitalsHud() {
  const vitals = useVitals()   // re-renders every 1s via the store's ticker
  const hustle = useHustle()
  const hustleMax = RESOURCES.hustle?.max || 10000
  const hustlePct = Math.min(100, (hustle / hustleMax) * 100)
  return (
    <div style={{ margin: '12px 16px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <VitalTimer
          icon="ti-heart" color="#e74c3c"
          label="Health" cur={vitals.health} max={vitals.healthMax}
          nextMs={msToNextHealth()} ko={vitals.ko}
          onClick={() => { sfx.tap(); openNurse() }}
        />
        <VitalTimer
          icon="ti-bolt" color="#f0d080"
          label="Stamina" cur={vitals.stamina} max={vitals.staminaMax}
          nextMs={msToNextStamina()}
          onClick={() => { sfx.tap(); openNurse() }}
        />
      </div>

      {/* Hustle bar — your spendable cash, right under the vitals. */}
      <div style={{
        marginTop: 10,
        background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 12,
        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-flame" style={{ color: '#c9a84c', fontSize: 18 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ color: '#888', fontSize: 10, letterSpacing: 0.5 }}>Hustle</span>
            <span style={{ color: '#c9a84c', fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {hustle.toLocaleString()}
            </span>
          </div>
          <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${hustlePct}%`, background: 'linear-gradient(90deg, #c9a84c, #f0d080)', borderRadius: 2 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function VitalTimer({ icon, color, label, cur, max, nextMs, ko = false, onClick }) {
  const full = cur >= max
  return (
    <div onClick={onClick} style={{
      background: '#13131f',
      border: `0.5px solid ${ko ? '#e74c3c66' : '#2a2a3a'}`,
      borderRadius: 12,
      padding: '8px 12px',
      display: 'flex', alignItems: 'center', gap: 10,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <i className={`ti ${icon}`} style={{ color, fontSize: 18 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#888', fontSize: 10, letterSpacing: 0.5 }}>
            {label}{onClick && <i className="ti ti-chevron-right" style={{ fontSize: 9, marginLeft: 3, color: '#666' }} />}
          </span>
          <span style={{ color, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {cur.toLocaleString()}/{max.toLocaleString()}
          </span>
        </div>
        <div style={{ color: ko ? '#e74c3c' : full ? '#555' : '#fff', fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
          {ko ? 'KO’d — see nurse' : full ? 'FULL' : fmtCountdown(nextMs)}
        </div>
      </div>
    </div>
  )
}

function fmtCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Your Gang home card — shows your gang at a glance (or a join/found prompt),
// and opens the full Gang view on tap.
function YourGangCard({ onNavigate }) {
  const { myGang } = useGang()
  const open = () => { sfx.tap?.(); onNavigate('gang') }

  if (!myGang) {
    return (
      <div onClick={open} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
        <div style={{ fontSize: 34 }}>🏴</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>You're not in a gang</div>
          <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>Found your own or join one — tap to browse.</div>
        </div>
        <i className="ti ti-chevron-right" style={{ color: '#666', fontSize: 18 }} />
      </div>
    )
  }

  return (
    <div onClick={open} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
      <div style={{ fontSize: 38, width: 46, textAlign: 'center' }}>{myGang.crest}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {myGang.name} <span style={{ color: '#555', fontSize: 11 }}>[{myGang.tag}]</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 3, color: '#555', fontSize: 12 }}>
          <span>{myGang.members.length}/{GANG_CAPACITY} members</span>
          <span style={{ color: '#c9a84c' }}>{myGang.power.toLocaleString()} PWR</span>
        </div>
      </div>
      <i className="ti ti-chevron-right" style={{ color: '#666', fontSize: 18 }} />
    </div>
  )
}
