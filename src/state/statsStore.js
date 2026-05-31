// Stats store — the player's PERSISTED trait allocations and the single source
// of truth for their live combat/pool stats. Replaces the old throwaway local
// state in Profile.jsx (which reset on every refresh and fed nothing).
//
// What it holds: `spent`, the number of trait points the player has poured into
// each of the five traits. Everything else is derived:
//   * available points = totalPointsEarned(level) − Σ spent   (level from
//     progressionStore, so points are GRANTED implicitly as you level — no
//     write needed on level-up, and the two stores don't cycle)
//   * real ATK/DEF/HP + pool maxes = statsFromTraits(spent)   (see traitMath)
//
// Combat reads the player's REAL traits here; bosses/PvP opponents scale against
// the expected (balanced) spend in traitMath. localStorage-only for now; joins
// the Supabase migration with the rest of player state.

import { useEffect, useState } from 'react'
import {
  TRAIT_IDS, statsFromTraits, totalPointsEarned, pointsForLevel,
} from '../data/traitMath'
import { getProgress, useProgress } from './progressionStore'

const KEY = 'pe_stats_v1'

// First-run seed: spread all-but-the-latest-level's points evenly so the player
// starts at-curve (no balance regression vs the old level curve), with the most
// recent level's grant left UNSPENT so there's always something to allocate.
function seedSpent(level) {
  const total   = totalPointsEarned(level)
  const reserve = pointsForLevel(level)
  const per     = Math.max(0, Math.floor((total - reserve) / TRAIT_IDS.length))
  const out = {}
  TRAIT_IDS.forEach(id => { out[id] = per })
  return out
}

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      const spent = {}
      TRAIT_IDS.forEach(id => { spent[id] = Math.max(0, Math.round(p.spent?.[id] || 0)) })
      return { spent }
    }
  } catch {}
  return { spent: seedSpent(getProgress().level) }
}

let state = readInitial()
const listeners = new Set()

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }
function commit(patch) {
  state = { ...state, ...patch }
  persist()
  listeners.forEach(fn => fn(state))
}

// ---- derived -------------------------------------------------------

function sumSpent(spent) { return TRAIT_IDS.reduce((n, id) => n + (spent[id] || 0), 0) }

// Points still in the bank = everything earned for the current level minus what
// you've already poured in. Grows as you level; never goes negative (level only
// rises, and we never seed over the earned total).
export function availablePoints(level = getProgress().level) {
  return Math.max(0, totalPointsEarned(level) - sumSpent(state.spent))
}

// ---- reads ---------------------------------------------------------

export function getTraits() { return { ...state.spent } }
export function getPlayerStats() { return statsFromTraits(state.spent) }

export function getHealthMax()    { return statsFromTraits(state.spent).hp }
export function getStaminaMax()   { return statsFromTraits(state.spent).staminaMax }
export function getKnowledgeMax() { return statsFromTraits(state.spent).knowledgeMax }

// Player combat block — REAL atk/def/hp from the player's own spend, plus their
// level. (Moved here from progressionStore so combat reads live traits; the
// store boundary also keeps statsStore↔progressionStore one-directional.)
export function getPlayerCombat() {
  const s = statsFromTraits(state.spent)
  return { level: getProgress().level, atk: s.atk, def: s.def, hp: s.hp }
}

// ---- hooks (react to BOTH trait spend and level) -------------------

function useStats() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}

export function useTraits() { useStats(); return { ...state.spent } }

export function useAvailablePoints() {
  const prog = useProgress()       // re-render on level-up
  useStats()                       // re-render on allocate
  return Math.max(0, totalPointsEarned(prog.level) - sumSpent(state.spent))
}

export function usePlayerStats() { const s = useStats(); return statsFromTraits(s.spent) }

export function usePlayerCombat() {
  const prog = useProgress()
  const s = useStats()
  const st = statsFromTraits(s.spent)
  return { level: prog.level, atk: st.atk, def: st.def, hp: st.hp }
}

// ---- writes --------------------------------------------------------

// Spend `n` points into a trait. Clamped to what's actually available, so the
// UI can call it freely. Returns the number actually allocated.
export function allocate(traitId, n = 1) {
  if (!TRAIT_IDS.includes(traitId)) return 0
  const avail = availablePoints()
  const add = Math.max(0, Math.min(n, avail))
  if (add <= 0) return 0
  commit({ spent: { ...state.spent, [traitId]: (state.spent[traitId] || 0) + add } })
  return add
}

// DEV: refund every point back into the bank (respec). Useful for testing
// builds and pairs with resetProgression.
export function respec() {
  const cleared = {}
  TRAIT_IDS.forEach(id => { cleared[id] = 0 })
  commit({ spent: cleared })
}
