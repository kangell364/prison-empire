import React, { useState, useEffect } from 'react'
import { PLAYER, RESOURCES, CITY, INCOMING_ATTACK, CREW, LEADERBOARD, RARITY_COLORS } from '../data/gameData'
import { CountdownRing } from '../components/CountdownRing'
import { sfx } from '../sounds'

export default function Dashboard({ onNavigate }) {
  const [timer, setTimer] = useState(INCOMING_ATTACK.timer_seconds)
  const [snitchUsed, setSnitchUsed] = useState(false)
  const [showSnitchModal, setShowSnitchModal] = useState(false)

  useEffect(() => {
    if (timer <= 0 || snitchUsed) return
    const interval = setInterval(() => {
      setTimer(t => {
        const next = Math.max(0, t - 1)
        // Tick sounds escalate as the attack closes in. Quiet above 60s,
        // normal tick under 60s, hot tick under 30s.
        if (next > 0 && next <= 30)      sfx.hotTick()
        else if (next > 0 && next <= 60) sfx.tick()
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [timer, snitchUsed])

  const xpPct = Math.round((PLAYER.xp / PLAYER.xpNext) * 100)

  return (
    <div className="scroll-area animate-in">

      {/* Attack Alert */}
      {!snitchUsed && (
        <div className="attack-alert">
          <div className="alert-icon">
            <i className="ti ti-alert-triangle" />
          </div>
          <div className="alert-content">
            <div className="alert-title">INCOMING ATTACK</div>
            <div className="alert-sub">{INCOMING_ATTACK.attacker} moving on {INCOMING_ATTACK.city}</div>
          </div>
          <CountdownRing
            remaining={timer}
            total={INCOMING_ATTACK.timer_seconds}
            size={48}
            strokeWidth={3.5}
            variant="incoming"
          />
        </div>
      )}

      {snitchUsed && (
        <div style={{ margin: '12px 16px 4px', background: '#0d1a0d', border: '1px solid #2d6a2d', borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, background: 'rgba(46,204,113,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-shield-check" style={{ color: '#2ecc71', fontSize: 20 }} />
          </div>
          <div>
            <div style={{ color: '#2ecc71', fontSize: 13, fontWeight: 500 }}>HOUSTON PROTECTED</div>
            <div style={{ color: '#555', fontSize: 11, marginTop: 2 }}>Cops on alert — attack blocked for 4 hours</div>
          </div>
        </div>
      )}

      {/* Player Card */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Your Card</div>
        <div className="card card-pad" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* Card Art */}
          <div style={{
            width: 70, height: 92,
            background: '#1a1a2e',
            borderRadius: 10,
            border: `1px solid ${RARITY_COLORS[PLAYER.card.rarity]}44`,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, position: 'relative', overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: RARITY_COLORS[PLAYER.card.rarity] }} />
            <div style={{ fontSize: 30, marginBottom: 4 }}>{PLAYER.card.emoji}</div>
            <div style={{ color: RARITY_COLORS[PLAYER.card.rarity], fontSize: 8, fontWeight: 600, letterSpacing: 0.5, textAlign: 'center', padding: '0 4px' }}>{PLAYER.card.name.toUpperCase()}</div>
            <div style={{ color: '#555', fontSize: 8, marginTop: 2 }}>LVL {PLAYER.level}</div>
          </div>

          {/* Player Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 500 }}>{PLAYER.name}</div>
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
      </div>

      {/* Resources */}
      <div className="section">
        <div className="section-label">Resources</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {Object.entries(RESOURCES).map(([key, r]) => (
            <div key={key} className="card card-pad" style={{ padding: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${r.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <i className={`ti ${r.icon}`} style={{ color: r.color, fontSize: 18 }} />
              </div>
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 500 }}>
                {key === 'crew' || key === 'snitch'
                  ? `${r.value} / ${r.max}`
                  : r.value.toLocaleString()}
              </div>
              <div style={{ color: '#555', fontSize: 11, marginTop: 2, textTransform: 'capitalize' }}>
                {key === 'snitch' ? 'Snitches' : key.charAt(0).toUpperCase() + key.slice(1)}
              </div>
              <div style={{ height: 3, background: '#1e1e2a', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((r.value / r.max) * 100)}%`, background: r.color, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* City */}
      <div className="section">
        <div className="section-label">Your City</div>
        <div className="card">
          {/* Mini Map */}
          <div style={{ height: 96, background: '#0d1520', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, opacity: 0.12, backgroundImage: 'linear-gradient(#c9a84c 1px, transparent 1px), linear-gradient(90deg, #c9a84c 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            <div style={{ position: 'absolute', top: 8, left: 12, color: '#c9a84c', fontSize: 10, letterSpacing: 1, fontWeight: 500 }}>TEXAS — ACTIVE</div>
            {[
              { x: '45%', y: '70%', owned: true  },
              { x: '60%', y: '55%', owned: false },
              { x: '68%', y: '25%', owned: true  },
              { x: '25%', y: '75%', owned: null  },
              { x: '78%', y: '45%', owned: false },
            ].map((dot, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: dot.x, top: dot.y,
                width: 10, height: 10,
                borderRadius: '50%',
                background: dot.owned === true ? '#c9a84c' : dot.owned === false ? '#e74c3c' : '#555',
                boxShadow: dot.owned === true ? '0 0 0 4px rgba(201,168,76,0.2)' : dot.owned === false ? '0 0 0 4px rgba(231,76,60,0.2)' : 'none',
                transform: 'translate(-50%, -50%)',
              }} />
            ))}
          </div>

          {/* City Info */}
          <div style={{ padding: '14px 16px 0' }}>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 500 }}>{CITY.name}, {CITY.state}</div>
            <div style={{ color: '#555', fontSize: 11, marginTop: 2 }}>Controlled by you — {CITY.days_held}d {CITY.hours_held}h</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              <div>
                <div style={{ color: '#c9a84c', fontSize: 14, fontWeight: 500 }}>+{CITY.hustle_per_hr}</div>
                <div style={{ color: '#444', fontSize: 10 }}>Hustle/hr</div>
              </div>
              <div>
                <div style={{ color: '#4a9eff', fontSize: 14, fontWeight: 500 }}>+{CITY.steel_per_hr}</div>
                <div style={{ color: '#444', fontSize: 10 }}>Steel/hr</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 14, fontWeight: 500 }}>{CITY.tierName}</div>
                <div style={{ color: '#444', fontSize: 10 }}>Tier {CITY.tier}</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, padding: '14px 16px' }}>
            <button className="btn btn-dark" style={{ flex: 1 }} onClick={() => onNavigate('map')}>
              <i className="ti ti-shield" style={{ fontSize: 15 }} /> Defend
            </button>
            <button className="btn btn-red" style={{ flex: 1 }} onClick={() => setShowSnitchModal(true)} disabled={snitchUsed}>
              <i className="ti ti-eye-off" style={{ fontSize: 15 }} /> {snitchUsed ? 'Snitched' : 'Snitch'}
            </button>
            <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => onNavigate('map')}>
              <i className="ti ti-sword" style={{ fontSize: 15 }} /> Attack
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
            }}>
              <div style={{ color: p.rank === 1 ? '#c9a84c' : p.rank === 2 ? '#888' : p.rank === 3 ? '#8b6914' : '#555', fontSize: 14, fontWeight: 500, width: 20 }}>{p.rank}</div>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#1e1e2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{p.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: p.isYou ? '#c9a84c' : '#fff', fontSize: 13, fontWeight: 500 }}>{p.name}{p.isYou ? ' (You)' : ''}</div>
                <div style={{ color: '#555', fontSize: 10 }}>{p.facility} — {p.state}</div>
              </div>
              <div style={{ color: p.isYou ? '#c9a84c' : '#888', fontSize: 14, fontWeight: 500 }}>{p.power}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Snitch Modal */}
      {showSnitchModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={() => setShowSnitchModal(false)}>
          <div style={{ background: '#13131f', borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 390 }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 20px' }} />
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🚔</div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Call the Cops?</div>
              <div style={{ color: '#888', fontSize: 13, lineHeight: 1.5 }}>Using a snitch will block all incoming attacks for 4 hours — but everyone will know you snitched.</div>
            </div>
            <div style={{ background: '#1a0808', border: '0.5px solid #8b1a1a', borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <div style={{ color: '#e74c3c', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>CONSEQUENCES</div>
              <div style={{ color: '#888', fontSize: 12, lineHeight: 1.6 }}>• -5 Street Cred permanently<br />• "Snitch" badge on your profile<br />• City marked on map for all to see<br />• Attacks resume when protection expires</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ color: '#888', fontSize: 12 }}>Snitches remaining:</div>
              <div style={{ color: '#e74c3c', fontSize: 14, fontWeight: 500 }}>1 / 3 free this week</div>
            </div>
            <button className="btn btn-red btn-full" style={{ marginBottom: 10, padding: 14 }} onClick={() => { setSnitchUsed(true); setShowSnitchModal(false); sfx.snitch() }}>
              <i className="ti ti-eye-off" /> Snitch — Block Attack (Free)
            </button>
            <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={() => setShowSnitchModal(false)}>
              Hold Off — I'll Defend
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
