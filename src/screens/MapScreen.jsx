import React, { useState, useMemo, useEffect, useRef } from 'react'
import { ALL_CITIES, FACILITIES, FACILITY_TIERS, PLAYER_HOME_FACILITY_ID, AI_GANGS } from '../data/gameData'
import { CountdownRing } from '../components/CountdownRing'
import { USCountryMap } from '../components/USCountryMap'
import { USStateMap } from '../components/USStateMap'
import { ScoutScreen } from '../components/ScoutScreen'
import { useMapData, buildCityCountyMap, STATE_CODE_TO_FIPS } from '../state/mapData'
import { useDisplayName } from '../state/profileStore'
import { useTerritories, applyHit, applyRaid, getTerritory } from '../state/territoriesStore'
import { useWorld } from '../state/worldStore'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#555'

// Append `?test=1` for a 30-second timer instead of 15 minutes.
const IS_TEST = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('test') === '1'

const ATTACK_DURATION_MS = IS_TEST ? 30 * 1000 : 15 * 60 * 1000
const STORAGE_KEY        = IS_TEST ? 'pe_drive_bys_test_v2' : 'pe_drive_bys_v2'
const TICK_THRESHOLDS    = IS_TEST ? [20, 10, 5] : [60, 30, 10]

// Enemy retaliation: rival gangs launch raids at facilities YOU hold. Same
// travel time as your own drive-bys (so the player can react/reinforce), but
// spawned on a cadence while the map is open. Raids only begin once you hold a
// couple of facilities so a brand-new player learns offense first.
const RAID_STORAGE_KEY   = IS_TEST ? 'pe_raids_test_v1' : 'pe_raids_v1'
const RAID_SPAWN_MS      = IS_TEST ? 12 * 1000 : 90 * 1000
const MIN_HOLD_TO_RAID   = 2

const FACILITY_BY_ID = new Map(FACILITIES.map(f => [f.id, f]))

