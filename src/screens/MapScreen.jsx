import React, { useState, useMemo, useEffect, useRef } from 'react'
import { ALL_CITIES, PLAYER } from '../data/gameData'
import { CountdownRing } from '../components/CountdownRing'
import { USCountryMap } from '../components/USCountryMap'
import { USStateMap } from '../components/USStateMap'
import { useMapData, buildCityCountyMap, STATE_FIPS_TO_CODE } from '../state/mapData'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#555'

// Append `?test=1` to the URL for a 30-second timer with tighter
// tick thresholds — fast feedback loop without waiting 15 minutes.
const IS_TEST = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('test') === '1'

const ATTACK_DURATION_MS = IS_TEST ? 30 * 1000 : 15 * 60 * 1000
const STORAGE_KEY        = IS_TEST ? 'pe_drive_bys_test' : 'pe_drive_bys_v1'

// Threshold seconds where the outbound attack escalates audibly.
// Each fires at most once per attack (recorded in attack.firedThresholds).
const TICK_THRESHOLDS    = IS_TEST ? [20, 10, 5] : [60, 30, 10]

// ---------------------------------------------------------------------
// Drive-By state hook — persists in-flight attacks + captured cities to
// localStorage so the 15-minute timer survives refreshes. Replace with a
// Supabase-backed hook when the backend lands.
// ---------------------------------------------------------------------
function useDriveBys() {
  const [state, setState] = useState(loadState)
  const [landed, setLanded] = useState([])
  const [, forceTick] = useState(0)
  const firedRef = useRef(new Set())

  // Persist whenever the attacks/captured set changes
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
  }, [state])

  // Drain completed attacks once a second + fire escalation sounds
  useEffect(() => {
    if (state.attacks.length === 0) return
    const interval = setInterval(() => {
      const now = Date.now()
      const active = []
      const completed = []
      for (const a of state.attacks) {
        if (a.endsAt <= now) completed.push(a)
        else active.push(a)
      }

      // Sound thresholds (per active attack, at most once each)
      for (const a of active) {
        const remaining = Math.ceil((a.endsAt - now) / 1000)
        for (const t of TICK_THRESHOLDS) {
          const key = `${a.id}:${t}`
          if (remaining <= t && !firedRef.current.has(key)) {
            firedRef.current.add(key)
            t <= 10 ? sfx.hotTick() : sfx.tick()
          }
        }
      }

      if (completed.length > 0) {
        // Award + capture
        const newlyCaptured = completed.map(a => a.cityId)
        setState(s => ({
          attacks: active,
          captured: [...new Set([...s.captured, ...newlyCaptured])],
        }))
        setLanded(L => [...L, ...completed])
        sfx.boom()
      } else {
        forceTick(t => t + 1)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [state.attacks])

  const launch = (city) => {
    const now = Date.now()
    const a = {
      id:        `${city.id}-${now}`,
      cityId:    city.id,
      startedAt: now,
      endsAt:    now + ATTACK_DURATION_MS,
    }
    sfx.launch()
    setState(s => ({ ...s, attacks: [...s.attacks, a] }))
  }

  const dismissLanded = (id) =>
    setLanded(L => L.filter(a => a.id !== id))

  return {
    attacks:     state.attacks,
    captured:    state.captured,
    landed,
    launch,
    dismissLanded,
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { attacks: [], captured: [] }
    const parsed = JSON.parse(raw)
    // Drop attacks whose timer already lapsed while the tab was closed —
    // we don't want to spam the landing modal queue on page load.
    const now = Date.now()
    const stillActive = (parsed.attacks || []).filter(a => a.endsAt > now)
    return {
      attacks:  stillActive,
      captured: parsed.captured || [],
    }
  } catch {
    return { attacks: [], captured: [] }
  }
}

// ---------------------------------------------------------------------
// MapScreen
// ---------------------------------------------------------------------
export default function MapScreen() {
  const [selectedCity, setSelectedCity] = useState(null)
  const [selectedCounty, setSelectedCounty] = useState(null)
  // null = country view; otherwise { fips, code, name } of the focused state
  const [stateView, setStateView] = useState(null)
  const { attacks, captured, landed, launch, dismissLanded } = useDriveBys()
  const { data: mapData } = useMapData()

  const capturedSet  = useMemo(() => new Set(captured), [captured])
  const attackingSet = useMemo(() => new Set(attacks.map(a => a.cityId)), [attacks])

  // Overlay locally-captured cities onto the static data
  const cities = useMemo(() => ALL_CITIES.map(c => (
    capturedSet.has(c.id) ? { ...c, isYours: true, owner: PLAYER.name } : c
  )), [capturedSet])

  const totals = useMemo(() => ({
    yours: cities.filter(c => c.isYours).length,
    enemy: cities.filter(c => !c.isYours && c.owner).length,
    open:  cities.filter(c => !c.owner).length,
  }), [cities])

  const presence = useMemo(() => {
    const m = {}
    cities.forEach(c => {
      if (!m[c.state]) m[c.state] = { state: c.state, yours: 0, enemy: 0, total: 0 }
      m[c.state].total++
      if (c.isYours) m[c.state].yours++
      else if (c.owner) m[c.state].enemy++
    })
    return Object.values(m)
      .filter(s => s.yours > 0 || s.enemy > 0)
      .sort((a, b) => b.yours - a.yours || b.enemy - a.enemy)
  }, [cities])

  const cityById = useMemo(() => {
    const m = new Map()
    cities.forEach(c => m.set(c.id, c))
    return m
  }, [cities])

  // City → county FIPS once we have map data. Memoised against both.
  const cityCounty = useMemo(
    () => mapData ? buildCityCountyMap(mapData, cities) : {},
    [mapData, cities]
  )

  // EVERY county gets an entry — counties with a named city use that city's
  // rich data; the other ~3,100 counties get synthesized "tier 1" entries
  // with a deterministic AI owner so the whole map is claimable, not just
  // the 137 marquee cities.
  const countyByFips = useMemo(() => {
    const m = {}
    Object.entries(cityCounty).forEach(([cityId, fips]) => {
      const c = cityById.get(Number(cityId))
      if (c) m[fips] = c
    })
    if (mapData) {
      mapData.counties.features.forEach(f => {
        const fips = String(f.id).padStart(5, '0')
        if (m[fips]) return
        const syn = synthesizeCounty(fips, f.properties.name)
        // Apply captured-set override so synthesized counties also flip gold
        // after a successful drive-by (their ID is a string like "c01001").
        if (capturedSet.has(syn.id)) {
          syn.isYours = true
          syn.owner   = PLAYER.name
        }
        m[fips] = syn
      })
    }
    return m
  }, [cityCounty, cityById, mapData, capturedSet])

  // Banner lookup needs to find both real cities AND synthesized counties.
  const territoryById = useMemo(() => {
    const m = new Map(cityById)
    Object.values(countyByFips).forEach(c => {
      if (c.isGeneric) m.set(c.id, c)
    })
    return m
  }, [cityById, countyByFips])

  // FIPS set of counties you currently own — drives adjacency below.
  const ownedCountyFips = useMemo(() => {
    const s = new Set()
    Object.entries(countyByFips).forEach(([fips, c]) => {
      if (c.isYours) s.add(fips)
    })
    return s
  }, [countyByFips])

  // Counties adjacent to one of yours, minus the ones you already hold.
  // This is the RISK rule: you can only expand into territory you can reach.
  const attackableCountyFips = useMemo(() => {
    if (!mapData) return new Set()
    const out = new Set()
    ownedCountyFips.forEach(fips => {
      const neighbors = mapData.neighborsByCounty[fips] || []
      neighbors.forEach(n => {
        if (!ownedCountyFips.has(n)) out.add(n)
      })
    })
    return out
  }, [mapData, ownedCountyFips])

  // Only show one landing modal at a time (queue the rest)
  const currentLanded = landed[0] || null

  return (
    <div className="scroll-area animate-in">
      {/* Active Drive Bys — one banner per in-flight attack */}
      {attacks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px 0' }}>
          {attacks.map(a => (
            <AttackBanner key={a.id} attack={a} city={territoryById.get(a.cityId)} />
          ))}
        </div>
      )}

      {/* Empire summary */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <SummaryStat label="Your Cities" value={totals.yours} color={GOLD} />
          <SummaryStat label="Enemy Held"  value={totals.enemy} color={RED} />
          <SummaryStat label="Open"        value={totals.open}  color={DIM} />
        </div>
      </div>

      {/* Map — country view by default, state county view when drilled in.
          Per-county ownership lands in Phase 3c. */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {stateView && (
            <button
              onClick={() => setStateView(null)}
              style={{
                background: 'transparent', border: '0.5px solid #2a2a3a',
                borderRadius: 6, color: GOLD, padding: '3px 8px',
                fontSize: 10, fontWeight: 600, letterSpacing: 1,
                cursor: 'pointer',
              }}
            >
              <i className="ti ti-arrow-left" /> US
            </button>
          )}
          <span>
            {stateView
              ? `${stateView.name} — Counties`
              : 'United States — Live Territory'}
          </span>
        </div>
        <div style={{
          border: `0.5px solid ${GOLD}33`,
          borderRadius: 16,
          overflow: 'hidden',
          background: '#0d0d15',
        }}>
          {stateView ? (
            <USStateMap
              stateFips={stateView.fips}
              stateName={stateView.name}
              colorFor={(fips) => countyColorFor(countyByFips, fips)}
              strokeFor={(fips) => countyStrokeFor(countyByFips, attackableCountyFips, fips)}
              strokeWidthFor={(fips) => attackableCountyFips.has(fips) ? 1.5 : undefined}
              onCountyClick={(c) => setSelectedCounty({
                fips: c.fips, name: c.name,
                city: countyByFips[c.fips] || null,
                isAttackable: attackableCountyFips.has(c.fips),
              })}
              height="58vh"
            />
          ) : (
            <USCountryMap
              colorFor={(fips, code) => stateColorFor(stateOwnership, code)}
              onStateClick={(s) => setStateView(s)}
              height="58vh"
            />
          )}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 16,
            padding: '10px 12px',
            borderTop: `0.5px solid ${GOLD}22`,
          }}>
            {[
              { color: GOLD,    label: 'Yours' },
              { color: RED,     label: 'Enemy' },
              { color: '#252535', label: 'Open' },
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

      {selectedCity && (
        <CityDetailModal
          city={cityById.get(selectedCity.id) || selectedCity}
          inFlight={attackingSet.has(selectedCity.id)}
          onClose={() => setSelectedCity(null)}
          onAttack={(c) => { launch(c); setSelectedCity(null) }}
        />
      )}

      {selectedCounty && (
        <CountyDetailModal
          county={selectedCounty}
          stateName={stateView?.name}
          onClose={() => setSelectedCounty(null)}
          onAttack={(city) => { launch(city); setSelectedCounty(null) }}
          inFlight={selectedCounty.city ? attackingSet.has(selectedCounty.city.id) : false}
        />
      )}

      {currentLanded && (
        <DriveByLandedModal
          city={cityById.get(currentLanded.cityId)}
          onClose={() => dismissLanded(currentLanded.id)}
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

function AttackBanner({ attack, city }) {
  const total = Math.ceil(ATTACK_DURATION_MS / 1000)
  const remaining = Math.max(0, Math.ceil((attack.endsAt - Date.now()) / 1000))
  // Switch to red "incoming" styling for the final stretch — last minute in
  // real mode, last third of the timer in test mode.
  const closeThreshold = Math.min(60, Math.floor(total / 3))
  const isClose = remaining <= closeThreshold

  return (
    <div className="attack-banner-in" style={{
      background: isClose
        ? 'linear-gradient(135deg, #2a0a0a 0%, #100404 100%)'
        : 'linear-gradient(135deg, #1a0d00 0%, #100a02 100%)',
      border: `1px solid ${isClose ? RED + '88' : GOLD + '44'}`,
      borderRadius: 16, padding: 14,
      display: 'flex', alignItems: 'center', gap: 14,
      transition: 'background 0.5s, border-color 0.5s',
    }}>
      <CountdownRing
        remaining={remaining}
        total={total}
        size={64}
        strokeWidth={4}
        variant={isClose ? 'incoming' : 'outbound'}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: isClose ? RED : GOLD,
          fontSize: 13, fontWeight: 600, marginBottom: 2,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <i className="ti ti-sword" /> {isClose ? 'Drive By Closing In' : 'Drive By En Route'}
        </div>
        <div style={{ color: '#fff', fontSize: 13, marginBottom: 2 }}>
          → {city ? `${city.name}, ${city.state}` : 'Target'}
        </div>
        <div style={{ color: DIM, fontSize: 10 }}>
          {isClose ? "They've seen us coming — hold on" : 'Your crew is moving — cannot cancel'}
        </div>
      </div>
    </div>
  )
}

function CityDetailModal({ city, inFlight, onClose, onAttack }) {
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
              <div style={{ color: GOLD, fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                Drive By Info {IS_TEST && <span style={{ color: RED, marginLeft: 6 }}>(TEST MODE)</span>}
              </div>
              <div style={{ color: '#888', fontSize: 12, lineHeight: 1.6 }}>
                • Travel time: {IS_TEST ? '30 seconds' : '15 minutes'}<br />
                • Defender gets notified immediately<br />
                • They can snitch to block your drive by<br />
                • Cost: 500 Hustle
              </div>
            </div>
            <button
              className="btn btn-gold btn-full"
              style={{ padding: 14, marginBottom: 10, opacity: inFlight ? 0.5 : 1 }}
              disabled={inFlight}
              onClick={() => onAttack(city)}
            >
              <i className="ti ti-sword" /> {inFlight ? 'Drive By Already En Route' : `Launch Drive By — ${IS_TEST ? '30s' : '15 min'}`}
            </button>
          </>
        )}
        <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

function DriveByLandedModal({ city, onClose }) {
  if (!city) return null
  const hustleReward = city.tier * 500
  const steelReward  = city.tier * 200

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center', zIndex: 250,
    }}>
      <div style={{
        background: '#13131f', padding: 24,
        width: '100%', maxWidth: 390,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
        paddingTop: 80,
      }}>
        <div className="landing-stamp" style={{
          textAlign: 'center', marginBottom: 18,
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 84, height: 84, borderRadius: '50%',
            background: `${GOLD}22`, border: `2px solid ${GOLD}`,
            color: GOLD, fontSize: 40,
            boxShadow: `0 0 32px ${GOLD}66`,
          }}>
            <i className="ti ti-target-arrow" />
          </div>
        </div>

        <div style={{
          color: GOLD, fontSize: 13, fontWeight: 600,
          letterSpacing: 3, textAlign: 'center', marginBottom: 6,
        }}>DRIVE BY LANDED</div>

        <div style={{
          color: '#fff', fontSize: 24, fontWeight: 600,
          textAlign: 'center', marginBottom: 6,
        }}>{city.name}, {city.state}</div>

        <div style={{
          color: '#888', fontSize: 13, fontStyle: 'italic',
          textAlign: 'center', marginBottom: 22,
        }}>is now under {PLAYER.name}'s flag</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 22 }}>
          <RewardTile color={GOLD} label="Hustle"     value={`+${hustleReward}`} />
          <RewardTile color="#4a9eff" label="Steel"   value={`+${steelReward}`} />
        </div>

        <div style={{
          background: '#1e1e2a', border: `0.5px solid ${GOLD}33`,
          borderRadius: 12, padding: 12, marginBottom: 22,
        }}>
          <div style={{ color: GOLD, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>NEW PASSIVE INCOME</div>
          <div style={{ color: '#fff', fontSize: 13 }}>
            +{city.tier * 140}/hr Hustle &nbsp;·&nbsp; +{city.tier * 60}/hr Steel
          </div>
        </div>

        <button className="btn btn-gold btn-full" style={{ padding: 14 }} onClick={onClose}>
          Collect
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// CountyDetailModal — shown when a county polygon is tapped in state view.
// Named counties (with a city) show the portrait + income; generic counties
// just show name + state + "no named city".
// ---------------------------------------------------------------------
function CountyDetailModal({ county, stateName, onClose, onAttack, inFlight }) {
  const c = county.city
  const isAttackable = !!county.isAttackable
  const canLaunch = c && !c.isYours && isAttackable && !inFlight

  // Income scales with tier. Tier 1 generic = 35/15 per hour; named city
  // tier 1/2/3 = 140/280/420 Hustle, 60/120/180 Steel.
  const hustlePerHr = c?.isGeneric ? 35 : (c?.tier || 1) * 140
  const steelPerHr  = c?.isGeneric ? 15 : (c?.tier || 1) * 60

  const subtitle = c?.isGeneric
    ? 'Small rural territory'
    : c
      ? `Home of ${c.name} — Tier ${c.tier} ${c.tier === 3 ? 'Major' : c.tier === 2 ? 'Mid' : 'Small'} City`
      : ''

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
    }} onClick={onClose}>
      <div style={{
        background: '#13131f', borderRadius: '24px 24px 0 0', padding: 24,
        width: '100%', maxWidth: 390,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 18px' }} />

        <div style={{
          color: GOLD, fontSize: 10, letterSpacing: 2, marginBottom: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{stateName ? `${stateName.toUpperCase()} — COUNTY` : 'COUNTY'}</span>
          {isAttackable && !c?.isYours && (
            <span style={{
              background: `${GOLD}22`, color: GOLD, padding: '2px 8px',
              borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 1,
            }}>★ IN REACH</span>
          )}
        </div>
        <div style={{ color: '#fff', fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
          {county.name} County
        </div>
        {subtitle && (
          <div style={{ color: '#888', fontSize: 12, marginBottom: 16 }}>{subtitle}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
            <div style={{ color: GOLD, fontSize: 18, fontWeight: 500 }}>+{hustlePerHr}</div>
            <div style={{ color: DIM, fontSize: 11 }}>Hustle/hr</div>
          </div>
          <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
            <div style={{ color: '#4a9eff', fontSize: 18, fontWeight: 500 }}>+{steelPerHr}</div>
            <div style={{ color: DIM, fontSize: 11 }}>Steel/hr</div>
          </div>
        </div>

        <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, marginBottom: 16 }}>
          <div style={{ color: '#888', fontSize: 12 }}>Current Owner</div>
          <div style={{
            color: c.isYours ? GOLD : c.owner ? RED : '#2ecc71',
            fontSize: 14, fontWeight: 500, marginTop: 4,
          }}>
            {c.isYours ? `${PLAYER.name} (You)` : c.owner || 'Unclaimed — take it now!'}
          </div>
        </div>

        {!c.isYours && (
          canLaunch ? (
            <button
              className="btn btn-gold btn-full"
              style={{ padding: 14, marginBottom: 10 }}
              onClick={() => onAttack(c)}
            >
              <i className="ti ti-sword" />{' '}
              {`Launch Drive By — ${IS_TEST ? '30s' : '15 min'}`}
            </button>
          ) : inFlight ? (
            <button
              className="btn btn-gold btn-full"
              style={{ padding: 14, marginBottom: 10, opacity: 0.5 }}
              disabled
            >
              <i className="ti ti-sword" /> Drive By Already En Route
            </button>
          ) : !isAttackable ? (
            <div style={{
              background: '#1e1e2a', border: `0.5px dashed ${DIM}`,
              borderRadius: 12, padding: 12, marginBottom: 14,
              color: '#888', fontSize: 12, lineHeight: 1.5, textAlign: 'center',
            }}>
              <i className="ti ti-lock" style={{ color: DIM, marginRight: 6 }} />
              Out of reach — take a neighboring county first.
            </div>
          ) : null
        )}

        <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

function RewardTile({ color, label, value }) {
  return (
    <div style={{
      background: '#1e1e2a', borderRadius: 12, padding: '14px 10px',
      textAlign: 'center', border: `0.5px solid ${color}33`,
    }}>
      <div style={{ color, fontSize: 22, fontWeight: 600 }}>{value}</div>
      <div style={{ color: DIM, fontSize: 11, marginTop: 4, letterSpacing: 1 }}>{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------
// State-color helper for the country map. Until per-county ownership lands,
// the state color is driven by which side owns more cities in that state.
// Gold gradient = your majority, red gradient = enemy majority, dark = open.
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Generic-county synthesizer. Every county not backed by a named city gets
// a tier-1 entry whose owner is a deterministic hash of its FIPS — so the
// AI distribution looks "lived in" but is stable across reloads.
// ---------------------------------------------------------------------
const AI_FACTIONS = [
  'Block Crew',     'County Posse',  'Backyard Boys', 'Yardbirds',
  'Cell House',     'Shanktown',     'Trailer Mafia', 'Hill Boys',
  'Iron Bench',     'Day Shift',     'Night Shift',   'Bunk Crew',
  'Mess Hall Gang', 'Recyards',      'Phone Booth',   'Library Crew',
  'Cigarette Co.',  'Shot Caller',   'Old Heads',     'Yard Dogs',
]

function hashFips(fips) {
  let h = 0
  for (let i = 0; i < fips.length; i++) h = ((h << 5) - h + fips.charCodeAt(i)) | 0
  return Math.abs(h)
}

function synthesizeCounty(fips, name) {
  const stateCode = STATE_FIPS_TO_CODE[fips.slice(0, 2)] || '??'
  const h = hashFips(fips)
  // 35% unclaimed (no owner), 65% held by a rotating AI faction.
  const owner = (h % 100) < 35 ? null : AI_FACTIONS[h % AI_FACTIONS.length]
  return {
    id:    `c${fips}`,                  // synthetic ID — won't clash with city IDs
    name:  `${name} County`,
    state: stateCode,
    tier:  1,
    countyFips: fips,
    owner,
    isYours: false,
    isGeneric: true,
  }
}

// Per-county fill: solid gold if your city lives there, solid red if an
// enemy holds it, dark unclaimed otherwise. Open (no-owner) cities still
// flag the county lightly so the player sees there's something to take.
function countyColorFor(countyByFips, fips) {
  const c = countyByFips[fips]
  if (!c)             return '#1c1c28'           // generic county, no named city
  if (c.isYours)      return 'rgba(201,168,76,0.85)'
  if (c.owner)        return 'rgba(231,76,60,0.85)'
  return 'rgba(46,204,113,0.55)'                  // unclaimed but has a city — green flag
}

// Outline rules:
//   - Attackable (adjacent to yours) → bright gold
//   - Named city county (any owner)  → dark
//   - Generic county                 → faint white
function countyStrokeFor(countyByFips, attackableSet, fips) {
  if (attackableSet.has(fips)) return '#c9a84c'
  if (countyByFips[fips])      return '#2a2a3a'
  return 'rgba(255,255,255,0.35)'
}

function stateColorFor(stateOwnership, code) {
  const s = stateOwnership[code]
  if (!s || s.total === 0) return '#1e1e2a'
  if (s.yours === 0 && s.enemy === 0) return '#252535'
  const yoursPct = s.yours / s.total
  const enemyPct = s.enemy / s.total
  if (yoursPct >= enemyPct) {
    // Gold-tinted by share — 0% = barely visible, 100% = saturated gold
    const a = 0.18 + Math.min(1, yoursPct) * 0.55
    return `rgba(201, 168, 76, ${a.toFixed(2)})`
  }
  const a = 0.18 + Math.min(1, enemyPct) * 0.55
  return `rgba(231, 76, 60, ${a.toFixed(2)})`
}
