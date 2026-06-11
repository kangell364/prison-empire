import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { ALL_CITIES, FACILITIES, FACILITY_TIERS, PLAYER_HOME_FACILITY_ID, AI_GANGS } from '../data/gameData'
import { CountdownRing } from '../components/CountdownRing'
import { USCountryMap } from '../components/USCountryMap'
import { USStateMap } from '../components/USStateMap'
import { ScoutScreen } from '../components/ScoutScreen'
import { TurfMap } from '../components/TurfMap'
import { BlockSheet } from '../components/BlockSheet'
import { cellCenter, HOME_RADIUS_DEG, yourBlocks, aiPoachBlock, useYourBlocks, setLandTest, initSharedBlocks } from '../state/blocksStore'
import { useMapData, buildCityCountyMap, buildUnlockedCountyTest, UNLOCKED_COUNTY_FIPS, HARRIS_CENTER, STATE_CODE_TO_FIPS, STATE_FIPS_TO_CODE, countyForPoint } from '../state/mapData'
import { knockOut } from '../state/vitalsStore'
import { getBounty } from '../state/bountyStore'
import { useDisplayName, useAuth, resolveLook, useHustle } from '../state/profileStore'
import { usePlayers } from '../state/playersStore'
import { useActiveRaids, launchRaid, RAID_HUSTLE_COST } from '../state/raidsStore'
import { usePlayerStats } from '../state/statsStore'
import { Avatar } from '../components/Avatar'
import { ensureMyHouse, useSharedHouses, harrisSpotFor } from '../state/sharedHousesStore'
import { ActivityFeed } from '../components/TurfLeaderboard'
import { StateTurfAccordion, CountyGangLeaderboard } from '../components/GangLeaderboard'
import { useTerritories, applyHit, applyRaid, getTerritory } from '../state/territoriesStore'
import { useWorld, moveHouse, arriveHouse, getHouse, applyHomeRaid, attackHouse } from '../state/worldStore'
import { AI_MOBS } from '../data/mobs'
import { geoCentroid } from 'd3-geo'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#555'
const VACANT = '#1e1e2a'   // unclaimed reads as dark/empty on the map (no green)

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

// AI offense: rival mobs attack vacant / rival-held business houses on a cadence
// (NOT yours — your houses are defended via raids). This makes the map evolve
// and creates the contested races where most-damage-wins (Phase D).
const AI_OFFENSE_MS = IS_TEST ? 4 * 1000 : 60 * 1000

// AI block poaching — rivals occasionally buy out one of YOUR blocks. Tuned
// GENTLE so the player never feels wiped: slow cadence, only ~50% of ticks act,
// home-turf blocks are immune, freshly-taken blocks have a grace window, and it
// always leaves you at least MIN_KEEP blocks. Losing a block PAYS you out.
const AI_BLOCK_POACH_MS = IS_TEST ? 8 * 1000 : 5 * 60 * 1000
const BLOCK_GRACE_MS    = IS_TEST ? 4 * 1000 : 8 * 60 * 1000
const MIN_KEEP_BLOCKS   = 3

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
function useRaids(territories, homeId, liveFips, fipsCoords) {
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
        const results = completed.map(r => {
          if (r.kind === 'personal') {
            const dest = liveFips && liveFips.length ? liveFips[Math.floor(Math.random() * liveFips.length)] : null
            const coords = dest && fipsCoords ? fipsCoords(dest) : null   // [lng,lat] centroid → land on an open block
            const res = applyHomeRaid(r.facilityId, r.gang, dest, coords)
            // Overrun at home = knocked out → 24h recovery, see the nurse. The
            // raiding gang collects the price on your head.
            if (res.ko) knockOut(r.gang)
            return { ...r, ...res }
          }
          return { ...r, ...applyRaid(r.facilityId, r.gang) }
        })
        setRaids(active)
        setLanded(L => [...L, ...results])
        sfx.boom()
      } else {
        tick(t => t + 1)
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [raids, liveFips, fipsCoords])

  // Spawn loop — periodically pick one of your facilities to threaten. Heat
  // scales with the price on your head: a bigger bounty means raids spawn on
  // more ticks AND more can be in flight at once (rivals smell the payday).
  useEffect(() => {
    const iv = setInterval(() => {
      const owned = FACILITIES.filter(f => getTerritory(f.id)?.owner === 'you')
      if (owned.length < MIN_HOLD_TO_RAID) return
      const heat = Math.min(1, getBounty() / 500_000)              // 0..1, caps at a 500k bounty
      const spawnChance  = 0.35 + heat * 0.6                       // ~38% at the floor → ~95% when hot
      const maxConcurrent = Math.min(4, 1 + Math.floor(getBounty() / 150_000))  // +1 raid slot per 150k
      setRaids(cur => {
        if (cur.length >= maxConcurrent) return cur                // already at your heat's raid cap
        if (Math.random() > spawnChance) return cur                // quiet tick at low bounty
        const underRaid = new Set(cur.map(r => r.facilityId))
        // Eligible targets: your business facilities + your personal home house
        // (unless it's mid-relocation). Weighted by tier — richer = more heat.
        const targets = owned.map(f => ({ id: f.id, tier: f.tier, kind: 'business' }))
        const home = homeId ? getHouse(homeId) : null
        if (home && !home.moving_until) targets.push({ id: homeId, tier: 2, kind: 'personal' })
        const eligible = targets.filter(t => !underRaid.has(t.id))
        if (!eligible.length) return cur
        const pool = eligible.flatMap(t => Array(t.tier).fill(t))
        const target = pool[Math.floor(Math.random() * pool.length)]
        const gang = AI_GANGS[Math.floor(Math.random() * AI_GANGS.length)]
        const now = Date.now()
        return [...cur, { id: `raid-${target.id}-${now}`, facilityId: target.id, kind: target.kind, gang, endsAt: now + ATTACK_DURATION_MS }]
      })
    }, RAID_SPAWN_MS)
    return () => clearInterval(iv)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [territories, homeId])

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
// AI offense — rival mobs expand. While the map is open, a random AI mob
// periodically attacks a vacant or rival-held business house (never yours —
// your houses are defended via raids), routing through the contest model so
// ownership shifts and you race them. Most-damage-wins decides ties.
// ---------------------------------------------------------------------
function useAiOffense() {
  useEffect(() => {
    const iv = setInterval(() => {
      const targets = FACILITIES.filter(f => { const h = getHouse(f.id); return h && h.owner_player_id !== 'you' })
      if (!targets.length) return
      const t = targets[Math.floor(Math.random() * targets.length)]
      const mob = AI_MOBS[Math.floor(Math.random() * AI_MOBS.length)]
      attackHouse(t.id, mob.id)
    }, AI_OFFENSE_MS)
    return () => clearInterval(iv)
  }, [])
}

// AI block poaching with anti-frustration guardrails (see constants above).
// homeCoords = [lng,lat] of your trap house (home-turf is immune).
function useBlockRaids(homeCoords) {
  const [lost, setLost] = useState([])
  useEffect(() => {
    const iv = setInterval(() => {
      const mine = yourBlocks()
      if (mine.length <= MIN_KEEP_BLOCKS) return            // never wipe out
      const now = Date.now()
      const eligible = mine.filter(b => {
        if (now - (b.lastPoachAt || 0) < BLOCK_GRACE_MS) return false   // grace
        if (homeCoords) {
          const [clat, clng] = cellCenter(b.gx, b.gy)
          if (Math.hypot(clat - homeCoords[1], clng - homeCoords[0]) <= HOME_RADIUS_DEG) return false  // home-turf immune
        }
        return true
      })
      if (!eligible.length || Math.random() > 0.5) return   // most ticks pass
      const target = eligible[Math.floor(Math.random() * eligible.length)]
      const crew = ['red', 'blue', 'purple'][Math.floor(Math.random() * 3)]
      const r = aiPoachBlock(target.gx, target.gy, crew)
      if (r) { sfx.deny?.(); setLost(L => [{ id: `${target.gx}_${target.gy}_${now}`, ...r }, ...L].slice(0, 3)) }
    }, AI_BLOCK_POACH_MS)
    return () => clearInterval(iv)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeCoords])
  const dismiss = (id) => setLost(L => L.filter(e => e.id !== id))
  return { lost, dismiss }
}

// ---------------------------------------------------------------------
// Device location — the phone's REAL GPS position, projected onto the USA
// view as a blinking "you are here" dot. watchPosition keeps it live as the
// player moves; needs a secure context (HTTPS / localhost) + user permission.
// Returns [lng, lat] to match the map's projection input, or null until/unless
// a fix is granted (denied or off-map simply shows no dot).
// ---------------------------------------------------------------------
function useDeviceLocation() {
  const [coords, setCoords] = useState(null)   // [lng, lat]
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (pos) => setCoords([pos.coords.longitude, pos.coords.latitude]),
      ()    => {},   // denied / unavailable — leave null, no dot
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    )
    return () => { try { navigator.geolocation.clearWatch(id) } catch {} }
  }, [])
  return coords
}

