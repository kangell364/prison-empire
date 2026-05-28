// Cards store — counts + levels with stacking and merging.
//
// Internal state shape: Map<"cardId:cardLevel", count>
//   e.g. "2:1" → 47 means "47 copies of Big T at Level 1"
//
// UI conventions (in the views that read this store):
//   - One full "stack" = 20 cards. 47 = "2 full + 7 left".
//   - MERGE button visible when count >= 20.
//   - Merge consumes 20 from (id, level) and adds 1 to (id, level + 1).
//
// Two backends (mirrors profileStore / Phase 1 pattern):
//   - Supabase: rows in public.card_collection.
//   - localStorage fallback: pe_card_collection_v1 (JSON).
//
// The static CARDS_COLLECTION in gameData.js is catalog-only — names,
// art, base stats, rarity. Everything player-specific lives here.

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../supabase'
import { ensureAuth, getUserId } from './profileStore'
import { STARTER_CARD_IDS } from '../data/gameData'

const STORAGE_KEY    = 'pe_card_collection_v1'
const MERGE_COST     = 20    // cards consumed per merge
export const STACK_SIZE = 20 // one "stack" for UI display purposes

let state = readLocalSeed()      // Map<"id:level", count>
const listeners = new Set()
let initPromise = null

// ---- helpers -------------------------------------------------------

function keyOf(id, level)  { return `${id}:${level}` }
function parseKey(k)       { const [a, b] = k.split(':'); return [Number(a), Number(b)] }

// ---- public API ----------------------------------------------------

export function getCardCounts() { return state }

export function getCount(cardId, cardLevel = 1) {
  return state.get(keyOf(cardId, cardLevel)) || 0
}

// True if the player has at least one card of this id at any level.
// Used by Crew picker etc. — "is this character unlocked".
export function isCardOwned(cardId) {
  for (const k of state.keys()) {
    const [id] = parseKey(k)
    if (id === cardId && (state.get(k) || 0) > 0) return true
  }
  return false
}

// Owned (id, level) tuples sorted by id asc, level desc. Useful for
// rendering "all my cards" lists that include level 2+ variants.
export function getOwnedTuples() {
  const out = []
  for (const [k, count] of state.entries()) {
    if (count > 0) {
      const [id, level] = parseKey(k)
      out.push({ id, level, count })
    }
  }
  out.sort((a, b) => a.id - b.id || b.level - a.level)
  return out
}

export function useCardCounts() {
  const [s, setS] = useState(state)
  useEffect(() => {
    listeners.add(setS)
    return () => listeners.delete(setS)
  }, [])
  return s
}

// Add a card to the collection. Idempotent w.r.t. server (the upsert
// merges counts). Returns the new count.
export function addCard(cardId, cardLevel = 1, qty = 1) {
  const k = keyOf(cardId, cardLevel)
  const next = new Map(state)
  const newCount = (next.get(k) || 0) + qty
  next.set(k, newCount)
  commit(next)
  pushUpsert(cardId, cardLevel, newCount)
  return newCount
}

// Bulk add — single notify, batch the server write.
export function addCards(cardIds, cardLevel = 1) {
  if (cardIds.length === 0) return
  const next = new Map(state)
  const touched = new Map()    // id → newCount, for the server batch
  for (const id of cardIds) {
    const k = keyOf(id, cardLevel)
    const newCount = (next.get(k) || 0) + 1
    next.set(k, newCount)
    touched.set(id, newCount)
  }
  commit(next)
  for (const [id, newCount] of touched.entries()) {
    pushUpsert(id, cardLevel, newCount)
  }
}

// Merge: consume MERGE_COST from (id, level), add 1 to (id, level+1).
// No-op if count < MERGE_COST. Returns the new (level+1) count or null.
export function mergeCard(cardId, cardLevel) {
  const fromKey = keyOf(cardId, cardLevel)
  const fromCount = state.get(fromKey) || 0
  if (fromCount < MERGE_COST) return null

  const toLevel = cardLevel + 1
  const toKey = keyOf(cardId, toLevel)
  const next = new Map(state)
  next.set(fromKey, fromCount - MERGE_COST)
  const newToCount = (next.get(toKey) || 0) + 1
  next.set(toKey, newToCount)
  commit(next)

  pushUpsert(cardId, cardLevel, fromCount - MERGE_COST)
  pushUpsert(cardId, toLevel, newToCount)
  return newToCount
}

// Called after ensureAuth resolves. Safe to call repeatedly.
export function ensureCardsLoaded() {
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
    const obj = Object.fromEntries(state)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch {}
}

function readLocalSeed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const obj = JSON.parse(raw)
      const m = new Map()
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'number' && v > 0) m.set(k, v)
      }
      return m
    }
  } catch {}
  // First-run seed: one of each starter at level 1.
  const m = new Map()
  STARTER_CARD_IDS.forEach(id => m.set(keyOf(id, 1), 1))
  return m
}

async function bootSupabase() {
  await ensureAuth()
  const userId = getUserId()
  if (!userId) return

  const { data, error } = await supabase
    .from('card_collection')
    .select('card_id, card_level, count')
    .eq('user_id', userId)
  if (error) {
    console.warn('[cardsStore] fetch failed, staying local', error)
    return
  }

  const next = new Map()
  for (const row of data || []) {
    if (row.count > 0) next.set(keyOf(row.card_id, row.card_level), row.count)
  }
  // If the server has nothing (rare — trigger should have populated), fall
  // back to starter seed so the UI isn't empty.
  if (next.size === 0) {
    STARTER_CARD_IDS.forEach(id => next.set(keyOf(id, 1), 1))
  }
  commit(next)

  // Realtime: apply remote changes to the local cache.
  supabase
    .channel(`card_collection:${userId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'card_collection',
      filter: `user_id=eq.${userId}`,
    }, payload => {
      const row = payload.new || payload.old
      const merged = new Map(state)
      const k = keyOf(row.card_id, row.card_level)
      if (payload.eventType === 'DELETE' || (payload.new && payload.new.count === 0)) {
        merged.delete(k)
      } else {
        merged.set(k, payload.new.count)
      }
      commit(merged)
    })
    .subscribe()
}

// Upsert a single (user_id, card_id, card_level) → count row.
async function pushUpsert(cardId, cardLevel, count) {
  if (!isSupabaseConfigured) return
  const userId = getUserId()
  if (!userId) return
  // count=0 means we'd rather delete the row entirely
  if (count <= 0) {
    const { error } = await supabase
      .from('card_collection')
      .delete()
      .match({ user_id: userId, card_id: cardId, card_level: cardLevel })
    if (error) console.warn('[cardsStore] delete failed', error)
    return
  }
  const { error } = await supabase
    .from('card_collection')
    .upsert(
      { user_id: userId, card_id: cardId, card_level: cardLevel, count },
      { onConflict: 'user_id,card_id,card_level' }
    )
  if (error) console.warn('[cardsStore] upsert failed', error)
}
