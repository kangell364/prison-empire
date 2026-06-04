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

// MVP: single open county. When more counties unlock, this becomes per-county.
const COUNTY_FIPS = '48201'                 // Harris
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

// Create (or refresh the name on) the caller's trap house. Idempotent per
// session — safe to call on every mount. No-op without a backend / user.
let ensuredFor = null
export async function ensureMyHouse(name) {
  if (!isSupabaseConfigured) return
  const uid = getUserId()
  if (!uid || ensuredFor === uid) return
  ensuredFor = uid
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
    ensuredFor = null   // let a later mount retry
    console.warn('[sharedHouses] ensure failed', e)
  }
}

// Live list of every trap house in the open county. Re-fetches on any insert/
// update/delete via realtime so new players + relocations appear immediately.
export function useSharedHouses() {
  const [houses, setHouses] = useState([])
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let alive = true
    const load = async () => {
      const { data } = await supabase.from('houses').select('*').eq('county_fips', COUNTY_FIPS)
      if (alive && data) setHouses(data)
    }
    load()
    const ch = supabase
      .channel(`houses:${COUNTY_FIPS}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'houses', filter: `county_fips=eq.${COUNTY_FIPS}` }, load)
      .subscribe()
    return () => { alive = false; try { supabase.removeChannel(ch) } catch {} }
  }, [])
  return houses
}
