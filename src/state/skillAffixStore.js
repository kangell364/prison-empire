// Skill affix store — Phase 3 of the Jailhouse Affix system (docs/skill-cards-spec.md).
//
// Tracks the RANDOM bonus affixes rolled onto each skill-card tile, the re-roll
// token balance, and the burn-for-tokens economy. Model A: a Lvl 1 card has only
// its fixed signature (no bonus); each MERGE rolls a bonus from the pool, up to a
// cap of 3 total skills (signature + 2 bonus). Affixes are keyed per
// (skillId, cardLevel) tile — fungible with the stacking store, so we don't have
// to rebuild the count-based inventory as unique instances.
//
// State: { affixes: { "skillId:level": affixId[] }, tokens: number }

import { useEffect, useState } from 'react'
import { SKILL_AFFIXES, AFFIX_ROLL_WEIGHTS, affixById } from '../data/skillAffixes'
import { removeSkillCard, getSkillCount } from './skillCardsStore'
import { getProgress } from './progressionStore'
import { addHustle } from './profileStore'

const KEY = 'pe_skill_affixes_v1'

// Burn refund (spec §7): hustleRefund = BASE × cardLevel × (1 + playerLevel × K).
// Tunable — BASE is pegged loosely to a few fights' Hustle so it never goes stale.
export const BURN_BASE_HUSTLE = 150
export const BURN_LEVEL_K     = 0.04
export const MAX_BONUS_AFFIXES = 2   // signature + 2 bonus = the hard cap of 3

let state = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const o = JSON.parse(raw)
      return { affixes: o.affixes && typeof o.affixes === 'object' ? o.affixes : {}, tokens: o.tokens | 0 }
    }
  } catch {}
  return { affixes: {}, tokens: 0 }
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

const tileKey = (id, level) => `${id}:${level}`

// How many BONUS affix slots a card level has: Lvl1→0, Lvl2→1, Lvl3+→2 (cap).
export function bonusSlotsForLevel(level) {
  return Math.min(Math.max(0, level - 1), MAX_BONUS_AFFIXES)
}

// ---- rolling -------------------------------------------------------

function rollRarity(rng) {
  const entries = Object.entries(AFFIX_ROLL_WEIGHTS)
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [rarity, w] of entries) { if ((r -= w) < 0) return rarity }
  return 'common'
}

// One rarity-weighted affix id, avoiding any in `exclude`.
function rollAffixId(rng, exclude) {
  for (let i = 0; i < 8; i++) {
    const rarity = rollRarity(rng)
    const pool = SKILL_AFFIXES.filter(a => a.rarity === rarity && !exclude.has(a.id))
    if (pool.length) return pool[Math.floor(rng() * pool.length)].id
  }
  const any = SKILL_AFFIXES.filter(a => !exclude.has(a.id))
  return any.length ? any[Math.floor(rng() * any.length)].id : null
}

// ---- public API ----------------------------------------------------

export function getTileAffixIds(skillId, level) { return state.affixes[tileKey(skillId, level)] || [] }
export function getTileAffixes(skillId, level)   { return getTileAffixIds(skillId, level).map(affixById).filter(Boolean) }

function setTileAffixes(skillId, level, ids) {
  const next = { ...state, affixes: { ...state.affixes, [tileKey(skillId, level)]: ids } }
  commit(next)
}

// Called from the merge flow. Ensures the (skillId, toLevel) tile has its full
// bonus set: carries the lower tile's bonuses on the first merge to this level,
// then rolls the rest. No-ops if the tile is already established (so merging more
// copies never re-rolls a tile you've already built).
export function onMergeRollAffixes(skillId, fromLevel, toLevel, rng = Math.random) {
  const want = bonusSlotsForLevel(toLevel)
  let cur = getTileAffixIds(skillId, toLevel).slice()
  if (cur.length >= want) return cur
  if (cur.length === 0) cur = getTileAffixIds(skillId, fromLevel).slice(0, want)  // carry up
  const exclude = new Set(cur)
  while (cur.length < want) {
    const id = rollAffixId(rng, exclude)
    if (!id) break
    cur.push(id); exclude.add(id)
  }
  setTileAffixes(skillId, toLevel, cur)
  return cur
}

// Spend a re-roll token to re-roll ONE bonus affix on a tile (avoiding the other
// affixes already on it). Returns the new affix def, or null if no token / bad slot.
export function rerollAffix(skillId, level, index, rng = Math.random) {
  if (state.tokens <= 0) return null
  const cur = getTileAffixIds(skillId, level).slice()
  if (index < 0 || index >= cur.length) return null
  const exclude = new Set(cur.filter((_, i) => i !== index))
  const id = rollAffixId(rng, exclude)
  if (!id) return null
  cur[index] = id
  const next = { ...state, tokens: state.tokens - 1, affixes: { ...state.affixes, [tileKey(skillId, level)]: cur } }
  commit(next)
  return affixById(id)
}

// ---- tokens --------------------------------------------------------

export function getReRollTokens() { return state.tokens }
export function addReRollTokens(n) { commit({ ...state, tokens: Math.max(0, state.tokens + n) }) }
export function useReRollTokens() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s.tokens
}

// ---- burn ----------------------------------------------------------

// Burn one copy of a (skillId, level) card → grant 1 re-roll token + a Hustle
// refund scaled by card level AND player level (spec §7). If it was the last copy
// at that level, the tile's rolled affixes are cleared. Returns { hustle, token }
// or null if you own none.
export function burnSkillCard(skillId, level) {
  const removed = removeSkillCard(skillId, level, 1)
  if (removed <= 0) return null
  const playerLevel = getProgress().level || 1
  const hustle = Math.round(BURN_BASE_HUSTLE * level * (1 + playerLevel * BURN_LEVEL_K))
  addHustle(hustle)

  const nextAffixes = { ...state.affixes }
  // Only clear the tile's affixes if no copies remain at this level.
  if ((getSkillCount(skillId, level) || 0) <= 0) delete nextAffixes[tileKey(skillId, level)]
  commit({ ...state, tokens: state.tokens + 1, affixes: nextAffixes })
  return { hustle, token: 1 }
}

// ---- reactive hook -------------------------------------------------

export function useSkillAffixes() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}
