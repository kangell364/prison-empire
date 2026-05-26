import React, { useState, useMemo } from 'react'
import { US_STATES, ALL_CITIES, GRID_COLS, GRID_ROWS, PLAYER } from '../data/gameData'
import { CountdownRing } from '../components/CountdownRing'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#555'

function summarizeState(abbr, cities) {
  const inState = cities.filter(c => c.state === abbr)
  const yours   = inState.filter(c => c.isYours).length
  const enemy   = inState.filter(c => !c.isYours && c.owner).length
  const open    = inState.filter(c => !c.owner).length
  let status    = 'open'
  if (yours > 0 && enemy > 0) status = 'contested'
  else if (yours > 0)         status = 'yours'
  else if (enemy > 0)         status = 'enemy'
  else if (inState.length === 0) status = 'empty'
  return { total: inState.length, yours, enemy, open, status }
}

export default function MapScreen() {
  const [selectedState, setSelectedState] = useState(null)
  const [selectedCity, setSelectedCity]   = useState(null)
  const [attacking, setAttacking]         = useState(null)
  const [attackTimer, setAttackTimer]     = useState(null)

  const summaries = useMemo(() => {
    const m = {}
    US_STATES.forEach(s => { m[s.abbr] = summarizeState(s.abbr, ALL_CITIES) })
    return m
  }, [])

  const totals = useMemo(() => ({
    yours:   ALL_CITIES.filter(c => c.isYours).length,
    enemy:   ALL_CITIES.filter(c => !c.isYours && c.owner).length,
    open:    ALL_CITIES.filter(c => !c.owner).length,
    states:  US_STATES.length,
  }), [])

  const launchAttack = (city) => {
    setSelectedCity(null)
    setAttacking(city)
    let secs = 15 * 60
    setAttackTimer(secs)
    const interval = setInterval(() => {
      secs--
      setAttackTimer(secs)
      if (secs <= 0) {
        clearInterval(interval)
        setAttacking(null)
        setAttackTimer(null)
      }
    }, 1000)
  }

  // Build the tile-grid cells (row-major, with empties for unmapped cells)
  const gridCells = useMemo(() => {
    const byPos = {}
    US_STATES.forEach(s => { byPos[`${s.col},${s.row}`] = s })
    const cells = []
    for (let r = 1; r <= GRID_ROWS; r++) {
      for (let c = 1; c <= GRID_COLS; c++) {
        cells.push({ col: c, row: r, state: byPos[`${c},${r}`] || null })
      }
    }
    return cells
  }, [])

  if (selectedState) {
    const cities = ALL_CITIES.filter(c => c.state === selectedState.abbr)
    const sum    = summaries[selectedState.abbr]
    return (
      <div className="scroll-area animate-in">
        {/* Attack in Progress */}
        {attacking && <AttackBanner attacking={attacking} timer={attackTimer} />}

        {/* State header */}
        <div style={{ padding: '14px 16px 0' }}>
          <button onClick={() => setSelectedState(null)} style={{
            background: 'none', border: 'none', color: GOLD, fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 4, padding: 0, cursor: 'pointer', marginBottom: 10,
          }}>
            <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
            Back to US Map
          </button>

          <div style={{
            background: 'linear-gradient(135deg, #15110a, #1a1510)',
            border: `0.5px solid ${GOLD}44`,
            borderRadius: 20, padding: 18,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0, opacity: 0.08,
              backgroundImage: `linear-gradient(${GOLD} 1px, transparent 1px), linear-gradient(90deg, ${GOLD} 1px, transparent 1px)`,
              backgroundSize: '20px 20px',
            }} />
            <div style={{ position: 'relative' }}>
              <div style={{ color: GOLD, fontSize: 11, letterSpacing: 2, fontWeight: 600 }}>STATE</div>
              <div style={{ color: '#fff', fontSize: 26, fontWeight: 500, marginTop: 2 }}>
                {selectedState.name}
              </div>
              <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                {sum.total} {sum.total === 1 ? 'city' : 'cities'} —{' '}
                <span style={{ color: GOLD }}>{sum.yours} yours</span> ·{' '}
                <span style={{ color: RED }}>{sum.enemy} enemy</span> ·{' '}
                <span style={{ color: DIM }}>{sum.open} open</span>
              </div>
            </div>
          </div>
        </div>

        {/* City list */}
        <div className="section" style={{ marginTop: 14 }}>
          <div className="section-label">Cities — {selectedState.abbr}</div>
          {cities.length === 0 ? (
            <div className="card card-pad" style={{ textAlign: 'center', color: DIM, fontSize: 12 }}>
              No cities mapped in this state yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cities.map(city => (
                <CityRow key={city.id} city={city} onSelect={() => setSelectedCity(city)} />
              ))}
            </div>
          )}
        </div>

        {selectedCity && (
          <CityDetailModal
            city={selectedCity}
            onClose={() => setSelectedCity(null)}
            onAttack={launchAttack}
          />
        )}
      </div>
    )
  }

  // US overview
  return (
    <div className="scroll-area animate-in">
      {/* Attack in Progress */}
      {attacking && <AttackBanner attacking={attacking} timer={attackTimer} />}

      {/* Empire summary */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <SummaryStat label="Your Cities" value={totals.yours}    color={GOLD} />
          <SummaryStat label="Enemy Held"  value={totals.enemy}    color={RED} />
          <SummaryStat label="Open"        value={totals.open}     color={DIM} />
        </div>
      </div>

      {/* US Tile Grid Map */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">United States — Territory Map</div>
        <div style={{
          background: 'linear-gradient(160deg, #0d0d15 0%, #0a0a0f 100%)',
          border: `0.5px solid ${GOLD}33`,
          borderRadius: 20, padding: '20px 14px 14px',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Subtle grid overlay */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.06, pointerEvents: 'none',
            backgroundImage: `linear-gradient(${GOLD} 1px, transparent 1px), linear-gradient(90deg, ${GOLD} 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }} />
          {/* Corner brand */}
          <div style={{ position: 'absolute', top: 10, left: 14, color: GOLD, fontSize: 9, letterSpacing: 2, fontWeight: 600 }}>USA · LIVE</div>
          <div style={{ position: 'absolute', top: 10, right: 14, color: '#444', fontSize: 9, letterSpacing: 1 }}>50 STATES</div>

          {/* Grid */}
          <div style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
            gap: 4,
            marginTop: 18,
          }}>
            {gridCells.map(cell => (
              cell.state
                ? <StateTile
                    key={cell.state.abbr}
                    state={cell.state}
                    summary={summaries[cell.state.abbr]}
                    onClick={() => setSelectedState(cell.state)}
                  />
                : <div key={`e-${cell.col}-${cell.row}`} style={{ aspectRatio: '1', visibility: 'hidden' }} />
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 14, paddingTop: 12, borderTop: `0.5px solid ${GOLD}22` }}>
            {[
              { label: 'Yours',     color: GOLD },
              { label: 'Enemy',     color: RED },
              { label: 'Contested', color: GOLD, dashed: true },
              { label: 'Open',      color: DIM },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: l.color,
                  ...(l.dashed ? { border: `1px dashed ${RED}`, background: 'transparent' } : {}),
                }} />
                <span style={{ color: '#666', fontSize: 10 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick states list — yours + contested first */}
      <div className="section">
        <div className="section-label">Your Territory</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {US_STATES
            .filter(s => summaries[s.abbr].yours > 0 || summaries[s.abbr].enemy > 0)
            .sort((a, b) => summaries[b.abbr].yours - summaries[a.abbr].yours)
            .map(s => {
              const sum = summaries[s.abbr]
              return (
                <div key={s.abbr} onClick={() => setSelectedState(s)} className="card card-pad" style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  borderColor: sum.yours > 0 ? `${GOLD}44` : `${RED}33`,
                  cursor: 'pointer',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: sum.yours > 0 ? `${GOLD}18` : `${RED}18`,
                    color: sum.yours > 0 ? GOLD : RED,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, letterSpacing: 1,
                  }}>{s.abbr}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>
                      {sum.yours > 0 && <span style={{ color: GOLD }}>{sum.yours} yours</span>}
                      {sum.yours > 0 && sum.enemy > 0 && ' · '}
                      {sum.enemy > 0 && <span style={{ color: RED }}>{sum.enemy} enemy</span>}
                      {' · '}{sum.total} total
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: '#333', fontSize: 16 }} />
                </div>
              )
            })}
        </div>
      </div>

      {selectedCity && (
        <CityDetailModal
          city={selectedCity}
          onClose={() => setSelectedCity(null)}
          onAttack={launchAttack}
        />
      )}
    </div>
  )
}

function StateTile({ state, summary, onClick }) {
  const isYours     = summary.status === 'yours' || summary.status === 'contested'
  const isContested = summary.status === 'contested'
  const isEnemy     = summary.status === 'enemy'
  const isOpen      = summary.status === 'open'

  const bg = isYours
    ? `linear-gradient(135deg, ${GOLD}22 0%, ${GOLD}10 100%)`
    : isEnemy
    ? `linear-gradient(135deg, ${RED}1a 0%, ${RED}0a 100%)`
    : isOpen
    ? '#13131f'
    : '#0f0f18'

  const border = isYours
    ? `1px solid ${GOLD}88`
    : isEnemy
    ? `1px solid ${RED}66`
    : isOpen
    ? '0.5px solid #2a2a3a'
    : '0.5px solid #1e1e2a'

  const glow = isYours
    ? `0 0 12px ${GOLD}33, inset 0 0 0 1px ${GOLD}22`
    : isEnemy
    ? `0 0 8px ${RED}22`
    : 'none'

  const labelColor = isYours ? GOLD : isEnemy ? RED : isOpen ? '#888' : DIM

  return (
    <button
      onClick={onClick}
      aria-label={`${state.name} — ${summary.total} cities`}
      style={{
        position: 'relative',
        aspectRatio: '1',
        background: bg,
        border,
        borderRadius: 6,
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: glow,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        ...(isContested ? { animation: 'pulse 2s infinite' } : {}),
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
    >
      <span style={{
        color: labelColor,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.5,
        lineHeight: 1,
      }}>{state.abbr}</span>
      {summary.total > 0 && (
        <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
          {Array.from({ length: Math.min(summary.total, 4) }).map((_, i) => {
            // Color the dots: first yours, then enemy, then open
            let dotColor = DIM
            if (i < summary.yours) dotColor = GOLD
            else if (i < summary.yours + summary.enemy) dotColor = RED
            else dotColor = '#333'
            return <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: dotColor }} />
          })}
        </div>
      )}
      {isYours && !isContested && (
        <div style={{
          position: 'absolute', top: 2, right: 2,
          width: 4, height: 4, borderRadius: '50%',
          background: GOLD, boxShadow: `0 0 4px ${GOLD}`,
        }} />
      )}
    </button>
  )
}

function SummaryStat({ label, value, color }) {
  return (
    <div style={{
      background: '#13131f',
      border: '0.5px solid #2a2a3a',
      borderRadius: 14,
      padding: '12px 10px',
      textAlign: 'center',
    }}>
      <div style={{ color, fontSize: 22, fontWeight: 500, lineHeight: 1 }}>{value}</div>
      <div style={{ color: DIM, fontSize: 10, marginTop: 5, letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

function CityRow({ city, onSelect }) {
  const dotColor = city.isYours ? GOLD : city.owner ? RED : DIM
  return (
    <div onClick={onSelect} className="card card-pad" style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      borderColor: city.isYours ? `${GOLD}44` : '#2a2a3a',
      cursor: 'pointer',
    }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: city.isYours ? GOLD : '#fff', fontSize: 14, fontWeight: 500 }}>{city.name}</div>
        <div style={{ color: DIM, fontSize: 11, marginTop: 1 }}>
          {city.isYours ? 'Your territory' : city.owner ? `Held by ${city.owner}` : 'Unclaimed — free to take'}
        </div>
      </div>
      <div style={{ color: DIM, fontSize: 10 }}>T{city.tier}</div>
      {!city.isYours && (
        <button className="btn btn-gold" style={{ padding: '6px 12px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); onSelect() }}>
          Attack
        </button>
      )}
    </div>
  )
}

function CityDetailModal({ city, onClose, onAttack }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: '#13131f', borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 390 }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: city.isYours ? `${GOLD}18` : city.owner ? `${RED}18` : '#1e1e2a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="ti ti-building-skyscraper" style={{
              color: city.isYours ? GOLD : city.owner ? RED : DIM,
              fontSize: 24,
            }} />
          </div>
          <div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 500 }}>{city.name}, {city.state}</div>
            <div style={{ color: DIM, fontSize: 12 }}>Tier {city.tier} — {city.tier === 3 ? 'Major City' : city.tier === 2 ? 'Mid City' : 'Small City'}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
            <div style={{ color: GOLD, fontSize: 18, fontWeight: 500 }}>+{city.tier * 140}</div>
            <div style={{ color: DIM, fontSize: 11 }}>Hustle/hr</div>
          </div>
          <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
            <div style={{ color: '#4a9eff', fontSize: 18, fontWeight: 500 }}>+{city.tier * 60}</div>
            <div style={{ color: DIM, fontSize: 11 }}>Steel/hr</div>
          </div>
        </div>

        <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <div style={{ color: '#888', fontSize: 12 }}>Current Owner</div>
          <div style={{
            color: city.isYours ? GOLD : city.owner ? RED : '#2ecc71',
            fontSize: 14, fontWeight: 500, marginTop: 4,
          }}>
            {city.isYours ? `${PLAYER.name} (You)` : city.owner || 'Unclaimed — take it now!'}
          </div>
        </div>

        {!city.isYours && (
          <>
            <div style={{ background: '#1a0d00', border: `0.5px solid ${GOLD}44`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <div style={{ color: GOLD, fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Attack Info</div>
              <div style={{ color: '#888', fontSize: 12, lineHeight: 1.6 }}>
                • Travel time: 15 minutes<br />
                • Defender gets notified immediately<br />
                • They can snitch to block your attack<br />
                • Cost: 500 Hustle
              </div>
            </div>
            <button className="btn btn-gold btn-full" style={{ padding: 14, marginBottom: 10 }} onClick={() => onAttack(city)}>
              <i className="ti ti-sword" /> Launch Attack — 15 min
            </button>
          </>
        )}
        <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

function AttackBanner({ attacking, timer }) {
  const total = 15 * 60
  const travelPct = Math.min(1, Math.max(0, 1 - timer / total))
  return (
    <div style={{
      margin: '14px 16px 0',
      background: 'linear-gradient(135deg, #1a0d00 0%, #100a02 100%)',
      border: `1px solid ${GOLD}44`,
      borderRadius: 16,
      padding: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}>
      <CountdownRing remaining={timer} total={total} size={72} strokeWidth={4} variant="outbound" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: GOLD, fontSize: 13, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-sword" /> Attack En Route
        </div>
        <div style={{ color: '#fff', fontSize: 13, marginBottom: 2 }}>→ {attacking.name}</div>
        <div style={{ color: DIM, fontSize: 10, marginBottom: 6 }}>Your crew is moving — cannot cancel</div>
        <AttackPath pct={travelPct} />
      </div>
    </div>
  )
}

function AttackPath({ pct }) {
  return (
    <div style={{ position: 'relative', height: 16, width: '100%' }}>
      {/* Dashed track */}
      <div style={{
        position: 'absolute', top: '50%', left: 4, right: 4,
        height: 1,
        backgroundImage: `linear-gradient(90deg, ${GOLD} 50%, transparent 50%)`,
        backgroundSize: '6px 1px',
        backgroundRepeat: 'repeat-x',
        opacity: 0.35,
      }} />
      {/* Origin (you) */}
      <div style={{
        position: 'absolute', top: '50%', left: 0,
        width: 8, height: 8, borderRadius: '50%',
        background: GOLD, transform: 'translateY(-50%)',
        boxShadow: `0 0 6px ${GOLD}`,
      }} />
      {/* Target (city) — pulsing ping */}
      <div style={{
        position: 'absolute', top: '50%', right: 0,
        width: 10, height: 10, borderRadius: '50%',
        transform: 'translateY(-50%)',
      }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: RED, opacity: 0.8 }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: `1.5px solid ${RED}`,
          animation: 'targetPing 1.2s ease-out infinite',
        }} />
      </div>
      {/* Sword traveling along the path */}
      <div style={{
        position: 'absolute', top: '50%', left: `calc(${pct * 100}% - 8px)`,
        transform: 'translateY(-50%)',
        transition: 'left 1s linear',
        filter: `drop-shadow(0 0 4px ${GOLD})`,
      }}>
        <i className="ti ti-sword" style={{ color: GOLD, fontSize: 16 }} />
      </div>
    </div>
  )
}