// ---------------------------------------------------------------------
// MapScreen
// ---------------------------------------------------------------------
export default function MapScreen({ onNavigate }) {
  const [stateView, setStateView] = useState(null)          // null = country view
  const [turfView, setTurfView] = useState(null)            // Map 2 (turf map): { center:[lat,lng], label }
  const [blockSel, setBlockSel] = useState(null)            // tapped block { gx, gy }
  const [houseSel, setHouseSel] = useState(null)            // tapped rival trap house (shared-world house row)
  const [carDrive, setCarDrive] = useState(null)            // attack-car animation { id, from:{lat,lng}, to:{lat,lng}, startedAt, endsAt }
  const carIdRef = useRef(0)
  const [selectedFacility, setSelectedFacility] = useState(null)
  const [relocating, setRelocating] = useState(false)       // picking a relocate target
  const [relocateErr, setRelocateErr] = useState(null)      // "tapped a locked county" warning text
  const [moveConfirm, setMoveConfirm] = useState(null)      // { fips, name, state, miles, sec }
  const [, setMoveTick] = useState(0)                       // ticks the move countdown
  const [zip, setZip] = useState('')                        // ZIP search box
  const [zipBusy, setZipBusy] = useState(false)
  const [zipErr, setZipErr] = useState(null)
  const { attacks, landed, launch, dismissLanded } = useDriveBys()
  const { data: mapData } = useMapData()
  // Gate the block / NPC economy to the UNLOCKED counties (MVP: Harris only).
  // Turf exists only inside an unlocked county; everywhere else (other counties,
  // Canada, the ocean) is locked — no NPCs, nothing claimable. Open more later by
  // adding FIPS to UNLOCKED_COUNTY_FIPS in mapData.js. Reuses the land-mask gate.
  useEffect(() => {
    if (mapData) setLandTest(buildUnlockedCountyTest(mapData))
  }, [mapData])

  // Locked counties/states are uncolored on the overview maps — color (turf /
  // facility control) only shows once a county is unlocked/open. A state counts
  // as unlocked if it has any unlocked county.
  const LOCKED_FILL = '#1e1e2a'
  const unlockedCountySet = useMemo(() => new Set(UNLOCKED_COUNTY_FIPS), [])
  const unlockedStateSet  = useMemo(() => new Set(UNLOCKED_COUNTY_FIPS.map(f => f.slice(0, 2))), [])

  // Shared-world trap houses (M2a): make sure mine exists in the open county,
  // then stream every player's house so the turf map shows the real population.
  const auth = useAuth()
  const myName = useDisplayName()
  const sharedHouses = useSharedHouses()
  useEffect(() => { if (auth.userId && myName) ensureMyHouse(myName) }, [auth.userId, myName])
  // Load the shared turf for the open county + start streaming other players'
  // claims. Gated on mapData so the Harris land-mask (setLandTest, above) is set
  // first — otherwise the one-time publish could mis-tag out-of-county turf.
  useEffect(() => { if (auth.userId && mapData) initSharedBlocks() }, [auth.userId, mapData])
  // My trap house's spot in the open county (matches the row others see).
  const myHouseCoords = useMemo(() => (auth.userId ? harrisSpotFor(auth.userId) : null), [auth.userId])

  // ---- Real PvP raids (shared world) -------------------------------
  // The banners + landing modal + reinforce live in the global <RaidHud/> (so
  // they show on every screen). Here we only drive the attack-car off the raid
  // data so BOTH players see the car (attacker + defender), not just whoever
  // pressed the button. Plays once per raid id when it first appears; skips
  // raids already long in flight (e.g. after a reload).
  const activeRaids = useActiveRaids()                       // { incoming, outgoing } live
  const carPlayedFor = useRef(new Set())
  const houseSpotFor = useCallback((uid) => {
    const h = (sharedHouses || []).find(x => x.owner_id === uid)
    return (h && h.lat != null) ? { lat: h.lat, lng: h.lng } : harrisSpotFor(uid)
  }, [sharedHouses])
  useEffect(() => {
    const all = [...activeRaids.incoming, ...activeRaids.outgoing]
    for (const r of all) {
      if (carPlayedFor.current.has(r.id)) continue
      carPlayedFor.current.add(r.id)
      const startedAt = r.started_at ? new Date(r.started_at).getTime() : null
      const endsAt    = r.ends_at    ? new Date(r.ends_at).getTime()    : null
      // The car is now SYNCED to the raid timer (drives the whole countdown), so
      // an in-flight raid should still show — only skip ones that already landed
      // (nothing left to drive). The car resumes at its correct mid-flight spot.
      if (endsAt && Date.now() >= endsAt) continue
      carIdRef.current += 1
      setCarDrive({
        id: carIdRef.current,
        from: houseSpotFor(r.attacker_id),
        to: houseSpotFor(r.defender_id),
        startedAt, endsAt,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRaids])

  const territories = useTerritories()
  const world = useWorld()
  const cityById = useMemo(() => new Map(ALL_CITIES.map(c => [c.id, c])), [])
  // Facility → county FIPS (via its anchor city's coordinates).
  const cityCounty = useMemo(() => mapData ? buildCityCountyMap(mapData, ALL_CITIES) : {}, [mapData])
  // Live counties (KO respawn targets) = the curated facility counties.
  const liveFips = useMemo(() => {
    const s = new Set()
    FACILITIES.forEach(f => { const fp = cityCounty[f.cityId]; if (fp) s.add(fp) })
    return [...s]
  }, [cityCounty])

  // County FIPS → [lng,lat] centroid — the KO scatter destination, near which
  // the house lands on an open block (blocksStore.scatterToBlock).
  const fipsCoords = useCallback((fips) => {
    const f = findCountyFeature(mapData, fips)
    return f ? geoCentroid(f) : null
  }, [mapData])

  const { raids, landed: raidLanded, dismissLanded: dismissRaid } = useRaids(territories, world.player.home_house_id, liveFips, fipsCoords)
  useAiOffense()

  const attackingSet = useMemo(() => new Set(attacks.map(a => a.facilityId)), [attacks])
  const raidByFacility = useMemo(() => new Map(raids.map(r => [r.facilityId, r])), [raids])
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
      if (!h || !h.owner_player_id) out[f.id] = { kind: 'vacant', color: VACANT }
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

  // County name lookup (for the home-house status + relocation labels).
  const countyNameByFips = useMemo(() => {
    const m = {}
    if (mapData) mapData.counties.features.forEach(f => { m[String(f.id).padStart(5, '0')] = f.properties.name })
    return m
  }, [mapData])

  // Your held NPC blocks, geocoded to state + county. byState/byCounty drive the
  // "Your Blocks by State" (country view) and "Your Blocks by County" (state
  // view) lists. Each block is point-in-polygon'd to its county; the first two
  // FIPS digits give the state. Stays live via useYourBlocks.
  const myBlocks = useYourBlocks()
  const blockGeo = useMemo(() => {
    const byState = {}, byCounty = {}
    if (!mapData) return { byState, byCounty }
    for (const b of myBlocks) {
      const [lat, lng] = cellCenter(b.gx, b.gy)
      const fips = countyForPoint(mapData, lng, lat)
      if (!fips) continue
      const sf = fips.slice(0, 2)
      const st = byState[sf] || (byState[sf] = { fips: sf, code: STATE_FIPS_TO_CODE[sf] || sf, name: stateNameByFips[sf] || sf, count: 0 })
      st.count++
      const ct = byCounty[fips] || (byCounty[fips] = { fips, stateFips: sf, name: countyNameByFips[fips] || 'Unknown', count: 0, blocks: [] })
      ct.count++
      ct.blocks.push([lat, lng])
    }
    return { byState, byCounty }
  }, [myBlocks, mapData, stateNameByFips, countyNameByFips])

  const statesWithBlocks = useMemo(
    () => Object.values(blockGeo.byState).sort((a, b) => b.count - a.count),
    [blockGeo],
  )
  const countiesWithBlocks = useMemo(
    () => stateView
      ? Object.values(blockGeo.byCounty).filter(c => c.stateFips === stateView.fips).sort((a, b) => b.count - a.count)
      : [],
    [blockGeo, stateView],
  )
  // Unlocked (active-turf) counties in the current state — drives the per-county
  // gang leaderboards in the state view, regardless of whether you hold turf there.
  const unlockedCountiesInState = useMemo(
    () => stateView
      ? UNLOCKED_COUNTY_FIPS.filter(f => f.slice(0, 2) === stateView.fips)
          .map(f => ({ fips: f, name: countyNameByFips[f] || 'County' }))
      : [],
    [stateView, countyNameByFips],
  )

  // Open the Turf Map centered on the average of your owned blocks in a county,
  // so it lands right on your turf there.
  const openCountyTurf = (c) => {
    const n = c.blocks.length
    const [sumLat, sumLng] = c.blocks.reduce((a, [lat, lng]) => [a[0] + lat, a[1] + lng], [0, 0])
    setTurfView({ center: n ? [sumLat / n, sumLng / n] : null, label: `${c.name} County` })
  }

  // ZIP search — geocode a US ZIP via zippopotam.us (free, no key, not the
  // Mapbox endpoint our network blocks) and fly the turf map to it. Claiming is
  // still gated to unlocked counties; this just lets a player look at home.
  const goToZip = async () => {
    const z = String(zip).trim()
    if (!/^\d{5}$/.test(z)) { setZipErr('Enter a 5-digit ZIP'); sfx.deny?.(); return }
    setZipBusy(true); setZipErr(null)
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${z}`)
      if (!res.ok) throw new Error('not found')
      const data = await res.json()
      const p = data.places && data.places[0]
      if (!p) throw new Error('not found')
      const lat = parseFloat(p['latitude']), lng = parseFloat(p['longitude'])
      const place = `${p['place name']}, ${p['state abbreviation']}`
      sfx.tap?.()
      setTurfView({ center: [lat, lng], label: `${z} · ${place}` })
    } catch {
      setZipErr(`Couldn't find ZIP ${z}`); sfx.deny?.()
    } finally {
      setZipBusy(false)
    }
  }

  // Current county of a movable house: explicit county_fips, else via its city.
  const houseCounty = (h) => h?.county_fips || (h?.cityId != null ? cityCounty[h.cityId] : null)
  // Geographic coords [lng,lat] of a house. A KO scatter pins it to an exact
  // block (block_lat/block_lng); otherwise county centroid, else its city.
  const houseCoords = (h) => {
    if (!h) return null
    if (h.block_lat != null && h.block_lng != null) return [h.block_lng, h.block_lat]
    if (h.county_fips) { const f = findCountyFeature(mapData, h.county_fips); return f ? geoCentroid(f) : null }
    const c = cityById.get(h.cityId); return c ? [c.lng, c.lat] : null
  }

  const homeHouse = world.houses[world.player.home_house_id]
  const homeFips  = houseCounty(homeHouse)
  const moving    = !!homeHouse?.moving_until
  const moveRemaining = moving ? Math.max(0, Math.ceil((homeHouse.moving_until - Date.now()) / 1000)) : 0

  // Home coords (stable) → AI block poaching (gentle; home-turf is immune).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const homeCoords = useMemo(() => houseCoords(homeHouse), [homeHouse, mapData])
  const { lost: blockLost, dismiss: dismissBlockLost } = useBlockRaids(homeCoords)

  // Phone's real GPS location → blinking dot on the USA view (the state you're
  // physically in). Falls back to the trap house if GPS is denied/unavailable.
  const deviceCoords = useDeviceLocation()

  // Is the tapped block inside the home-turf radius of your trap house?
  const blockHomeTurf = useMemo(() => {
    if (!blockSel) return false
    const hc = houseCoords(homeHouse)   // [lng, lat]
    if (!hc) return false
    const [clat, clng] = cellCenter(blockSel.gx, blockSel.gy)
    return Math.hypot(clat - hc[1], clng - hc[0]) <= HOME_RADIUS_DEG
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockSel, homeHouse, mapData])

  // NOTE: trap houses / businesses / mansions are intentionally NOT rendered on
  // the Turf Map — it's the clean block / NPC-takeover surface. The house layer
  // moves to its own map tab. (Positioning logic lived here; recover from git
  // history — commit that added block_lat snapping — when building that tab.)

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

  // Tick the relocation countdown and land the move when the timer elapses.
  useEffect(() => {
    if (!homeHouse?.moving_until) return
    const iv = setInterval(() => {
      if (Date.now() >= homeHouse.moving_until) { arriveHouse(homeHouse.id); sfx.boom?.() }
      else setMoveTick(t => t + 1)
    }, 1000)
    return () => clearInterval(iv)
  }, [homeHouse?.moving_until, homeHouse?.id])

  // Relocation: tapping a county in relocate mode computes the real travel time.
  const beginMoveTo = (fips, name) => {
    const feat = findCountyFeature(mapData, fips)
    const miles = haversineMiles(houseCoords(homeHouse), feat ? geoCentroid(feat) : null)
    const sec = Math.round(Math.min(1800, Math.max(30, miles * 0.4)) / (IS_TEST ? 30 : 1))
    setMoveConfirm({ fips, name, state: stateView?.code, miles: Math.round(miles), sec })
  }
  const confirmMove = () => {
    moveHouse(homeHouse.id, moveConfirm.fips, moveConfirm.sec * 1000)
    sfx.launch?.()
    setMoveConfirm(null); setRelocating(false)
  }

  const currentLanded = landed[0] || null
  const currentRaidLanded = raidLanded[0] || null

  return (
    <div className="scroll-area animate-in">
      {/* Incoming enemy raids (most urgent — render first) */}
      {raids.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px 0' }}>
          {raids.map(r => r.kind === 'personal'
            ? <RaidBanner key={r.id} raid={r} isHome facility={{ name: 'Your Trap House' }} city={null}
                onDefend={() => { sfx.tap(); setRelocating(true); setTurfView(null) }} />
            : <RaidBanner key={r.id} raid={r} facility={FACILITY_BY_ID.get(r.facilityId)} city={cityById.get(FACILITY_BY_ID.get(r.facilityId)?.cityId)}
                onDefend={() => setSelectedFacility(FACILITY_BY_ID.get(r.facilityId))} />
          )}
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


      {/* Blocks a rival crew bought out from you (you got paid) */}
      {blockLost.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px 0' }}>
          {blockLost.map(e => (
            <div key={e.id} onClick={() => dismissBlockLost(e.id)} style={{ background: 'linear-gradient(135deg, #1a0d00, #100a02)', border: `1px solid ${GOLD}44`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: `${RED}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-user-x" style={{ color: RED, fontSize: 18 }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: RED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>{e.crew.toUpperCase()} CREW MUSCLED IN</div>
                <div style={{ color: '#fff', fontSize: 13 }}>Bought out {e.npc} — you cashed out {e.payout.toLocaleString()} Hustle</div>
              </div>
              <i className="ti ti-x" style={{ color: DIM, fontSize: 16 }} />
            </div>
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

      {/* Your trap house — your own grow-and-sell operation (not gang-gated).
          Tap the card to walk the rooms; or relocate it to another county. */}
      <div style={{ padding: '10px 16px 0' }}>
        <div
          onClick={() => { if (!relocating) { sfx.tap(); onNavigate && onNavigate('traphouse') } }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#13131f', border: `0.5px solid ${moving ? GOLD + '66' : '#2a2a3a'}`, borderRadius: 14, padding: '10px 12px', cursor: !relocating ? 'pointer' : 'default' }}
        >
          <div style={{ width: 32, height: 32, borderRadius: 9, background: `${GOLD}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className={`ti ${moving ? 'ti-arrows-move' : 'ti-home'}`} style={{ color: GOLD, fontSize: 16 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontSize: 10, letterSpacing: 1, fontWeight: 600 }}>YOUR TRAP HOUSE</div>
            <div style={{ color: '#fff', fontSize: 13, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {moving
                ? `Relocating to ${countyNameByFips[homeHouse.moving_to_fips] || 'destination'} County · ${fmtClock(moveRemaining)}`
                : (homeFips ? `${countyNameByFips[homeFips] || 'Unknown'} County` : 'Unplaced')}
            </div>
            {!moving && !relocating && (
              <div style={{ color: '#2ecc71', fontSize: 10, marginTop: 2 }}><i className="ti ti-plant-2" style={{ marginRight: 3 }} />Tap to grow &amp; sell</div>
            )}
          </div>
          {!moving && !relocating && (
            <button className="btn" onClick={(e) => { e.stopPropagation(); sfx.tap(); setRelocating(true); setRelocateErr(null); setTurfView(null) }}
              style={{ padding: '7px 11px', background: GOLD, color: '#0a0a0f', border: 'none', borderRadius: 9, fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>
              <i className="ti ti-arrows-move" /> Relocate
            </button>
          )}
          {relocating && (
            <button className="btn btn-dark" onClick={(e) => { e.stopPropagation(); sfx.tap(); setRelocating(false); setRelocateErr(null) }} style={{ padding: '7px 11px', fontSize: 11 }}>
              Cancel
            </button>
          )}
        </div>
        {relocating && (
          <div style={{ color: relocateErr ? RED : GOLD, fontSize: 11, marginTop: 8, textAlign: 'center' }}>
            {relocateErr || 'Tap a state, then tap any unlocked county to move your trap house there.'}
          </div>
        )}
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
              colorFor={(fips) => {
                if (!unlockedCountySet.has(String(fips).padStart(5, '0'))) return LOCKED_FILL   // locked county → no color
                const f = facilityByFips[fips]; return f ? facilityControl[f.id].color : '#15151f'
              }}
              strokeFor={(fips) => facilityByFips[fips] ? '#fff' : `${GOLD}59`}
              strokeWidthFor={(fips) => facilityByFips[fips] ? 1.5 : 0.7}
              onCountyClick={(c) => {
                if (relocating) {
                  // Can only relocate into an unlocked county — locked counties
                  // aren't open for view (uncolored), so they can't be a target.
                  if (!unlockedCountySet.has(String(c.fips).padStart(5, '0'))) {
                    sfx.lose?.(); setRelocateErr(`${c.name} County is locked — unlock it before moving there.`)
                    return
                  }
                  sfx.tap(); setRelocateErr(null); beginMoveTo(c.fips, c.name); return
                }
                const fac = facilityByFips[c.fips]
                if (fac) {
                  sfx.tap()
                  const city = cityById.get(fac.cityId)   // where the houses actually sit
                  setTurfView({ center: city ? [city.lat, city.lng] : null, label: `${c.name} County` })
                }
              }}
              height="58vh"
            />
          ) : (
            <USCountryMap
              colorFor={(fips, code) => {
                if (!unlockedStateSet.has(String(fips).padStart(2, '0'))) return LOCKED_FILL   // locked state → no color
                return stateColorFor(stateControl[code], mobColorById)
              }}
              onStateClick={(s) => setStateView(s)}
              marker={deviceCoords || homeCoords}
              height="58vh"
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '10px 12px', borderTop: `0.5px solid ${GOLD}22` }}>
            {[
              { color: GOLD, label: 'Your Mob' },
              { color: RED, label: 'Rival Mobs' },
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
            Tap a state to drill into the counties where you hold turf.
          </div>
        )}
      </div>

      {/* ZIP jump — look up your home area on the turf map. Country view only. */}
      {!stateView && (
        <div className="section">
          <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-map-search" style={{ color: '#4a9eff' }} /> Find Your Area
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={zip}
              onChange={e => { setZip(e.target.value.replace(/[^\d]/g, '').slice(0, 5)); setZipErr(null) }}
              onKeyDown={e => { if (e.key === 'Enter') goToZip() }}
              inputMode="numeric"
              placeholder="Enter ZIP code"
              style={{ flex: 1, background: '#13131f', border: '0.5px solid #2a2a38', borderRadius: 10, padding: '11px 13px', color: '#fff', fontSize: 15, outline: 'none' }}
            />
            <button className="btn btn-gold" onClick={goToZip} disabled={zipBusy}
              style={{ padding: '0 18px', opacity: zipBusy ? 0.6 : 1 }}>
              {zipBusy ? '…' : 'Go'}
            </button>
          </div>
          {zipErr
            ? <div style={{ color: RED, fontSize: 11.5, marginTop: 6 }}>{zipErr}</div>
            : <div style={{ color: DIM, fontSize: 11, marginTop: 6 }}>Jump to your neighborhood. You can only claim turf in unlocked counties for now.</div>}
        </div>
      )}

      {/* Gang turf leaderboards — each active-turf state expands to its gang
          board, ranked by blocks owned. Country view only. */}
      {!stateView && (
        <div className="section">
          <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-trophy" style={{ color: GOLD }} /> Gang Turf Leaderboard
          </div>
          <StateTurfAccordion
            mapData={mapData}
            unlockedFips={UNLOCKED_COUNTY_FIPS}
            stateNameByFips={stateNameByFips}
          />
        </div>
      )}
      {!stateView && (
        <div className="section">
          <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-activity" style={{ color: '#4a9eff' }} /> Activity
          </div>
          <ActivityFeed />
        </div>
      )}

      {/* Country view: the states where you hold NPC blocks, with counts. Tap a
          state to drill into its counties. */}
      {!stateView && (
        <div className="section">
          <div className="section-label">Your Blocks by State</div>
          {statesWithBlocks.length === 0 ? (
            <div style={{ background: '#13131f', border: '0.5px solid #1e1e2a', borderRadius: 12, padding: 18, textAlign: 'center', color: DIM, fontSize: 12, lineHeight: 1.5 }}>
              You don't own any blocks yet. Tap a state, then a county, to claim turf.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {statesWithBlocks.map(s => (
                <div key={s.fips} className="card card-pad"
                  onClick={() => { sfx.tap(); setStateView({ fips: s.fips, code: s.code, name: s.name }) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer', borderColor: `${GOLD}44` }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${GOLD}18`, color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-map-pin" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{s.count} block{s.count === 1 ? '' : 's'} owned</div>
                  </div>
                  <div style={{ color: GOLD, fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.count}</div>
                  <i className="ti ti-chevron-right" style={{ color: DIM, fontSize: 18 }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* State view: the counties where you hold NPC blocks, with counts.
          Replaces the old facilities-owned list. Tap a county to open its Turf
          Map, centered on your blocks there. */}
      {stateView && (
        <div className="section">
          <div className="section-label">{stateView.name} — Your Blocks by County</div>
          {countiesWithBlocks.length === 0 ? (
            <div style={{ background: '#13131f', border: '0.5px solid #1e1e2a', borderRadius: 12, padding: 18, textAlign: 'center', color: DIM, fontSize: 12, lineHeight: 1.5 }}>
              You don't own any blocks in {stateView.name} yet. Tap a county on the map to claim turf.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {countiesWithBlocks.map(c => (
                <div key={c.fips} className="card card-pad"
                  onClick={() => { sfx.tap(); openCountyTurf(c) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer', borderColor: `${GOLD}44` }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${GOLD}18`, color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-map-pin" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{c.name} County</div>
                    <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{c.count} block{c.count === 1 ? '' : 's'} owned</div>
                  </div>
                  <div style={{ color: GOLD, fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.count}</div>
                  <i className="ti ti-chevron-right" style={{ color: DIM, fontSize: 18 }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* County gang leaderboards for the drilled-in state — one board per
          active-turf county, ranked by blocks owned. */}
      {stateView && unlockedCountiesInState.length > 0 && (
        <div className="section">
          <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-trophy" style={{ color: GOLD }} /> {stateView.name} — County Gang Leaderboards
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {unlockedCountiesInState.map(c => (
              <CountyGangLeaderboard
                key={c.fips}
                mapData={mapData}
                fips={c.fips}
                title={`${c.name} County Gang Leaderboard`}
              />
            ))}
          </div>
        </div>
      )}

      {moveConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 260 }} onClick={() => setMoveConfirm(null)}>
          <div style={{ background: '#13131f', borderRadius: 16, padding: 22, width: '100%', maxWidth: 320, margin: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ color: GOLD, fontSize: 11, letterSpacing: 2, fontWeight: 600, textAlign: 'center' }}>RELOCATE TRAP HOUSE</div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 600, textAlign: 'center', marginTop: 6 }}>{moveConfirm.name} County</div>
            <div style={{ color: '#888', fontSize: 12, textAlign: 'center', marginTop: 2 }}>{moveConfirm.state}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, margin: '18px 0' }}>
              <div style={{ textAlign: 'center' }}><div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>{moveConfirm.miles}</div><div style={{ color: DIM, fontSize: 10, letterSpacing: 0.5 }}>MILES</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ color: GOLD, fontSize: 18, fontWeight: 600 }}>{fmtClock(moveConfirm.sec)}</div><div style={{ color: DIM, fontSize: 10, letterSpacing: 0.5 }}>TRAVEL</div></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-dark" style={{ flex: 1, padding: 12 }} onClick={() => setMoveConfirm(null)}>Cancel</button>
              <button className="btn btn-gold" style={{ flex: 1, padding: 12 }} onClick={confirmMove}>Move</button>
            </div>
          </div>
        </div>
      )}

      {turfView && (
        <TurfMap
          center={turfView.center || HARRIS_CENTER}
          label={turfView.label}
          counties={mapData?.counties}
          onBlockTap={(gx, gy) => setBlockSel({ gx, gy })}
          onBack={() => setTurfView(null)}
          trapHouse={myHouseCoords || (homeCoords ? { lat: homeCoords[1], lng: homeCoords[0] } : null)}
          trapHouseName={myName}
          onTrapHouseTap={() => onNavigate && onNavigate('traphouse')}
          onHouseTap={(h) => setHouseSel(h)}
          otherHouses={sharedHouses}
          myUserId={auth.userId}
          raidDrive={carDrive}
          onRaidArrive={() => setCarDrive(null)}
        />
      )}

      {blockSel && (
        <BlockSheet gx={blockSel.gx} gy={blockSel.gy} homeTurf={blockHomeTurf} onClose={() => setBlockSel(null)} />
      )}

      {houseSel && (
        <RivalHouseSheet
          house={houseSel}
          onClose={() => setHouseSel(null)}
          onLaunch={async (target, power) => {
            // Just launch — the raid-data watcher above plays the car on BOTH
            // the attacker's and the defender's maps when the row appears.
            const r = await launchRaid({ targetHouse: target, power })
            if (!r.ok && r.error !== 'self' && r.error !== 'broke') console.warn('[raid] launch failed', r.error)
          }}
        />
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

      {currentRaidLanded && (currentRaidLanded.kind === 'personal'
        ? <HomeRaidModal
            result={currentRaidLanded}
            countyName={countyNameByFips[currentRaidLanded.county] || ''}
            onClose={() => dismissRaid(currentRaidLanded.id)}
          />
        : <RaidLandedModal
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

// Tapping a RIVAL's trap-house pin opens this action sheet. Three plays:
// Snoop (recon), Attack (the raid), RAT (snitch). Attack is the one we're
// building out — Snoop/RAT are stubbed until their systems land.
function RivalHouseSheet({ house, onClose, onLaunch }) {
  const [mode, setMode] = useState('menu')          // 'menu' | 'attack'
  const { players } = usePlayers()
  const stats = usePlayerStats()
  const myPower = stats.atk + stats.def

  const prof = players[house.owner_id] || {}
  const look = resolveLook(prof.player_look_id)
  // Prefer the house row's name — it updates live via the houses realtime stream
  // on a rename, whereas the players directory (public_profiles) is cached.
  const name = house.name || prof.display_name || 'Rival'
  const hp = house.hp != null ? house.hp : 100
  const hpMax = house.hp_max != null ? house.hp_max : 100
  const hpPct = Math.max(0, Math.min(100, Math.round((hp / hpMax) * 100)))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 280 }} onClick={onClose}>
      <div className="animate-in" style={{ background: '#13131f', borderRadius: 20, padding: 20, width: '100%', maxWidth: 440 }} onClick={e => e.stopPropagation()}>

        {/* Target header — who + their trap-house HP */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar src={look.avatar} emoji={look.emoji} size={52} radius={12} style={{ border: `2px solid ${RED}` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: DIM, fontSize: 10, letterSpacing: 1.5, fontWeight: 600 }}>RIVAL TRAP HOUSE</div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          </div>
          <div style={{ fontSize: 30 }}>🏚️</div>
        </div>

        {/* HP bar */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: DIM, letterSpacing: 0.5, marginBottom: 4 }}>
            <span>HOUSE INTEGRITY</span><span style={{ color: hpPct > 33 ? '#2ecc71' : RED }}>{hp} / {hpMax}</span>
          </div>
          <div style={{ height: 8, borderRadius: 5, background: '#0a0a12', overflow: 'hidden' }}>
            <div style={{ width: `${hpPct}%`, height: '100%', background: hpPct > 33 ? 'linear-gradient(90deg,#2ecc71,#27ae60)' : 'linear-gradient(90deg,#e74c3c,#c0392b)', transition: 'width .4s' }} />
          </div>
        </div>

        {mode === 'menu' ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <PlayButton emoji="🔍" label="Snoop" sub="Soon" tint="#4a9eff" disabled onClick={() => {}} />
            <PlayButton emoji="💥" label="Attack" sub="Raid" tint={RED} onClick={() => { sfx.tap?.(); setMode('attack') }} />
            <PlayButton emoji="🐀" label="RAT" sub="Soon" tint="#c9a84c" disabled onClick={() => {}} />
          </div>
        ) : (
          <AttackPlan house={house} name={name} myPower={myPower} hp={hp} hpMax={hpMax}
            onBack={() => setMode('menu')} onClose={onClose} onLaunch={onLaunch} />
        )}

        {mode === 'menu' && (
          <button className="btn btn-dark" style={{ width: '100%', padding: 12, marginTop: 10 }} onClick={onClose}>Close</button>
        )}
      </div>
    </div>
  )
}

function PlayButton({ emoji, label, sub, tint, onClick, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      flex: 1, background: disabled ? '#0e0e16' : '#1a1a28', border: `1px solid ${disabled ? '#22222e' : tint + '66'}`,
      borderRadius: 14, padding: '14px 6px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <span style={{ fontSize: 24 }}>{emoji}</span>
      <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{label}</span>
      <span style={{ color: tint, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>{sub}</span>
    </button>
  )
}

// The Attack plan — your muscle vs their house, the Steel cost, and the
// "Send the Hit" launch. Launch spends Steel + creates the timed raid row
// (raidsStore.launchRaid, run by the parent) and fires the attack-car drive.
function AttackPlan({ house, name, myPower, hp, hpMax, onBack, onClose, onLaunch }) {
  const hustle = useHustle()
  const broke = hustle < RAID_HUSTLE_COST
  // Visual estimate only — real damage is computed server-side at landing.
  const estDamage = Math.max(15, Math.min(80, Math.round(myPower * 0.4)))

  const launch = () => {
    if (broke) { sfx.deny?.(); return }
    sfx.launch?.()
    onLaunch && onLaunch(house, myPower)
    onClose()
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
        <MiniStat label="YOUR MUSCLE" value={myPower} color={GOLD} />
        <div style={{ display: 'flex', alignItems: 'center', color: RED, fontSize: 20 }}>⚔️</div>
        <MiniStat label="EST. DAMAGE" value={`-${estDamage}`} color={RED} />
      </div>

      <div style={{ marginTop: 12, background: '#0e0e16', border: '1px solid #22222e', borderRadius: 12, padding: 12, fontSize: 12, color: '#aaa', lineHeight: 1.5 }}>
        Send the crew on {name}'s trap house. They'll be <span style={{ color: '#fff' }}>en route</span> — once the car lands it hits the house. Knock it to <span style={{ color: RED }}>0</span> to bust it down. They can reinforce before you arrive.
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 12 }}>
        <span style={{ color: DIM }}>COST</span>
        <span style={{ color: broke ? RED : '#fff', fontWeight: 700 }}>{RAID_HUSTLE_COST} Hustle{broke ? ' — not enough' : ''}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn btn-dark" style={{ flex: '0 0 90px', padding: 12 }} onClick={onBack}>Back</button>
        <button className="btn btn-gold" style={{ flex: 1, padding: 12, opacity: broke ? 0.5 : 1 }} onClick={launch} disabled={broke}>
          <i className="ti ti-car" style={{ marginRight: 6 }} /> Send the Hit
        </button>
      </div>
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: '#0e0e16', border: '1px solid #22222e', borderRadius: 12, padding: '10px 6px', textAlign: 'center' }}>
      <div style={{ color, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: DIM, fontSize: 9, marginTop: 5, letterSpacing: 0.8 }}>{label}</div>
    </div>
  )
}

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
function RaidBanner({ raid, facility, city, onDefend, isHome }) {
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
          <i className="ti ti-alert-triangle-filled" /> {isHome ? 'Trap House Under Fire' : 'Incoming Raid'}
        </div>
        <div style={{ color: '#fff', fontSize: 13, marginBottom: 2 }}>{raid.gang} → {label}{city ? `, ${city.state}` : ''}</div>
        <div style={{ color: GOLD, fontSize: 10, fontWeight: 600 }}>{isHome ? 'Tap to relocate — dodge the hit' : 'Tap to reinforce — hold your ground'}</div>
      </div>
      <i className={`ti ${isHome ? 'ti-home-bolt' : 'ti-shield-half-filled'}`} style={{ color: RED, fontSize: 20 }} />
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

// Shown when an enemy raid lands on YOUR personal trap house: either you held
// (chipped) or you got knocked out and scattered to a random county.
function HomeRaidModal({ result, countyName, onClose }) {
  const ko = !!result.ko
  const gang = result.gang || 'A rival mob'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'stretch', justifyContent: 'center', zIndex: 250 }}>
      <div style={{ background: '#13131f', padding: 24, width: '100%', maxWidth: 390, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 80 }}>
        <div className="landing-stamp" style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 84, height: 84, borderRadius: '50%',
            background: `${RED}22`, border: `2px solid ${RED}`, color: RED, fontSize: 40, boxShadow: `0 0 32px ${RED}66`,
          }}>
            <i className={`ti ${ko ? 'ti-skull' : 'ti-alert-triangle-filled'}`} />
          </div>
        </div>

        <div style={{ color: RED, fontSize: 13, fontWeight: 600, letterSpacing: 3, textAlign: 'center', marginBottom: 6 }}>
          {ko ? 'KNOCKED OUT' : 'TRAP HOUSE HIT'}
        </div>
        <div style={{ color: '#fff', fontSize: 24, fontWeight: 600, textAlign: 'center', marginBottom: 6 }}>Your Trap House</div>
        <div style={{ color: '#888', fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginBottom: 22 }}>
          {ko
            ? `${gang} overran it — you scattered to ${countyName || 'a new'} County`
            : `${gang} hit your trap house — relocate or lie low before they finish the job`}
        </div>

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
  const takenBy = result.takenBy           // a rival out-damaged you and grabbed it
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
            <i className={`ti ${flipped ? 'ti-flag-filled' : takenBy ? 'ti-flag-off' : 'ti-target-arrow'}`} />
          </div>
        </div>

        <div style={{ color: flipped ? GOLD : RED, fontSize: 13, fontWeight: 600, letterSpacing: 3, textAlign: 'center', marginBottom: 6 }}>
          {flipped ? 'TERRITORY CAPTURED' : takenBy ? 'OUT-MUSCLED' : 'DRIVE BY LANDED'}
        </div>
        <div style={{ color: '#fff', fontSize: 24, fontWeight: 600, textAlign: 'center', marginBottom: 6 }}>{facility.name}</div>

        {flipped ? (
          <div style={{ color: '#888', fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginBottom: 22 }}>
            is now under {playerName}'s flag — collect its income on the scout screen
          </div>
        ) : takenBy ? (
          <div style={{ color: '#888', fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginBottom: 22 }}>
            you landed the final hit, but {takenBy} did more damage and grabbed it — most damage wins
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

function findCountyFeature(mapData, fips) {
  if (!mapData || !fips) return null
  return mapData.counties.features.find(f => String(f.id).padStart(5, '0') === fips) || null
}
function haversineMiles(a, b) {
  if (!a || !b) return 0
  const R = 3959, toRad = d => d * Math.PI / 180
  const [lng1, lat1] = a, [lng2, lat2] = b
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = Math.max(0, sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(full, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(2)})`
}

// State fill (country view): gold if you hold any facility there; otherwise the
// DOMINANT rival mob's color (intensity scales with its share); dark if only
// vacant or no facilities. Colors by MOB — the Phase-B projection.
function stateColorFor(s, mobColorById) {
  if (!s || s.total === 0) return '#1e1e2a'
  if (s.yours > 0) return `rgba(201,168,76,${(0.3 + Math.min(1, s.yours / s.total) * 0.5).toFixed(2)})`
  let domId = null, domN = 0
  for (const id in s.mobCounts) if (s.mobCounts[id] > domN) { domN = s.mobCounts[id]; domId = id }
  if (domId) return hexToRgba(mobColorById[domId] || '#e74c3c', 0.3 + Math.min(1, domN / s.total) * 0.5)
  return '#1e1e2a'   // facilities exist but all vacant → dark (no green)
}
