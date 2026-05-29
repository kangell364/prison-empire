// Upgrades store — per (card_id, card_level) ATK/DEF upgrade levels.
//
// Internal state shape: Map<"cardId:cardLevel", { atk, def }>
//   atk/def are upgrade LEVELS (0..MAX_UPGRADE_LEVEL), not stat bonuses.
//   The bonus is level × ATK_PER_LEVEL / DEF_PER_LEVEL (see crewStore).
//
// Two backends (mirrors cardsStore / profileStore — the Phase 1 pattern):
//   - Supabase: rows in public.card_upgrades.
//   - localStorage fallback: pe_card_upgrades_v1 (JSON).
//
// Migration: upgrades used to live inside crewStore's pe_crew_v1 blob,
// keyed by card_id only (implicitly Level 1). On first load we lift those
// into this store as Level-1 entries, and on first Supabase sign-in we push
// any local upgrades up to a fresh (empty) server.

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../supabase'
import { ensureAuth, getUserId } from './profileStore'

const STORAGE_KEY     = 'pe_card_upgrades_v1'
const LEGACY_CREW_KEY = 'pe_crew_v1'   // old card_id-keyed home of upgrades

export const MAX_UPGRADE_LEVEL = 20
export const HUSTLE_COST_PER_LEVEL = (currentLevel) => 200 + currentLevel * 100

const ZERO = { atk: 0, def: 0 }

let state = readLocalSeed()      // Map<"id:level", {atk,def}>
const listeners = new Set()
let initPromise = null

// ---- helpers -------------------------------------------------------

function keyOf(id, level) { return `${id}:${level}` }
function parseKey(k)      { const [a, b] = k.split(':'); return [Number(a), Number(b)] }

// ---- public API ----------------------------------------------------

export function useUpgrades() {
  const [s, setS] = useState(state)
  useEffect(() => {
    listeners.add(setS)
    return () => listeners.delete(setS)
  }, [])
  return s
}

// Pure read from a map snapshot — use with the value from useUpgrades() so
// the read participates in React's render cycle.
export function readUpgrade(map, cardId, cardLevel = 1) {
  return map.get(keyOf(cardId, cardLevel)) || ZERO
}

// Module read — for click handlers that need the current value at call time.
export function getUpgrade(cardId, cardLevel = 1) {
  return state.get(keyOf(cardId, cardLevel)) || ZERO
}

// Flatten one level into a { [cardId]: {atk,def} } map — for crew/battle
// code that operates on a single (Level 1) view keyed by card_id.
export function flatAtLevel(map, level = 1) {
  const out = {}
  for (const [k, v] of map.entries()) {
    const [id, lvl] = parseKey(k)
    if (lvl === level) out[id] = v
  }
  return out
}

// On merge: the new (cardId, toLevel) card inherits the merged card's upgrade
// levels. Takes the higher of the two stats so repeat merges never reduce an
// already-upgraded higher level. No-op when there's nothing to carry.
export function carryUpgrades(cardId, fromLevel, toLevel) {
  const from = state.get(keyOf(cardId, fromLevel)) || ZERO
  if (from.atk === 0 && from.def === 0) return
  const toKey = keyOf(cardId, toLevel)
  const cur = state.get(toKey) || ZERO
  const merged = { atk: Math.max(cur.atk, from.atk), def: Math.max(cur.def, from.def) }
  if (merged.atk === cur.atk && merged.def === cur.def) return
  const m = new Map(state)
  m.set(toKey, merged)
  commit(m)
  pushUpsert(cardId, toLevel, merged)
}

// Bump one stat's upgrade level by 1 for (card_id, card_level). Capped.
export function upgradeStat(cardId, cardLevel, stat /* 'atk' | 'def' */) {
  const k = keyOf(cardId, cardLevel)
  const cur = state.get(k) || ZERO
  const next = (cur[stat] || 0) + 1
  if (next > MAX_UPGRADE_LEVEL) return
  const updated = { ...cur, [stat]: next }
  const m = new Map(state)
  m.set(k, updated)
  commit(m)
  pushUpsert(cardId, cardLevel, updated)
}

