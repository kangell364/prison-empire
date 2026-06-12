// sharedHousesStore — M2a of multiplayer: trap houses in the shared world.
//
// Every signed-in player gets ONE personal trap house row in the Supabase
// `houses` table, placed at a stable spot inside the open county (Harris) so
// houses don't stack. `useSharedHouses()` streams every house in the county
// (yours + everyone else's) live, so the map can render the real population.
//
// This is the first piece that reads/writes the shared world. Turf (the blocks
// table) is M2b; server-validated economy/anti-cheat is M3.

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../supabase'
import { getUserId } from './profileStore'
import { spendCash, addCash } from './cashStore'

// Compress all timers ~30× when ?test=1 so the build/upgrade loop is testable.
const IS_TEST = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('test') === '1'

// MVP: single open county. When more counties unlock, this becomes per-county.
const COUNTY_FIPS = '48201'                 // Harris

// ---- house levels --------------------------------------------------
// Leveling a trap house raises its hp_max (so integrity + regen + raid
// toughness all scale off the bigger pool — no resolve_raid change needed).
// Lean MVP: integrity + defense only. Requires the house_levels.txt migration
// (level + upgrading_until columns); degrades to level 1 if not yet applied.
export const UPGRADE_MAX_LEVEL = 10

export function houseLevel(house)      { return Math.max(1, house?.level || 1) }
export function hpMaxForLevel(level)   { return 100 + (Math.max(1, level) - 1) * 40 }   // L1:100 … L10:460
export function regenPerHrForLevel(lv) { return 10 + (Math.max(1, lv) - 1) * 5 }          // higher level rebuilds faster
// Cash to go from `level` → level+1, and the build timer (seconds).
export function upgradeCost(level)     { return 50000 * Math.max(1, level) }              // L1→2:50k … L9→10:450k
export function upgradeSec(level)      { return Math.round((120 * Math.max(1, level)) / (IS_TEST ? 30 : 1)) }

// ---- house integrity regen -----------------------------------------
// A damaged trap house slowly rebuilds its integrity on its own, just like the
// player's health pool. Anchored to the row's `updated_at` (bumped on every hp
// change — raid resolve / reinforce), so regen is computed client-side on read
// with no extra writes. Returns the live value + countdowns for the UI counter.
export function houseIntegrity(house, now = Date.now()) {
  const hpMax = house?.hp_max != null ? house.hp_max : 100
  const stored = house?.hp != null ? house.hp : hpMax
  if (stored >= hpMax) return { hp: hpMax, hpMax, full: true, nextInSec: 0, fullInSec: 0 }
  const regenPerHr = regenPerHrForLevel(houseLevel(house))
  const anchor = house?.updated_at ? new Date(house.updated_at).getTime() : now
  const hours = Math.max(0, (now - anchor) / 3_600_000)
  const regened = Math.min(hpMax, stored + regenPerHr * hours)
  const hp = Math.floor(regened)
  if (hp >= hpMax) return { hp: hpMax, hpMax, full: true, nextInSec: 0, fullInSec: 0 }
  const msPerPoint = 3_600_000 / regenPerHr
  return {
    hp, hpMax, full: false,
    nextInSec: Math.max(1, Math.ceil(((hp + 1 - regened) * msPerPoint) / 1000)),
    fullInSec: Math.max(1, Math.ceil(((hpMax - regened) * msPerPoint) / 1000)),
  }
}

// ---- upgrade flow --------------------------------------------------
// Returns true while an upgrade build is in progress.
export function isUpgrading(house, now = Date.now()) {
  return !!(house?.upgrading_until && new Date(house.upgrading_until).getTime() > now)
}
export function upgradeRemainingSec(house, now = Date.now()) {
  if (!house?.upgrading_until) return 0
  return Math.max(0, Math.ceil((new Date(house.upgrading_until).getTime() - now) / 1000))
}

// Start an upgrade on YOUR OWN house — spend Cash, set the build timer. The
// owner's RLS lets them update their row directly (same as reinforce).
export async function upgradeMyHouse(house) {
  if (!isSupabaseConfigured || !house) return { ok: false, error: 'offline' }
  const level = houseLevel(house)
  if (level >= UPGRADE_MAX_LEVEL) return { ok: false, error: 'max' }
  if (isUpgrading(house)) return { ok: false, error: 'busy' }
  const cost = upgradeCost(level)
  if (!spendCash(cost)) return { ok: false, error: 'broke' }
  const until = new Date(Date.now() + upgradeSec(level) * 1000).toISOString()
  const { error } = await supabase.from('houses')
    .update({ upgrading_until: until, updated_at: new Date().toISOString() }).eq('id', house.id)
  if (error) { addCash(cost); return { ok: false, error: error.message } }
  loadHouses()
  return { ok: true, until }
}

