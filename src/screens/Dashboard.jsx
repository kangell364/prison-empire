import React, { useState } from 'react'
import { PLAYER, PLAYER_LOOKS, RESOURCES, CREW, LEADERBOARD, RARITY_COLORS, RANKED_PLAYERS } from '../data/gameData'
import { useHustle, useSteel, useDisplayName, usePlayerLook } from '../state/profileStore'
import { useBlocksVersion, yourBlockCount, yourBlockIncomePerHr, yourPendingIncome, collectAllBlocks, MAX_BLOCKS } from '../state/blocksStore'
import { useVitals, msToNextStamina, msToNextHealth, STAMINA_MAX, HEALTH_MAX } from '../state/vitalsStore'
import { Avatar } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import { SwapLookModal } from '../components/SwapLookModal'
import { sfx } from '../sounds'

export default function Dashboard({ onNavigate }) {
  const [detailChar, setDetailChar] = useState(null)
  const [showSwap, setShowSwap] = useState(false)

  const xpPct = Math.round((PLAYER.xp / PLAYER.xpNext) * 100)
  const hustle = useHustle()
  const steel  = useSteel()
  // Live "Your Turf" block economy — re-renders when blocks change (recruit /
  // poach / collect / AI poach).
  useBlocksVersion()
  const blocksOwned = yourBlockCount()
  const blockIncomeHr = yourBlockIncomePerHr()
  const blockPending  = yourPendingIncome()
  const playerName = useDisplayName()
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
          {/* Card Art — the player's chosen cosmetic look (swappable). */}
          <div style={{
            width: 70, height: 92,
            background: '#1a1a2e',
            borderRadius: 10,
            border: `1px solid ${lookColor}44`,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-end',
            flexShrink: 0, position: 'relative', overflow: 'hidden'
          }}>
            {look.avatar ? (
              <img src={look.avatar} alt={look.name}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
            ) : (
              <div style={{ fontSize: 30, marginBottom: 4 }}>{look.emoji}</div>
            )}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: lookColor }} />
            <div style={{
              position: 'relative', zIndex: 1, width: '100%',
              background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.85) 60%)',
              padding: '12px 4px 3px',
            }}>
              <div style={{ color: lookColor, fontSize: 8, fontWeight: 700, letterSpacing: 0.5, textAlign: 'center' }}>{playerName.toUpperCase()}</div>
              <div style={{ color: '#bbb', fontSize: 8, marginTop: 1, textAlign: 'center' }}>LVL {PLAYER.level}</div>
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
                <span style={{ color: '#555', fontSize: 10 }}>XP to Level {PLAYER.level + 1}</span>
                <span style={{ color: '#888', fontSize: 10 }}>{PLAYER.xp.toLocaleString()} / {PLAYER.xpNext.toLocaleString()}</span>
              </div>
              <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${xpPct}%`, background: 'linear-gradient(90deg, #c9a84c, #f0d080)', borderRadius: 2 }} />
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { val: PLAYER.power,   lbl: 'Power'  },
                { val: `${PLAYER.loyalty}%`, lbl: 'Loyalty' },
                { val: `#${PLAYER.rank}`,    lbl: 'Texas'   },
              ].map(s => (
                <div key={s.lbl} style={{ background: '#1e1e2a', borderRadius: 8, padding: '5px 10px', textAlign: 'center' }}>
                  <div style={{ color: '#c9a84c', fontSize: 13, fontWeight: 500 }}>{s.val}</div>
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
        <div className="section-label">Resources</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {Object.entries(RESOURCES).map(([key, r]) => {
            // hustle + steel come from the profile now; crew + snitch are
            // still static until their own phases land.
            const value = key === 'hustle' ? hustle
                        : key === 'steel'  ? steel
                        : r.value
            return (
              <div key={key} className="card card-pad" style={{ padding: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${r.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <i className={`ti ${r.icon}`} style={{ color: r.color, fontSize: 18 }} />
                </div>
                <div style={{ color: '#fff', fontSize: 22, fontWeight: 500 }}>
                  {key === 'crew' || key === 'snitch'
                    ? `${value} / ${r.max}`
                    : value.toLocaleString()}
                </div>
                <div style={{ color: '#555', fontSize: 11, marginTop: 2, textTransform: 'capitalize' }}>
                  {key === 'snitch' ? 'Snitches' : key.charAt(0).toUpperCase() + key.slice(1)}
                </div>
                <div style={{ height: 3, background: '#1e1e2a', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((value / r.max) * 100)}%`, background: r.color, borderRadius: 2 }} />
                </div>
              </div>
            )
          })}
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
              <div style={{ color: '#666', fontSize: 11 }}>{blocksOwned}/{MAX_BLOCKS} blocks</div>
            </div>
            <div style={{ color: '#555', fontSize: 11, marginTop: 2 }}>
              {blocksOwned === 0 ? 'Claim turf on the map to start earning passive Hustle.' : 'Passive Hustle from the blocks you run'}
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
              <div>
                <div style={{ color: blockPending > 0 ? '#c9a84c' : '#666', fontSize: 15, fontWeight: 500 }}>{blockPending.toLocaleString()}</div>
                <div style={{ color: '#444', fontSize: 10 }}>To Collect</div>
              </div>
            </div>
            <button className="btn btn-gold btn-full" style={{ marginTop: 14, padding: 12 }} disabled={blockPending <= 0}
              onClick={() => { const got = collectAllBlocks(); got > 0 ? sfx.buy() : sfx.deny() }}>
              <i className="ti ti-coin" style={{ fontSize: 15 }} /> {blockPending > 0 ? `Collect ${blockPending.toLocaleString()} Hustle` : 'Nothing to Collect'}
            </button>
          </div>
        </div>
      </div>

      {/* Crew */}
      <div className="section">
        <div className="section-label">Your Crew ({CREW.filter(c => !c.locked).length}/{CREW.length})</div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
          {CREW.map(member => (
            <div key={member.id} style={{
              flexShrink: 0, width: 72,
              background: '#13131f',
              border: `0.5px solid ${member.locked ? '#1e1e2a' : '#2a2a3a'}`,
              borderRadius: 14, padding: '10px 8px',
              textAlign: 'center',
              opacity: member.locked ? 0.5 : 1,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: '#1e1e2a', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: member.locked ? 16 : 20 }}>
                {member.locked ? <i className="ti ti-lock" style={{ color: '#333' }} /> : member.emoji}
              </div>
              <div style={{ color: member.locked ? '#333' : '#888', fontSize: 9, fontWeight: 500 }}>
                {member.locked ? `Lv ${member.unlockLevel}` : member.name}
              </div>
              {!member.locked && <div style={{ color: '#c9a84c', fontSize: 11, marginTop: 2 }}>+{member.power}</div>}
            </div>
          ))}
        </div>
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
            }} onClick={() => setDetailChar(RANKED_PLAYERS.find(rp => rp.name === p.name) || p)}>
              <div style={{ color: p.rank === 1 ? '#c9a84c' : p.rank === 2 ? '#888' : p.rank === 3 ? '#8b6914' : '#555', fontSize: 14, fontWeight: 500, width: 20 }}>{p.rank}</div>
              <Avatar src={p.avatar} emoji={p.emoji} size={36} radius={10}
                style={{ background: '#1e1e2a' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: p.isYou ? '#c9a84c' : '#fff', fontSize: 13, fontWeight: 500 }}>{p.name}{p.isYou ? ' (You)' : ''}</div>
                <div style={{ color: '#555', fontSize: 10 }}>{p.facility} — {p.state}</div>
              </div>
              <div style={{ color: p.isYou ? '#c9a84c' : '#888', fontSize: 14, fontWeight: 500 }}>{p.power}</div>
            </div>
          ))}
        </div>
      </div>

      {detailChar && (
        <CharacterDetailModal character={detailChar} onClose={() => setDetailChar(null)} />
      )}

      {showSwap && <SwapLookModal onClose={() => setShowSwap(false)} />}

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
  return (
    <div style={{
      margin: '12px 16px 0',
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
    }}>
      <VitalTimer
        icon="ti-heart" color="#e74c3c"
        label="Health" cur={vitals.health} max={HEALTH_MAX}
        nextMs={msToNextHealth()}
      />
      <VitalTimer
        icon="ti-bolt" color="#f0d080"
        label="Stamina" cur={vitals.stamina} max={STAMINA_MAX}
        nextMs={msToNextStamina()}
      />
    </div>
  )
}

function VitalTimer({ icon, color, label, cur, max, nextMs }) {
  const full = cur >= max
  return (
    <div style={{
      background: '#13131f',
      border: '0.5px solid #2a2a3a',
      borderRadius: 12,
      padding: '8px 12px',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <i className={`ti ${icon}`} style={{ color, fontSize: 18 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#888', fontSize: 10, letterSpacing: 0.5 }}>{label}</span>
          <span style={{ color, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {cur.toLocaleString()}/{max.toLocaleString()}
          </span>
        </div>
        <div style={{ color: full ? '#555' : '#fff', fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
          {full ? 'FULL' : fmtCountdown(nextMs)}
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
