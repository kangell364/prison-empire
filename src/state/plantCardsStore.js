// Plant cards store — counts + levels with stacking and merging, mirroring the
// skill-cards skillCardsStore but for GROW (plant) cards.
//
// Plant ids are strings (e.g. 'plant_og_kush'), like skill ids, so they get
// their own parallel store rather than the numeric-id player cardsStore.
// localStorage-only for now; joins the Supabase migration with the rest of the
// card data later.
//
// Internal state shape: Map<"plantId:level", count>
//   e.g. "plant_og_kush:1" → 25
// UI conventions (same as skill cards):
//   - One full stack = PLANT_STACK_SIZE (20). MERGE shows at count >= 20.
//   - Merge consumes 20 from (id, level) and adds 1 at (id, level + 1).

import { useEffect, useState } from 'react'
import { PLANTS } from '../data/gameData'

const STORAGE_KEY       = 'pe_plant_cards_v1'
// Tracks which STARTER plants have already been backfilled to this player, so
// returning players (whose store predates a starter strain) get it once —
// without re-granting forever if they later spend/merge all their copies.
const BACKFILL_KEY      = 'pe_plant_cards_backfilled'
const MERGE_COST        = 20
export const PLANT_STACK_SIZE = 20

// First-run seed: one copy of each defined plant at Level 1 — exactly like the
// skill-card starter seed (CARDS:1). Getting more copies to merge needs a
// drop/pack source (follow-up).
const SEED_COUNT = 1

// Level part is after the LAST colon, so string ids with no colon are safe.
function keyOf(id, level) { return `${id}:${level}` }
function parseKey(k) { const i = k.lastIndexOf(':'); return [k.slice(0, i), Number(k.slice(i + 1))] }

let state = readLocalSeed()
const listeners = new Set()

// ---- public API ----------------------------------------------------

export function getPlantCardCounts() { return state }

export function getPlantCount(plantId, level = 1) {
  return state.get(keyOf(plantId, level)) || 0
}

export function isPlantCardOwned(plantId) {
  for (const k of state.keys()) {
    const [id] = parseKey(k)
    if (id === plantId && (state.get(k) || 0) > 0) return true
  }
  return false
}

// Owned (id, level) tuples, sorted by id then level desc.
export function getOwnedPlantTuples() {
  const out = []
  for (const [k, count] of state.entries()) {
    if (count > 0) {
      const [id, level] = parseKey(k)
      out.push({ id, level, count })
    }
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : b.level - a.level))
  return out
}

export function usePlantCardCounts() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}

export function addPlantCard(plantId, level = 1, qty = 1) {
  const k = keyOf(plantId, level)
  const next = new Map(state)
  next.set(k, (next.get(k) || 0) + qty)
  commit(next)
}

// Merge: consume MERGE_COST from (id, level), add 1 at (id, level+1).
// No-op if count < MERGE_COST. Returns the new (level+1) count or null.
export function mergePlantCard(plantId, level) {
  const fromKey = keyOf(plantId, level)
  const fromCount = state.get(fromKey) || 0
  if (fromCount < MERGE_COST) return null
  const toKey = keyOf(plantId, level + 1)
  const next = new Map(state)
  next.set(fromKey, fromCount - MERGE_COST)
  const newToCount = (next.get(toKey) || 0) + 1
  next.set(toKey, newToCount)
  commit(next)
  return newToCount
}

// ---- internals -----------------------------------------------------

function commit(next) {
  state = next
  persistLocal()
  listeners.forEach(fn => fn(state))
}

function persistLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(state))) } catch {}
}

function ownsAny(m, plantId) {
  for (const [k, v] of m.entries()) {
    if (v > 0 && parseKey(k)[0] === plantId) return true
  }
  return false
}

// One-time backfill for EXISTING players. New players get every plant via the
// fresh-store seed below; players whose store predates a new starter strain
// (e.g. PURPLE HAZE was renamed/added after they first played) get it granted
// here once. Guarded per-id by BACKFILL_KEY so spending all copies later does
// not re-trigger it. Mutates `m` and persists when it grants anything.
function backfillStarters(m) {
  let done
  try { done = new Set(JSON.parse(localStorage.getItem(BACKFILL_KEY) || '[]')) } catch { done = new Set() }
  let changed = false
  PLANTS.filter(p => p.starter).forEach(p => {
    if (done.has(p.id)) return
    if (!ownsAny(m, p.id)) {
      const k = keyOf(p.id, 1)
      m.set(k, (m.get(k) || 0) + SEED_COUNT)
      changed = true
    }
    done.add(p.id)
  })
  try { localStorage.setItem(BACKFILL_KEY, JSON.stringify([...done])) } catch {}
  if (changed) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(m))) } catch {}
  }
}

function readLocalSeed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const obj = JSON.parse(raw)
      const validIds = new Set(PLANTS.map(p => p.id))
      const m = new Map()
      let pruned = false
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v !== 'number' || v <= 0) continue
        // Drop counts for plant ids no longer in the catalog (e.g. a renamed
        // or retired strain) so they don't haunt the owned/locked totals.
        if (!validIds.has(parseKey(k)[0])) { pruned = true; continue }
        m.set(k, v)
      }
      backfillStarters(m)
      if (pruned) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(m))) } catch {} }
      return m
    }
  } catch {}
  // Fresh store — seed one of every plant. Mark all starters as backfilled so
  // the existing-player path above never double-grants to a brand-new player.
  const m = new Map()
  PLANTS.forEach(p => m.set(keyOf(p.id, 1), SEED_COUNT))
  try { localStorage.setItem(BACKFILL_KEY, JSON.stringify(PLANTS.filter(p => p.starter).map(p => p.id))) } catch {}
  return m
}
