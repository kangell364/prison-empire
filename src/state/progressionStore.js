// Progression store — the player's PvE campaign state. Single source of truth
// for: player LEVEL + XP, each tab's current WAVE, which bosses are DEFEATED,
// and every boss's PERSISTENT remaining HP.
//
// Two rules drive the whole design:
//   1. Bosses never heal. Damage you deal is saved here, so a boss has the same
//      HP when you come back. Any boss falls if you wear it down — difficulty is
//      "how much HP to grind", not win/lose.
//   2. Clearing all 30 bosses (3 tabs × 10) at your level = exactly one level
//      (xpForLevel). So player level tracks wave level and fights stay close.
//
// Player combat stats (atk/def/hp) are DERIVED from level on the same curve the
// bosses scale against (see bossLadder). localStorage-only for now; joins the
// Supabase migration with the rest of player state later.

import { useEffect, useState } from 'react'
import {
  SLOTS_PER_WAVE, xpForLevel, generateWave,
} from '../data/bossLadder'
import { addHustle } from './profileStore'

const KEY = 'pe_progression_v1'

const DEFAULTS = {
  level: 1,
  xp: 0,                                            // xp banked toward the next level
  waves:    { guards: 1, yard: 1, kitchen: 1 },     // current (uncleared) wave per tab = boss level
  defeated: { guards: [], yard: [], kitchen: [] },  // slots cleared in the CURRENT wave
  bossHp:   {},                                     // { [bossId]: remaining HP } — persistent damage
  rivalXp:  {},                                     // { [opponentId]: XP they've taken off you in PvP }
}

let state = readInitial()
const listeners = new Set()

// ---- persistence ---------------------------------------------------

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        ...DEFAULTS, ...p,
        waves:    { ...DEFAULTS.waves,    ...(p.waves    || {}) },
        defeated: { ...DEFAULTS.defeated, ...(p.defeated || {}) },
        bossHp:   { ...(p.bossHp || {}) },
        rivalXp:  { ...(p.rivalXp || {}) },
      }
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULTS))
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }

function commit(patch) {
  state = { ...state, ...patch }
  persist()
  listeners.forEach(fn => fn(state))
}

// ---- reads ---------------------------------------------------------

export function getProgress() { return state }

export function useProgress() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}

// Player combat stats now live in statsStore (derived from the player's real
// trait spend, not a level curve). Import { usePlayerCombat } from statsStore.

export function xpForNext()      { return xpForLevel(state.level) }
export function useXpForNext()   { const s = useProgress(); return xpForLevel(s.level) }

export function currentWave(tab)         { return state.waves[tab] || 1 }
export function isDefeated(tab, slot)    { return (state.defeated[tab] || []).includes(slot) }

// Remaining HP for a boss — the persisted value, or its full HP if untouched.
export function bossRemainingHp(boss)    { return state.bossHp[boss.id] ?? boss.hp }

// The live wave of 10 bosses for a tab (generated for its current level).
export function getWave(tab) { return generateWave(tab, currentWave(tab)) }

// ---- writes --------------------------------------------------------

// Apply `dealt` damage to a boss. Persists the new HP. If it drops the boss to
// 0, applies the defeat side-effects exactly once (XP + Hustle + level-ups +
// wave advance). Returns { remaining, justDefeated }.
export function recordHit(boss, dealt) {
  if (isDefeated(boss.tab, boss.slot)) return { remaining: 0, justDefeated: false }
  const cur = state.bossHp[boss.id] ?? boss.hp
  const remaining = Math.max(0, cur - Math.max(0, Math.round(dealt)))
  if (remaining > 0) {
    commit({ bossHp: { ...state.bossHp, [boss.id]: remaining } })
    return { remaining, justDefeated: false }
  }
  applyDefeat(boss)
  return { remaining: 0, justDefeated: true }
}

// Bank raw XP from any source (PvP attacks, etc.). Positive rolls up however
// many levels it covers. Negative (a lost attack) chips XP but NEVER de-levels —
// it floors at the start of the current level. Returns levels gained (0 on loss).
export function addXp(amount) {
  const delta = Math.round(amount)
  if (!delta) return 0
  let xp = state.xp + delta
  let level = state.level
  const before = level
  if (delta > 0) {
    while (xp >= xpForLevel(level)) { xp -= xpForLevel(level); level++ }
  } else if (xp < 0) {
    xp = 0
  }
  commit({ xp, level })
  return level - before
}

// Credit a PvP rival with XP they took off you on a lost turn (persisted per id).
export function creditRival(oppId, amount) {
  const gain = Math.round(amount || 0)
  if (!oppId || !gain) return
  commit({ rivalXp: { ...state.rivalXp, [oppId]: (state.rivalXp[oppId] || 0) + gain } })
}
export function getRivalXp(oppId) { return state.rivalXp[oppId] || 0 }

// Reclaim everything a rival banked off you — call when you KO them. Zeroes
// their debt and returns the amount so the caller can hand it back as XP.
export function reclaimRival(oppId) {
  const amt = state.rivalXp[oppId] || 0
  if (!amt) return 0
  const next = { ...state.rivalXp }
  delete next[oppId]
  commit({ rivalXp: next })
  return amt
}

function applyDefeat(boss) {
  const tab = boss.tab
  const slots = isDefeated(tab, boss.slot)
    ? state.defeated[tab]
    : [...(state.defeated[tab] || []), boss.slot]

  // Bank XP and roll up however many levels it covers.
  let xp = state.xp + boss.xp
  let level = state.level
  while (xp >= xpForLevel(level)) { xp -= xpForLevel(level); level++ }

  // Drop this boss's HP entry.
  const bossHp = { ...state.bossHp }
  delete bossHp[boss.id]

  let waves = state.waves
  let defeated = { ...state.defeated, [tab]: slots }

  // Whole wave cleared → advance the tab a level, reset its defeated list, and
  // sweep any lingering HP entries from the wave we just finished.
  if (slots.length >= SLOTS_PER_WAVE) {
    waves = { ...waves, [tab]: (waves[tab] || 1) + 1 }
    defeated = { ...defeated, [tab]: [] }
    const prefix = `${tab}-${state.waves[tab]}-`
    for (const id of Object.keys(bossHp)) if (id.startsWith(prefix)) delete bossHp[id]
  }

  commit({ xp, level, waves, defeated, bossHp })
  if (boss.hustle) addHustle(boss.hustle)
  // TODO: milestone card drop — grant boss.cardDrop into the card inventory once
  // that system exposes a grant API. For now rewards are XP + Hustle (+ level).
}

// DEV: wipe all campaign progress (used by a dev reset button).
export function resetProgression() {
  commit(JSON.parse(JSON.stringify(DEFAULTS)))
}
