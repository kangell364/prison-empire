// Daily login bonus — a 7-day streak. Each calendar day you can claim the next
// day's reward; claiming on consecutive days advances the streak, missing a day
// resets it to Day 1. Days 1-6 grant Hustle that scales with player level; Day 7
// is the milestone — a Commissary Pack. After Day 7 the cycle loops to Day 1.
//
// All reward values are intentionally easy to retune (see DAILY_REWARDS +
// the two constants below). localStorage-only — the granted currency/packs flow
// through their own stores (profileStore / packsStore), which handle persistence.
//
// State shape: { streak: 0..7 (last day claimed; 0 = never), lastClaimDate: 'YYYY-MM-DD' }

import { useEffect, useState } from 'react'
import { addHustle } from './profileStore'
import { grantPacks } from './packsStore'

const STORAGE_KEY = 'pe_daily_bonus_v1'

// ---- reward table (tune freely) ------------------------------------
// Days 1-6: Hustle = BASE_HUSTLE * hustleMult * level-scale. Day 7: a pack.
const BASE_HUSTLE  = 2000
const LEVEL_SCALE  = 0.15          // +15% Hustle per player level above 1
export const DAILY_REWARDS = [
  { day: 1, hustleMult: 1 },
  { day: 2, hustleMult: 1.5 },
  { day: 3, hustleMult: 2 },
  { day: 4, hustleMult: 3 },
  { day: 5, hustleMult: 4 },
  { day: 6, hustleMult: 6 },
  { day: 7, packs: 1, milestone: true },
]
export const STREAK_LEN = DAILY_REWARDS.length

// Hustle a given day's multiplier pays out at the player's level.
export function hustleReward(mult, level = 1) {
  return Math.round(BASE_HUSTLE * mult * (1 + LEVEL_SCALE * (Math.max(1, level) - 1)))
}

// ---- date helpers (local calendar day) -----------------------------
function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayStr() { return dateStr(new Date()) }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d) }

// ---- state ----------------------------------------------------------
let state = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { streak: Math.max(0, Math.min(STREAK_LEN, p.streak | 0)), lastClaimDate: p.lastClaimDate || null }
    }
  } catch {}
  return { streak: 0, lastClaimDate: null }
}

function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

// ---- status ---------------------------------------------------------
// Derives everything the UI needs from the saved state + today's date:
//   claimable          — is a reward available to claim right now?
//   pendingDay         — the day (1..7) that will be claimed next (null if none)
//   claimedThisCycle   — days already claimed in the current run (for checkmarks)
//   streak             — raw saved streak
export function getDailyStatus() {
  const today = todayStr()
  const claimable = state.lastClaimDate !== today
  if (!claimable) {
    return { claimable: false, pendingDay: null, claimedThisCycle: state.streak, streak: state.streak }
  }
  // Continuing only if yesterday was claimed and the streak isn't already complete.
  const continuing = state.lastClaimDate === yesterdayStr() && state.streak > 0 && state.streak < STREAK_LEN
  const claimedThisCycle = continuing ? state.streak : 0
  return { claimable: true, pendingDay: claimedThisCycle + 1, claimedThisCycle, streak: state.streak }
}

// Claim the pending day's reward at the given player level. Returns a descriptor
// { day, hustle?, packs?, milestone? } for the UI to celebrate, or null if
// nothing is claimable (already claimed today).
export function claimDaily(level = 1) {
  const { claimable, pendingDay } = getDailyStatus()
  if (!claimable) return null
  const reward = DAILY_REWARDS[pendingDay - 1]
  const out = { day: pendingDay, milestone: !!reward.milestone }
  if (reward.hustleMult) { out.hustle = hustleReward(reward.hustleMult, level); addHustle(out.hustle) }
  if (reward.packs)      { out.packs = reward.packs; grantPacks(reward.packs) }
  commit({ streak: pendingDay, lastClaimDate: todayStr() })
  return out
}

export function getDailyBonus() { return state }

export function useDailyBonus() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}
