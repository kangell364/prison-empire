import React, { useState, useMemo } from 'react'
import { ALL_CITIES, PLAYER } from '../data/gameData'
import { CountdownRing } from '../components/CountdownRing'
import { LeafletMap } from '../components/LeafletMap'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#555'

export default function MapScreen() {
  const [selectedCity, setSelectedCity] = useState(null)
  const [attacking, setAttacking]       = useState(null)
  const [attackTimer, setAttackTimer]   = useState(null)

  const totals = useMemo(() => ({
    yours: ALL_CITIES.filter(c => c.isYours).length,
    enemy: ALL_CITIES.filter(c => !c.isYours && c.owner).length,
    open:  ALL_CITIES.filter(c => !c.owner).length,
  }), [])

  // States where you or an enemy have presence — surfaces below the map
  const presence = useMemo(() => {
    const m = {}
    ALL_CITIES.forEach(c => {
      if (!m[c.state]) m[c.state] = { state: c.state, yours: 0, enemy: 0, total: 0 }
      m[c.state].total++
      if (c.isYours) m[c.state].yours++
      else if (c.owner) m[c.state].enemy++
    })
    return Object.values(m)
      .filter(s => s.yours > 0 || s.enemy > 0)
      .sort((a, b) => b.yours - a.yours || b.enemy - a.enemy)
  }, [])

  const launchAttack = (city) => {
    setSelectedCity(null)
    setAttacking(city)
    sfx.launch()
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

  return (
    <div className="scroll-area animate-in">
      {attacking && <AttackBanner attacking={attacking} timer={attackTimer} />}

      {/* Empire summary */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <SummaryStat label="Your Cities" value={totals.yours} color={GOLD} />
          <SummaryStat label="Enemy Held"  value={totals.enemy} color={RED} />
          <SummaryStat label="Open"        value={totals.open}  color={DIM} />
        </div>
      </div>

      {/* Real-world map */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">United States — Live Territory</div>
        <div style={{
          border: `0.5px solid ${GOLD}33`,
          borderRadius: 16,
          overflow: 'hidden',
          background: '#0d0d15',
        }}>
          <LeafletMap
            cities={ALL_CITIES}
            onCityClick={(city) => setSelectedCity(city)}
            height="58vh"
          />
          {/* Legend strip */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 16,
            padding: '10px 12px',
            borderTop: `0.5px solid ${GOLD}22`,
          }}>
            {[
              { color: GOLD, label: 'Yours' },
              { color: RED,  label: 'Enemy' },
              { color: DIM,  label: 'Open' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, boxShadow: `0 0 6px ${l.color}77` }} />
                <span style={{ color: '#888', fontSize: 11 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* State presence list */}
      <div className="section">
        <div className="section-label">Active States</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {presence.map(s => (
            <div key={s.state} className="card card-pad" style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderColor: s.yours > 0 ? `${GOLD}44` : `${RED}33`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: s.yours > 0 ? `${GOLD}18` : `${RED}18`,
                color: s.yours > 0 ? GOLD : RED,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600, letterSpacing: 1,
              }}>{s.state}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
                  {s.state} — {s.total} {s.total === 1 ? 'city' : 'cities'}
                </div>
                <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>
                  {s.yours > 0 && <span style={{ color: GOLD }}>{s.yours} yours</span>}
                  {s.yours > 0 && s.enemy > 0 && ' · '}
                  {s.enemy > 0 && <span style={{ color: RED }}>{s.enemy} enemy</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* City detail modal — same as before */}
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

// ---------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------

function SummaryStat({ label, value, color }) {
  return (
    <div style={{
      background: '#13131f',
      border: '0.5px solid #2a2a3a',
      borderRadius: 14, padding: '12px 10px',
      textAlign: 'center',
    }}>
      <div style={{ color, fontSize: 22, fontWeight: 500, lineHeight: 1 }}>{value}</div>
      <div style={{ color: DIM, fontSize: 10, marginTop: 5, letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

function CityDetailModal({ city, onClose, onAttack }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: '#13131f', borderRadius: '24px 24px 0 0', padding: 24,
        width: '100%', maxWidth: 390,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: city.isYours ? `${GOLD}18` : city.owner ? `${RED}18` : '#1e1e2a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="ti ti-building-skyscraper" style={{
              color: city.isYours ? GOLD : city.owner ? RED : DIM, fontSize: 24,
            }} />
          </div>
          <div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 500 }}>{city.name}, {city.state}</div>
            <div style={{ color: DIM, fontSize: 12 }}>
              Tier {city.tier} — {city.tier === 3 ? 'Major City' : city.tier === 2 ? 'Mid City' : 'Small City'}
            </div>
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
              <div style={{ color: GOLD, fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Drive By Info</div>
              <div style={{ color: '#888', fontSize: 12, lineHeight: 1.6 }}>
                • Travel time: 15 minutes<br />
                • Defender gets notified immediately<br />
                • They can snitch to block your drive by<br />
                • Cost: 500 Hustle
              </div>
            </div>
            <button className="btn btn-gold btn-full" style={{ padding: 14, marginBottom: 10 }} onClick={() => onAttack(city)}>
              <i className="ti ti-sword" /> Launch Drive By — 15 min
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
  return (
    <div style={{
      margin: '14px 16px 0',
      background: 'linear-gradient(135deg, #1a0d00 0%, #100a02 100%)',
      border: `1px solid ${GOLD}44`,
      borderRadius: 16, padding: 14,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <CountdownRing remaining={timer} total={total} size={64} strokeWidth={4} variant="outbound" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: GOLD, fontSize: 13, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-sword" /> Drive By En Route
        </div>
        <div style={{ color: '#fff', fontSize: 13, marginBottom: 2 }}>→ {attacking.name}</div>
        <div style={{ color: DIM, fontSize: 10 }}>Your crew is moving — cannot cancel</div>
      </div>
    </div>
  )
}