// ---------------------------------------------------------------------
// Drive-By hook — in-flight attacks against FACILITIES. Persists the timers
// to localStorage so they survive refreshes; ownership/loyalty lives in
// territoriesStore. On landing a drive-by chips the target's loyalty (and
// flips it at 0) via applyHit.
// ---------------------------------------------------------------------
function useDriveBys() {
  const [attacks, setAttacks] = useState(loadAttacks)
  const [landed, setLanded]   = useState([])
  const [, tick] = useState(0)
  const firedRef = useRef(new Set())

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(attacks)) } catch {}
  }, [attacks])

  useEffect(() => {
    if (attacks.length === 0) return
    const iv = setInterval(() => {
      const now = Date.now()
      const active = [], completed = []
      for (const a of attacks) (a.endsAt <= now ? completed : active).push(a)

      for (const a of active) {
        const rem = Math.ceil((a.endsAt - now) / 1000)
        for (const t of TICK_THRESHOLDS) {
          const k = `${a.id}:${t}`
          if (rem <= t && !firedRef.current.has(k)) {
            firedRef.current.add(k)
            t <= 10 ? sfx.hotTick() : sfx.tick()
          }
        }
      }

      if (completed.length > 0) {
        const results = completed.map(a => ({ ...a, ...applyHit(a.facilityId) }))
        setAttacks(active)
        setLanded(L => [...L, ...results])
        sfx.boom()
      } else {
        tick(t => t + 1)
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [attacks])

  const launch = (facility) => {
    const now = Date.now()
    setAttacks(s => [...s, { id: `${facility.id}-${now}`, facilityId: facility.id, endsAt: now + ATTACK_DURATION_MS }])
    sfx.launch()
  }
  const dismissLanded = (id) => setLanded(L => L.filter(a => a.id !== id))

  return { attacks, landed, launch, dismissLanded }
}

function loadAttacks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const now = Date.now()
    return (JSON.parse(raw) || []).filter(a => a.endsAt > now && a.facilityId)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------
// Raids hook — incoming enemy drive-bys against YOUR facilities. Mirrors
// useDriveBys but hostile: spawns on a cadence while the map is open, lands via
// applyRaid (chips your defense, loses the facility at 0). `territories` is
// passed so spawning re-evaluates as ownership changes.
// ---------------------------------------------------------------------
function useRaids(territories) {
  const [raids, setRaids]   = useState(loadRaids)
  const [landed, setLanded] = useState([])
  const [, tick] = useState(0)
  const firedRef = useRef(new Set())

  useEffect(() => {
    try { localStorage.setItem(RAID_STORAGE_KEY, JSON.stringify(raids)) } catch {}
  }, [raids])

  // Land / tick loop.
  useEffect(() => {
    if (raids.length === 0) return
    const iv = setInterval(() => {
      const now = Date.now()
      const active = [], completed = []
      for (const r of raids) (r.endsAt <= now ? completed : active).push(r)

      for (const r of active) {
        const rem = Math.ceil((r.endsAt - now) / 1000)
        for (const t of TICK_THRESHOLDS) {
          const k = `${r.id}:${t}`
          if (rem <= t && !firedRef.current.has(k)) {
            firedRef.current.add(k)
            sfx.hotTick()
          }
        }
      }

      if (completed.length > 0) {
        const results = completed.map(r => ({ ...r, ...applyRaid(r.facilityId, r.gang) }))
        setRaids(active)
        setLanded(L => [...L, ...results])
        sfx.boom()
      } else {
        tick(t => t + 1)
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [raids])

  // Spawn loop — periodically pick one of your facilities to threaten.
  useEffect(() => {
    const iv = setInterval(() => {
      const owned = FACILITIES.filter(f => getTerritory(f.id)?.owner === 'you')
      if (owned.length < MIN_HOLD_TO_RAID) return
      setRaids(cur => {
        const underRaid = new Set(cur.map(r => r.facilityId))
        const eligible = owned.filter(f => !underRaid.has(f.id))
        if (!eligible.length) return cur
        // Weight by tier — richer facilities draw more heat.
        const pool = eligible.flatMap(f => Array(f.tier).fill(f))
        const target = pool[Math.floor(Math.random() * pool.length)]
        const gang = AI_GANGS[Math.floor(Math.random() * AI_GANGS.length)]
        const now = Date.now()
        return [...cur, { id: `raid-${target.id}-${now}`, facilityId: target.id, gang, endsAt: now + ATTACK_DURATION_MS }]
      })
    }, RAID_SPAWN_MS)
    return () => clearInterval(iv)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [territories])

  const dismissLanded = (id) => setLanded(L => L.filter(r => r.id !== id))
  return { raids, landed, dismissLanded }
}

function loadRaids() {
  try {
    const raw = localStorage.getItem(RAID_STORAGE_KEY)
    if (!raw) return []
    const now = Date.now()
    return (JSON.parse(raw) || []).filter(r => r.endsAt > now && r.facilityId)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------
// MapScreen
// ---------------------------------------------------------------------
export default function MapScreen() {
  const [stateView, setStateView] = useState(null)          // null = country view
  const [selectedFacility, setSelectedFacility] = useState(null)
  const { attacks, landed, launch, dismissLanded } = useDriveBys()
  const { data: mapData } = useMapData()
  const territories = useTerritories()
  const world = useWorld()
  const { raids, landed: raidLanded, dismissLanded: dismissRaid } = useRaids(territories)

  const attackingSet = useMemo(() => new Set(attacks.map(a => a.facilityId)), [attacks])
  const raidByFacility = useMemo(() => new Map(raids.map(r => [r.facilityId, r])), [raids])
  const cityById = useMemo(() => new Map(ALL_CITIES.map(c => [c.id, c])), [])

  // Facility → county FIPS (via its anchor city's coordinates).
  const cityCounty = useMemo(() => mapData ? buildCityCountyMap(mapData, ALL_CITIES) : {}, [mapData])
  const facilityByFips = useMemo(() => {
    const m = {}
    FACILITIES.forEach(f => { const fips = cityCounty[f.cityId]; if (fips) m[fips] = f })
    return m
  }, [cityCounty])

  const stateNameByFips = useMemo(() => {
    const m = {}
    if (mapData) mapData.states.features.forEach(f => { m[String(f.id).padStart(2, '0')] = f.properties.name })
    return m
  }, [mapData])

  // Mob id → its map color (drives the Map-1 overview projection).
  const mobColorById = useMemo(() => {
    const m = {}
    Object.values(world.mobs).forEach(mob => { m[mob.id] = mob.color })
    return m
  }, [world.mobs])

  // facilityId → controlling color: house → owner → (you | its mob | vacant).
  // This IS the Phase-B projection — Map 1's color is computed from the houses.
  const facilityControl = useMemo(() => {
    const out = {}
    FACILITIES.forEach(f => {
      const h = world.houses[f.id]
      if (!h || !h.owner_player_id) out[f.id] = { kind: 'vacant', color: '#2ecc71' }
      else if (h.owner_player_id === 'you') out[f.id] = { kind: 'you', color: GOLD }
      else out[f.id] = { kind: 'mob', mobId: h.owner_mob_id, color: mobColorById[h.owner_mob_id] || RED }
    })
    return out
  }, [world.houses, mobColorById])

  // Per-state tallies + dominant mob (drives the country-map color scale).
  const stateControl = useMemo(() => {
    const m = {}
    FACILITIES.forEach(f => {
      const city = cityById.get(f.cityId); if (!city) return
      const c = facilityControl[f.id]
      const s = m[city.state] || (m[city.state] = { yours: 0, total: 0, mobCounts: {} })
      s.total++
      if (c.kind === 'you') s.yours++
      else if (c.kind === 'mob' && c.mobId) s.mobCounts[c.mobId] = (s.mobCounts[c.mobId] || 0) + 1
    })
    return m
  }, [facilityControl, cityById])

  const summary = useMemo(() => {
    let yours = 0, enemy = 0, vacant = 0
    FACILITIES.forEach(f => {
      const o = territories[f.id]?.owner ?? null
      if (o === 'you') yours++; else if (o) enemy++; else vacant++
    })
    return { yours, enemy, vacant }
  }, [territories])

  const homeState = useMemo(() => {
    const home = FACILITY_BY_ID.get(PLAYER_HOME_FACILITY_ID)
    return home ? cityById.get(home.cityId)?.state : null
  }, [cityById])

  // Guided next-target (the "Lighthouse" pattern): always surface one clear,
  // easy objective so a new player is never lost. Prefer a vacant facility in
  // the home region, then any vacant, then the lowest-tier rival.
  const recommended = useMemo(() => {
    const notYours = FACILITIES.filter(f => (territories[f.id]?.owner ?? null) !== 'you')
    const isVacant = f => !(territories[f.id]?.owner)
    const vacantHome = notYours.filter(f => isVacant(f) && cityById.get(f.cityId)?.state === homeState)
    const vacantAny  = notYours.filter(isVacant)
    const pool = vacantHome.length ? vacantHome : vacantAny.length ? vacantAny : notYours
    return [...pool].sort((a, b) => a.tier - b.tier)[0] || null
  }, [territories, homeState, cityById])

  const goToFacility = (f) => {
    const city = cityById.get(f.cityId)
    if (city) {
      const fips = STATE_CODE_TO_FIPS[city.state]
      setStateView({ fips, code: city.state, name: stateNameByFips[fips] || city.state })
    }
    setSelectedFacility(f)
  }

  const currentLanded = landed[0] || null
  const currentRaidLanded = raidLanded[0] || null

  return (
    <div className="scroll-area animate-in">
      {/* Incoming enemy raids (most urgent — render first) */}
      {raids.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px 0' }}>
          {raids.map(r => (
            <RaidBanner key={r.id} raid={r} facility={FACILITY_BY_ID.get(r.facilityId)} city={cityById.get(FACILITY_BY_ID.get(r.facilityId)?.cityId)}
              onDefend={() => setSelectedFacility(FACILITY_BY_ID.get(r.facilityId))} />
          ))}
        </div>
      )}

      {/* In-flight drive-bys */}
      {attacks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px 0' }}>
          {attacks.map(a => (
            <AttackBanner key={a.id} attack={a} facility={FACILITY_BY_ID.get(a.facilityId)} city={cityById.get(FACILITY_BY_ID.get(a.facilityId)?.cityId)} />
          ))}
        </div>
      )}

      {/* Empire summary */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <SummaryStat label="Your Facilities" value={summary.yours} color={GOLD} />
          <SummaryStat label="Enemy Held"      value={summary.enemy} color={RED} />
          <SummaryStat label="Vacant"          value={summary.vacant} color="#2ecc71" />
        </div>
      </div>

      {/* Recommended target */}
      {recommended && (
        <div style={{ padding: '12px 16px 0' }}>
          <div
            onClick={() => { sfx.tap(); goToFacility(recommended) }}
            style={{
              background: 'linear-gradient(135deg, #1a1510, #251e0a)', border: `0.5px solid ${GOLD}44`,
              borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${GOLD}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-target-arrow" style={{ color: GOLD, fontSize: 18 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: GOLD, fontSize: 11, letterSpacing: 1, fontWeight: 600 }}>RECOMMENDED TARGET</div>
              <div style={{ color: '#fff', fontSize: 13, marginTop: 1 }}>
                {recommended.name} · {(territories[recommended.id]?.owner ?? null) ? FACILITY_TIERS[recommended.tier].label : 'unclaimed'}
              </div>
            </div>
            <i className="ti ti-chevron-right" style={{ color: DIM, fontSize: 18 }} />
          </div>
        </div>
      )}

      {/* Map */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {stateView && (
            <button
              onClick={() => setStateView(null)}
              style={{
                background: 'transparent', border: '0.5px solid #2a2a3a', borderRadius: 6,
                color: GOLD, padding: '3px 8px', fontSize: 10, fontWeight: 600, letterSpacing: 1, cursor: 'pointer',
              }}
            >
              <i className="ti ti-arrow-left" /> US
            </button>
          )}
          <span>{stateView ? `${stateView.name} — Facilities` : 'United States — Facilities'}</span>
        </div>
        <div style={{ border: `0.5px solid ${GOLD}33`, borderRadius: 16, overflow: 'hidden', background: '#0d0d15' }}>
          {stateView ? (
            <USStateMap
              stateFips={stateView.fips}
              stateName={stateView.name}
              colorFor={(fips) => { const f = facilityByFips[fips]; return f ? facilityControl[f.id].color : '#15151f' }}
              strokeFor={(fips) => facilityByFips[fips] ? '#fff' : `${GOLD}59`}
              strokeWidthFor={(fips) => facilityByFips[fips] ? 1.5 : 0.7}
              onCountyClick={(c) => { const f = facilityByFips[c.fips]; if (f) { sfx.tap(); setSelectedFacility(f) } }}
              height="58vh"
            />
          ) : (
            <USCountryMap
              colorFor={(fips, code) => stateColorFor(stateControl[code], mobColorById)}
              onStateClick={(s) => setStateView(s)}
              height="58vh"
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '10px 12px', borderTop: `0.5px solid ${GOLD}22` }}>
            {[
              { color: GOLD, label: 'Yours' },
              { color: RED, label: 'Rival Mobs' },
              { color: '#2ecc71', label: 'Vacant' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, boxShadow: `0 0 6px ${l.color}77` }} />
                <span style={{ color: '#888', fontSize: 11 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
        {!stateView && (
          <div style={{ color: DIM, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
            Tap a state to see its facilities, then tap a facility to scout it.
          </div>
        )}
      </div>

      {/* Facility list for the focused state */}
      {stateView && (
        <div className="section">
          <div className="section-label">{stateView.name} Facilities</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FACILITIES.filter(f => cityById.get(f.cityId)?.state === stateView.code).map(f => {
              const o = territories[f.id]?.owner ?? null
              const color = o === 'you' ? GOLD : o ? RED : '#2ecc71'
              return (
                <div key={f.id} className="card card-pad" onClick={() => setSelectedFacility(f)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer', borderColor: `${color}44` }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-building-fortress" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{f.name}</div>
                    <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{FACILITY_TIERS[f.tier].label} · {o === 'you' ? 'Yours' : o || 'Unclaimed'}</div>
                  </div>
                  {o !== 'you' && <i className="ti ti-sword" style={{ color: DIM, fontSize: 16 }} />}
                </div>
              )
            })}
            {FACILITIES.filter(f => cityById.get(f.cityId)?.state === stateView.code).length === 0 && (
              <div style={{ background: '#13131f', border: '0.5px solid #1e1e2a', borderRadius: 12, padding: 18, textAlign: 'center', color: DIM, fontSize: 12 }}>
                No facilities in {stateView.name} yet.
              </div>
            )}
          </div>
        </div>
      )}

      {selectedFacility && (
        <ScoutScreen
          facility={selectedFacility}
          inFlight={attackingSet.has(selectedFacility.id)}
          incomingRaid={raidByFacility.get(selectedFacility.id) || null}
          onAttack={(f) => { launch(f); setSelectedFacility(null) }}
          onClose={() => setSelectedFacility(null)}
        />
      )}

      {currentLanded && (
        <FacilityLandedModal
          facility={FACILITY_BY_ID.get(currentLanded.facilityId)}
          result={currentLanded}
          onClose={() => dismissLanded(currentLanded.id)}
        />
      )}

      {currentRaidLanded && (
        <RaidLandedModal
          facility={FACILITY_BY_ID.get(currentRaidLanded.facilityId)}
          result={currentRaidLanded}
          onClose={() => dismissRaid(currentRaidLanded.id)}
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
    <div style={{ background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
      <div style={{ color, fontSize: 22, fontWeight: 500, lineHeight: 1 }}>{value}</div>
      <div style={{ color: DIM, fontSize: 10, marginTop: 5, letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

function AttackBanner({ attack, facility, city }) {
  const total = Math.ceil(ATTACK_DURATION_MS / 1000)
  const remaining = Math.max(0, Math.ceil((attack.endsAt - Date.now()) / 1000))
  const closeThreshold = Math.min(60, Math.floor(total / 3))
  const isClose = remaining <= closeThreshold
  const label = facility ? facility.name : 'Target'

  return (
    <div className="attack-banner-in" style={{
      background: isClose ? 'linear-gradient(135deg, #2a0a0a 0%, #100404 100%)' : 'linear-gradient(135deg, #1a0d00 0%, #100a02 100%)',
      border: `1px solid ${isClose ? RED + '88' : GOLD + '44'}`,
      borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', gap: 14,
      transition: 'background 0.5s, border-color 0.5s',
    }}>
      <CountdownRing remaining={remaining} total={total} size={64} strokeWidth={4} variant={isClose ? 'incoming' : 'outbound'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: isClose ? RED : GOLD, fontSize: 13, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-sword" /> {isClose ? 'Drive By Closing In' : 'Drive By En Route'}
        </div>
        <div style={{ color: '#fff', fontSize: 13, marginBottom: 2 }}>→ {label}{city ? `, ${city.state}` : ''}</div>
        <div style={{ color: DIM, fontSize: 10 }}>{isClose ? 'Almost there — hold on' : 'Your crew is moving — cannot cancel'}</div>
      </div>
    </div>
  )
}

// Incoming enemy raid banner — red, urgent. Tapping it opens the facility so
// the player can reinforce before it lands.
function RaidBanner({ raid, facility, city, onDefend }) {
  const total = Math.ceil(ATTACK_DURATION_MS / 1000)
  const remaining = Math.max(0, Math.ceil((raid.endsAt - Date.now()) / 1000))
  const label = facility ? facility.name : 'Your facility'

  return (
    <div className="attack-banner-in" onClick={onDefend} style={{
      background: 'linear-gradient(135deg, #2a0a0a 0%, #100404 100%)',
      border: `1px solid ${RED}88`, borderRadius: 16, padding: 14,
      display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
    }}>
      <CountdownRing remaining={remaining} total={total} size={64} strokeWidth={4} variant="incoming" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: RED, fontSize: 13, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-alert-triangle-filled" /> Incoming Raid
        </div>
        <div style={{ color: '#fff', fontSize: 13, marginBottom: 2 }}>{raid.gang} → {label}{city ? `, ${city.state}` : ''}</div>
        <div style={{ color: GOLD, fontSize: 10, fontWeight: 600 }}>Tap to reinforce — hold your ground</div>
      </div>
      <i className="ti ti-shield-half-filled" style={{ color: RED, fontSize: 20 }} />
    </div>
  )
}

// Shown when an enemy raid lands on a facility you held: either you lost it, or
// your defense held (just chipped).
function RaidLandedModal({ facility, result, onClose }) {
  if (!facility) return null
  const lost    = !!result.lost
  const loyalty = result.loyalty ?? 0
  const gang    = result.gang || 'A rival gang'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'stretch', justifyContent: 'center', zIndex: 250 }}>
      <div style={{ background: '#13131f', padding: 24, width: '100%', maxWidth: 390, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 80 }}>
        <div className="landing-stamp" style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 84, height: 84, borderRadius: '50%',
            background: `${RED}22`, border: `2px solid ${RED}`, color: RED, fontSize: 40, boxShadow: `0 0 32px ${RED}66`,
          }}>
            <i className={`ti ${lost ? 'ti-flag-off' : 'ti-shield-check'}`} />
          </div>
        </div>

        <div style={{ color: RED, fontSize: 13, fontWeight: 600, letterSpacing: 3, textAlign: 'center', marginBottom: 6 }}>
          {lost ? 'TERRITORY LOST' : 'DEFENSE HELD'}
        </div>
        <div style={{ color: '#fff', fontSize: 24, fontWeight: 600, textAlign: 'center', marginBottom: 6 }}>{facility.name}</div>

        {lost ? (
          <div style={{ color: '#888', fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginBottom: 22 }}>
            {gang} overran it — hit it back to take it again
          </div>
        ) : (
          <div style={{ marginBottom: 22 }}>
            <div style={{ color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 10 }}>{gang} got beat back — reinforce before they return</div>
            <div style={{ height: 8, background: '#0a0a0f', borderRadius: 4, overflow: 'hidden', border: '0.5px solid #2a2a3a' }}>
              <div style={{ height: '100%', width: `${loyalty}%`, background: `linear-gradient(90deg, ${GOLD}, #f0d080)`, borderRadius: 4 }} />
            </div>
            <div style={{ color: DIM, fontSize: 11, textAlign: 'center', marginTop: 6 }}>Defense {loyalty}/100</div>
          </div>
        )}

        <button className="btn btn-gold btn-full" style={{ padding: 14 }} onClick={onClose}>Continue</button>
      </div>
    </div>
  )
}

// Shown when a drive-by lands: either a capture (flipped) or a defense-chip.
function FacilityLandedModal({ facility, result, onClose }) {
  const playerName = useDisplayName()
  if (!facility) return null
  const flipped = !!result.flipped
  const loyalty = result.loyalty ?? 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'stretch', justifyContent: 'center', zIndex: 250 }}>
      <div style={{ background: '#13131f', padding: 24, width: '100%', maxWidth: 390, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 80 }}>
        <div className="landing-stamp" style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 84, height: 84, borderRadius: '50%',
            background: flipped ? `${GOLD}22` : `${RED}22`, border: `2px solid ${flipped ? GOLD : RED}`,
            color: flipped ? GOLD : RED, fontSize: 40, boxShadow: `0 0 32px ${(flipped ? GOLD : RED)}66`,
          }}>
            <i className={`ti ${flipped ? 'ti-flag-filled' : 'ti-target-arrow'}`} />
          </div>
        </div>

        <div style={{ color: flipped ? GOLD : RED, fontSize: 13, fontWeight: 600, letterSpacing: 3, textAlign: 'center', marginBottom: 6 }}>
          {flipped ? 'TERRITORY CAPTURED' : 'DRIVE BY LANDED'}
        </div>
        <div style={{ color: '#fff', fontSize: 24, fontWeight: 600, textAlign: 'center', marginBottom: 6 }}>{facility.name}</div>

        {flipped ? (
          <div style={{ color: '#888', fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginBottom: 22 }}>
            is now under {playerName}'s flag — collect its income on the scout screen
          </div>
        ) : (
          <div style={{ marginBottom: 22 }}>
            <div style={{ color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 10 }}>Defense knocked down — keep hitting it</div>
            <div style={{ height: 8, background: '#0a0a0f', borderRadius: 4, overflow: 'hidden', border: '0.5px solid #2a2a3a' }}>
              <div style={{ height: '100%', width: `${loyalty}%`, background: `linear-gradient(90deg, ${RED}, #ff7a6a)`, borderRadius: 4 }} />
            </div>
            <div style={{ color: DIM, fontSize: 11, textAlign: 'center', marginTop: 6 }}>Defense {loyalty}/100</div>
          </div>
        )}

        <button className="btn btn-gold btn-full" style={{ padding: 14 }} onClick={onClose}>Continue</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------

function hexToRgba(hex, a) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(full, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(2)})`
}

// State fill (country view): gold if you hold any facility there; otherwise the
// DOMINANT rival mob's color (intensity scales with its share); faint green if
// only vacant; dark if no facilities. Colors by MOB — the Phase-B projection.
function stateColorFor(s, mobColorById) {
  if (!s || s.total === 0) return '#1e1e2a'
  if (s.yours > 0) return `rgba(201,168,76,${(0.3 + Math.min(1, s.yours / s.total) * 0.5).toFixed(2)})`
  let domId = null, domN = 0
  for (const id in s.mobCounts) if (s.mobCounts[id] > domN) { domN = s.mobCounts[id]; domId = id }
  if (domId) return hexToRgba(mobColorById[domId] || '#e74c3c', 0.3 + Math.min(1, domN / s.total) * 0.5)
  return 'rgba(46,204,113,0.35)'
}
