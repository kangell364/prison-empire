// Skill cards store — counts + levels with stacking and merging, mirroring the
// player-card cardsStore but for SKILL cards (string ids like 'skull_crusher').
//
// Player cards live in cardsStore, which assumes NUMERIC ids (and an integer
// Supabase column). Skill ids are strings, so they get their own parallel
// store rather than polluting that one. localStorage-only for now; joins the
// Supabase migration with the rest of the card data later.
//
// Internal state shape: Map<"skillId:level", count>
//   e.g. "skull_crusher:1" → 25
// UI conventions (same as player cards):
//   - One full stack = SKILL_STACK_SIZE (20). MERGE shows at count >= 20.
//   - Merge consumes 20 from (id, level) and adds 1 at (id, level + 1).

import { useEffect, useState } from 'react'
import { SKILLS } from '../data/gameData'

const STORAGE_KEY       = 'pe_skill_cards_v1'
const MERGE_COST        = 20
export const SKILL_STACK_SIZE = 20

// First-run seed: one copy of each defined skill at Level 1 — exactly like the
// player-card starter seed (CARDS:1). Stacking/merge work the same way; getting
// more copies to merge needs a drop/pack source (follow-up).
const SEED_COUNT = 1

// Level part is after the LAST colon, so string ids with no colon are safe.
function keyOf(id, level) { return `${id}:${level}` }
function parseKey(k) { const i = k.lastIndexOf(':'); return [k.slice(0, i), Number(k.slice(i + 1))] }

let state = readLocalSeed()
const listeners = new Set()

// ---- public API ----------------------------------------------------

export function getSkillCardCounts() { return state }

export function getSkillCount(skillId, level = 1) {
  return state.get(keyOf(skillId, level)) || 0
}

export function isSkillCardOwned(skillId) {
  for (const k of state.keys()) {
    const [id] = parseKey(k)
    if (id === skillId && (state.get(k) || 0) > 0) return true
  }
  return false
}

// Owned (id, level) tuples, sorted by id then level desc.
export function getOwnedSkillTuples() {
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

export function useSkillCardCounts() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}

export function addSkillCard(skillId, level = 1, qty = 1) {
  const k = keyOf(skillId, level)
  const next = new Map(state)
  next.set(k, (next.get(k) || 0) + qty)
  commit(next)
}

// Merge: consume MERGE_COST from (id, level), add 1 at (id, level+1).
// No-op if count < MERGE_COST. Returns the new (level+1) count or null.
export function mergeSkillCard(skillId, level) {
  const fromKey = keyOf(skillId, level)
  const fromCount = state.get(fromKey) || 0
  if (fromCount < MERGE_COST) return null
  const toKey = keyOf(skillId, level + 1)
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

function readLocalSeed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const obj = JSON.parse(raw)
      const m = new Map()
      for (const [k, v] of Object.entries(obj)) if (typeof v === 'number' && v > 0) m.set(k, v)
      return m
    }
  } catch {}
  const m = new Map()
  SKILLS.forEach(s => m.set(keyOf(s.id, 1), SEED_COUNT))
  return m
}