// Called after ensureAuth resolves. Safe to call repeatedly.
export function ensureUpgradesLoaded() {
  if (initPromise) return initPromise
  initPromise = isSupabaseConfigured ? bootSupabase() : Promise.resolve()
  return initPromise
}

// ---- internals -----------------------------------------------------

function commit(next) {
  state = next
  persistLocal()
  notify()
}

function notify() { listeners.forEach(fn => fn(state)) }

function persistLocal() {
  try {
    const obj = {}
    for (const [k, v] of state.entries()) obj[k] = v
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch {}
}

function readLocalSeed() {
  // Prefer this store's own key.
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const obj = JSON.parse(raw)
      const m = new Map()
      for (const [k, v] of Object.entries(obj)) {
        if (v && ((v.atk | 0) > 0 || (v.def | 0) > 0)) {
          m.set(k, { atk: v.atk | 0, def: v.def | 0 })
        }
      }
      return m
    }
  } catch {}
  // Legacy: upgrades used to live in pe_crew_v1.upgrades, keyed by card_id
  // only. Lift them to Level-1 entries.
  return readLegacyCrewUpgrades()
}

function readLegacyCrewUpgrades() {
  const m = new Map()
  try {
    const raw = localStorage.getItem(LEGACY_CREW_KEY)
    if (raw) {
      const up = JSON.parse(raw)?.upgrades
      if (up && typeof up === 'object') {
        for (const [id, v] of Object.entries(up)) {
          if (v && ((v.atk | 0) > 0 || (v.def | 0) > 0)) {
            m.set(keyOf(Number(id), 1), { atk: v.atk | 0, def: v.def | 0 })
          }
        }
      }
    }
  } catch {}
  // Capture the lift into our own key right away. crewStore no longer tracks
  // upgrades, so the next crew-slot change rewrites pe_crew_v1 without them —
  // if we waited for the first commit() the lifted data could be lost.
  if (m.size > 0) {
    try {
      const obj = {}
      for (const [k, v] of m.entries()) obj[k] = v
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch {}
  }
  return m
}

async function bootSupabase() {
  await ensureAuth()
  const userId = getUserId()
  if (!userId) return

  const { data, error } = await supabase
    .from('card_upgrades')
    .select('card_id, card_level, atk, def')
    .eq('user_id', userId)
  if (error) {
    console.warn('[upgradesStore] fetch failed, staying local', error)
    return
  }

  const serverMap = new Map()
  for (const row of data || []) {
    if (row.atk > 0 || row.def > 0) {
      serverMap.set(keyOf(row.card_id, row.card_level), { atk: row.atk, def: row.def })
    }
  }

  // Migration: a fresh (empty) server + local upgrades means this player had
  // upgrades before the cloud existed (legacy crewStore blob or a prior local
  // session). Push them up so they survive. Once the server has rows this
  // branch never runs again.
  if (serverMap.size === 0 && state.size > 0) {
    for (const [k, v] of state.entries()) {
      const [id, lvl] = parseKey(k)
      await pushUpsert(id, lvl, v)
      serverMap.set(k, v)
    }
  }

  commit(serverMap)

  // Realtime: apply remote changes to the local cache.
  supabase
    .channel(`card_upgrades:${userId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'card_upgrades',
      filter: `user_id=eq.${userId}`,
    }, payload => {
      const row = payload.new || payload.old
      const merged = new Map(state)
      const k = keyOf(row.card_id, row.card_level)
      if (payload.eventType === 'DELETE' || (payload.new && payload.new.atk === 0 && payload.new.def === 0)) {
        merged.delete(k)
      } else {
        merged.set(k, { atk: payload.new.atk, def: payload.new.def })
      }
      commit(merged)
    })
    .subscribe()
}

// Upsert a single (user_id, card_id, card_level) → {atk,def} row.
async function pushUpsert(cardId, cardLevel, val) {
  if (!isSupabaseConfigured) return
  const userId = getUserId()
  if (!userId) return
  const { error } = await supabase
    .from('card_upgrades')
    .upsert(
      { user_id: userId, card_id: cardId, card_level: cardLevel, atk: val.atk, def: val.def },
      { onConflict: 'user_id,card_id,card_level' }
    )
  if (error) console.warn('[upgradesStore] upsert failed', error)
}
