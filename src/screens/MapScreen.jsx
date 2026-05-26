import React, { useState } from 'react'
import { MAP_CITIES, PLAYER } from '../data/gameData'

export default function MapScreen() {
  const [selectedCity, setSelectedCity] = useState(null)
  const [attacking, setAttacking] = useState(null)
  const [attackTimer, setAttackTimer] = useState(null)

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

  const formatTimer = (secs) => {
    if (!secs) return '00:00'
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }

  return (
    <div className="scroll-area animate-in">

      {/* Attack in Progress */}
      {attacking && (
        <div style={{ margin: '14px 16px 0', background: '#1a0d00', border: '1px solid #c9a84c44', borderRadius: 16, padding: 14 }}>
          <div style={{ color: '#c9a84c', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            <i className="ti ti-sword" style={{ marginRight: 6 }} />
            Attack En Route to {attacking.name}
          </div>
          <div style={{ color: '#888', fontSize: 11, marginBottom: 8 }}>Your crew is moving — cannot cancel</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 6, background: '#1e1e2a', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#c9a84c', borderRadius: 3, width: `${Math.round((1 - attackTimer / (15*60)) * 100)}%`, transition: 'width 1s linear' }} />
            </div>
            <div style={{ color: '#c9a84c', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatTimer(attackTimer)}</div>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Texas Territory Map</div>
        <div style={{ background: '#0d1520', borderRadius: 20, border: '0.5px solid #2a2a3a', padding: 16, position: 'relative', height: 280 }}>
          {/* Grid */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.08, backgroundImage: 'linear-gradient(#c9a84c 1px, transparent 1px), linear-gradient(90deg, #c9a84c 1px, transparent 1px)', backgroundSize: '25px 25px', borderRadius: 20 }} />

          {/* State label */}
          <div style={{ position: 'absolute', top: 12, left: 16, color: '#c9a84c', fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>TEXAS</div>

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[{ color: '#c9a84c', label: 'Yours' }, { color: '#e74c3c', label: 'Enemy' }, { color: '#555', label: 'Open' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
                <span style={{ color: '#555', fontSize: 9 }}>{l.label}</span>
              </div>
            ))}
          </div>

          {/* City Dots */}
          {MAP_CITIES.map(city => (
            <div
              key={city.id}
              onClick={() => setSelectedCity(city)}
              style={{
                position: 'absolute',
                left: `${city.x}%`,
                top: `${city.y}%`,
                transform: 'translate(-50%, -50%)',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: city.tier === 3 ? 14 : city.tier === 2 ? 11 : 9,
                height: city.tier === 3 ? 14 : city.tier === 2 ? 11 : 9,
                borderRadius: '50%',
                background: city.isYours ? '#c9a84c' : city.owner ? '#e74c3c' : '#555',
                boxShadow: city.isYours ? '0 0 0 4px rgba(201,168,76,0.2)' : city.owner ? '0 0 0 4px rgba(231,76,60,0.15)' : 'none',
              }} />
              <div style={{ color: city.isYours ? '#c9a84c' : city.owner ? '#e74c3c' : '#555', fontSize: 8, textAlign: 'center', marginTop: 3, whiteSpace: 'nowrap' }}>{city.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* City List */}
      <div className="section">
        <div className="section-label">All Cities</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MAP_CITIES.map(city => (
            <div key={city.id} className="card card-pad" style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderColor: city.isYours ? '#c9a84c44' : '#2a2a3a',
              cursor: 'pointer',
            }} onClick={() => setSelectedCity(city)}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: city.isYours ? '#c9a84c' : city.owner ? '#e74c3c' : '#555', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: city.isYours ? '#c9a84c' : '#fff', fontSize: 14, fontWeight: 500 }}>{city.name}, {city.state}</div>
                <div style={{ color: '#555', fontSize: 11 }}>
                  {city.isYours ? 'Your territory' : city.owner ? `Owned by ${city.owner}` : 'Unclaimed — free to take'}
                </div>
              </div>
              <div style={{ color: '#555', fontSize: 11 }}>Tier {city.tier}</div>
              {!city.isYours && (
                <button className="btn btn-gold" style={{ padding: '6px 12px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setSelectedCity(city) }}>
                  Attack
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* City Detail Modal */}
      {selectedCity && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={() => setSelectedCity(null)}>
          <div style={{ background: '#13131f', borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 390 }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 20px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: selectedCity.isYours ? '#c9a84c18' : selectedCity.owner ? '#e74c3c18' : '#1e1e2a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-building-skyscraper" style={{ color: selectedCity.isYours ? '#c9a84c' : selectedCity.owner ? '#e74c3c' : '#555', fontSize: 24 }} />
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 500 }}>{selectedCity.name}, {selectedCity.state}</div>
                <div style={{ color: '#555', fontSize: 12 }}>Tier {selectedCity.tier} — {selectedCity.tier === 3 ? 'Major City' : selectedCity.tier === 2 ? 'Mid City' : 'Small City'}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ color: '#c9a84c', fontSize: 18, fontWeight: 500 }}>+{selectedCity.tier * 140}</div>
                <div style={{ color: '#555', fontSize: 11 }}>Hustle/hr</div>
              </div>
              <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ color: '#4a9eff', fontSize: 18, fontWeight: 500 }}>+{selectedCity.tier * 60}</div>
                <div style={{ color: '#555', fontSize: 11 }}>Steel/hr</div>
              </div>
            </div>

            <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <div style={{ color: '#888', fontSize: 12 }}>Current Owner</div>
              <div style={{ color: selectedCity.isYours ? '#c9a84c' : selectedCity.owner ? '#e74c3c' : '#2ecc71', fontSize: 14, fontWeight: 500, marginTop: 4 }}>
                {selectedCity.isYours ? `${PLAYER.name} (You)` : selectedCity.owner || 'Unclaimed — Take it now!'}
              </div>
            </div>

            {!selectedCity.isYours && (
              <>
                <div style={{ background: '#1a0d00', border: '0.5px solid #c9a84c44', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                  <div style={{ color: '#c9a84c', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Attack Info</div>
                  <div style={{ color: '#888', fontSize: 12, lineHeight: 1.6 }}>
                    • Travel time: 15 minutes<br />
                    • Defender gets notified immediately<br />
                    • They can snitch to block your attack<br />
                    • Cost: 500 Hustle
                  </div>
                </div>
                <button className="btn btn-gold btn-full" style={{ padding: 14, marginBottom: 10 }} onClick={() => launchAttack(selectedCity)}>
                  <i className="ti ti-sword" /> Launch Attack — 15 min
                </button>
              </>
            )}
            <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={() => setSelectedCity(null)}>Close</button>
          </div>
        </div>
      )}

    </div>
  )
}