// Finish a completed upgrade: bump level + hp_max, refill integrity, clear the
// timer. The owner's client calls this once the build timer elapses (idempotent
// — a no-op if the timer hasn't passed or there's nothing building).
export async function settleUpgrade(house) {
  if (!isSupabaseConfigured || !house || !house.upgrading_until) return
  if (new Date(house.upgrading_until).getTime() > Date.now()) return
  const newLevel = Math.min(UPGRADE_MAX_LEVEL, houseLevel(house) + 1)
  const newMax = hpMaxForLevel(newLevel)
  const { error } = await supabase.from('houses').update({
    level: newLevel, hp_max: newMax, hp: newMax, upgrading_until: null, updated_at: new Date().toISOString(),
  }).eq('id', house.id)
  if (!error) loadHouses()
}
const HARRIS = { lat: 29.7604, lng: -95.3698 }
const SPREAD = 0.18                          // ~12mi box around downtown Houston

// Deterministic [0,1) hash so a given user always lands on the same spot.
function hash01(str, salt) {
  let h = 2166136261 ^ salt
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100000) / 100000
}
export function harrisSpotFor(userId) {
  return {
    lat: HARRIS.lat + (hash01(userId, 1) - 0.5) * SPREAD,
    lng: HARRIS.lng + (hash01(userId, 2) - 0.5) * SPREAD,
  }
}

// Create (or refresh the name on) the caller's trap house. Safe to call on
// every mount. Re-runs when the NAME changes (so a rename updates the row and
// streams the new name onto everyone's map), but skips redundant calls for the
// same user+name. No-op without a backend / user.
let ensuredFor = null
let ensuredName = null
export async function ensureMyHouse(name) {
  if (!isSupabaseConfigured) return
  const uid = getUserId()
  if (!uid) return
  if (ensuredFor === uid && ensuredName === name) return   // nothing changed
  ensuredFor = uid
  ensuredName = name
  try {
    const { data: existing } = await supabase
      .from('houses').select('id').eq('owner_id', uid).eq('kind', 'personal').maybeSingle()
    if (existing) {
      await supabase.from('houses').update({ name, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      const spot = harrisSpotFor(uid)
      await supabase.from('houses').insert({
        owner_id: uid, kind: 'personal', name, lat: spot.lat, lng: spot.lng, county_fips: COUNTY_FIPS,
      })
    }
  } catch (e) {
    ensuredFor = null; ensuredName = null   // let a later mount retry
    console.warn('[sharedHouses] ensure failed', e)
  }
}

// Live list of every trap house in the open county. SINGLETON — one fetch +
// one realtime channel shared by every consumer (the map AND the global raid
// HUD both read this). Subscribing per-hook would create duplicate channels
// with the same topic, and Supabase throws on the second .subscribe().
let housesCache = []
let housesStarted = false
const housesListeners = new Set()

async function loadHouses() {
  const { data } = await supabase.from('houses').select('*').eq('county_fips', COUNTY_FIPS)
  if (data) { housesCache = data; housesListeners.forEach(fn => fn(housesCache)) }
}

// Defensive: tear down any pre-existing channel with this topic before creating
// a fresh one, so we can never hit Supabase's "cannot add postgres_changes
// callbacks after subscribe()" (which crashes the app) if this somehow runs more
// than once (a stray re-eval, double-mount, etc.).
function freshChannel(topic) {
  try {
    const existing = supabase.getChannels ? supabase.getChannels() : []
    existing.forEach(c => { if (c.topic === `realtime:${topic}`) { try { supabase.removeChannel(c) } catch {} } })
  } catch {}
  return supabase.channel(topic)
}

function startHousesSync() {
  if (housesStarted || !isSupabaseConfigured) return
  housesStarted = true
  loadHouses()
  freshChannel(`houses:${COUNTY_FIPS}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'houses', filter: `county_fips=eq.${COUNTY_FIPS}` }, loadHouses)
    .subscribe()
}

export function useSharedHouses() {
  const [houses, setHouses] = useState(housesCache)
  useEffect(() => {
    housesListeners.add(setHouses)
    startHousesSync()
    setHouses(housesCache)
    return () => { housesListeners.delete(setHouses) }
  }, [])
  return houses
}
