// Territories store — who holds each facility, and its loyalty (capture HP).
//
// Model (genre playbook: control points + wear-down capture):
//   - One record per facility id: { owner, loyalty, loyaltyAt, lastCollectedAt }.
//   - owner: 'you' | <AI gang name> | null (vacant).
//   - loyalty 0–100 = how hard it is to flip. A drive-by landing chips it
//     (HIT_DAMAGE); it REGENERATES over time so a neglected siege heals.
//     At 0 the facility flips to the attacker and loyalty resets to FLIP_LOYALTY.
//   - Owned facilities accrue Hustle/Steel per hour (by tier); the player taps
//     Collect to bank it (capped so it's "check in", not "leave forever").
//
// localStorage-only for now; moves to Supabase (captured_territories) in Phase 4.

import { useEffect, useState } from 'react'
import { FACILITIES, FACILITY_TIERS, AI_GANGS, PLAYER_HOME_FACILITY_ID } from '../data/gameData'
import { addHustle, addSteel, spendSteel } from './profileStore'

const KEY            = 'pe_territories_v1'
export const LOYALTY_MAX   = 100
export const HIT_DAMAGE    = 25          // loyalty removed per drive-by landing
export const FLIP_LOYALTY  = 50          // loyalty a facility starts at after flipping
export const REINFORCE_AMOUNT = 30       // defense restored per reinforce
const REGEN_PER_HR   = 5                 // loyalty healed per hour while held
const INCOME_CAP_HRS = 24                // max hours of income that accrue uncollected

const FACILITY_BY_ID = new Map(FACILITIES.map(f => [f.id, f]))

let state = readInitial()
const listeners = new Set()

// ---- seeding -------------------------------------------------------

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

function seed() {
  const now = Date.now()
  const out = {}
  FACILITIES.forEach(f => {
    if (f.id === PLAYER_HOME_FACILITY_ID) {
      out[f.id] = { owner: 'you', loyalty: LOYALTY_MAX, loyaltyAt: now, lastCollectedAt: now }
      return
    }
    const h = hash(f.id)
    // ~30% vacant, the rest held by a deterministic AI gang.
    const owner = (h % 100) < 30 ? null : AI_GANGS[h % AI_GANGS.length]
    out[f.id] = {
      owner,
      loyalty: owner ? LOYALTY_MAX : 0,
      loyaltyAt: now,
      lastCollectedAt: now,
    }
  })
  return out
}

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Merge in any facilities added to the catalog since last save.
      const base = seed()
      return { ...base, ...parsed }
    }
  } catch {}
  return seed()
}

// ---- helpers -------------------------------------------------------

function hoursSince(ts) { return Math.max(0, (Date.now() - ts) / 3_600_000) }

// Loyalty with regen applied (held facilities slowly heal). Vacant = 0.
export function effectiveLoyalty(rec) {
  if (!rec || !rec.owner) return 0
  return Math.min(LOYALTY_MAX, Math.round(rec.loyalty + REGEN_PER_HR * hoursSince(rec.loyaltyAt)))
}

export function tierIncome(tier) {
  return FACILITY_TIERS[tier] || FACILITY_TIERS[1]
}

const TIER_POWER = { 1: 150, 2: 350, 3: 700, 4: 1500 }
// Deterministic "gang strength" of a facility's holder — a flavor/threat read
// for the scout screen. Capture is loyalty-based (not power-gated) in this
// build, so this informs the player without blocking them.
export function holderPower(facilityId) {
  const fac = FACILITY_BY_ID.get(facilityId)
  if (!fac) return 0
  const base = TIER_POWER[fac.tier] || 150
  return Math.round(base * (0.85 + (hash(facilityId) % 30) / 100))
}

// Pending uncollected income for a facility you hold (capped).
export function pendingIncome(facilityId) {
  const rec = state[facilityId]
  const fac = FACILITY_BY_ID.get(facilityId)
  if (!rec || rec.owner !== 'you' || !fac) return { hustle: 0, steel: 0 }
  const hrs = Math.min(INCOME_CAP_HRS, hoursSince(rec.lastCollectedAt))
  const { hustlePerHr, steelPerHr } = tierIncome(fac.tier)
  return { hustle: Math.floor(hustlePerHr * hrs), steel: Math.floor(steelPerHr * hrs) }
}

// ---- public API ----------------------------------------------------

export function getTerritories() { return state }
export function getTerritory(facilityId) { return state[facilityId] || null }

export function useTerritories() {
  const [s, setS] = useState(state)
  useEffect(() => {
    listeners.add(setS)
    return () => listeners.delete(setS)
  }, [])
  return s
}

// A drive-by has landed on a facility — chip its loyalty. Flips to the player
// when it hits 0. Returns { flipped, loyalty }.
export function applyHit(facilityId) {
  const rec = state[facilityId]
  if (!rec) return { flipped: false, loyalty: 0 }
  const now = Date.now()

  // Vacant → planting your flag claims it outright.
  if (!rec.owner) {
    commit({ ...state, [facilityId]: { owner: 'you', loyalty: FLIP_LOYALTY, loyaltyAt: now, lastCollectedAt: now } })
    return { flipped: true, loyalty: FLIP_LOYALTY }
  }
  if (rec.owner === 'you') return { flipped: false, loyalty: effectiveLoyalty(rec) }

  const next = effectiveLoyalty(rec) - HIT_DAMAGE
  if (next <= 0) {
    commit({ ...state, [facilityId]: { owner: 'you', loyalty: FLIP_LOYALTY, loyaltyAt: now, lastCollectedAt: now } })
    return { flipped: true, loyalty: FLIP_LOYALTY }
  }
  commit({ ...state, [facilityId]: { ...rec, loyalty: next, loyaltyAt: now } })
  return { flipped: false, loyalty: next }
}

// An ENEMY raid has landed on a facility YOU hold — chip its defense. If it
// hits 0 the facility is lost to the raiding gang. Mirror of applyHit, but
// hostile. Returns { lost, loyalty, gang }.
export function applyRaid(facilityId, gang) {
  const rec = state[facilityId]
  if (!rec || rec.owner !== 'you') return { lost: false, loyalty: 0, gang }
  const now = Date.now()
  const next = effectiveLoyalty(rec) - HIT_DAMAGE
  if (next <= 0) {
    commit({ ...state, [facilityId]: { owner: gang, loyalty: FLIP_LOYALTY, loyaltyAt: now, lastCollectedAt: now } })
    return { lost: true, loyalty: FLIP_LOYALTY, gang }
  }
  commit({ ...state, [facilityId]: { ...rec, loyalty: next, loyaltyAt: now } })
  return { lost: false, loyalty: next, gang }
}

// Steel cost to reinforce a facility you hold (scales with tier — supermaxes
// are pricier to hold).
export function reinforceCost(facilityId) {
  const fac = FACILITY_BY_ID.get(facilityId)
  return fac ? fac.tier * 150 : 0
}

// Spend Steel to restore a held facility's defense. Returns { ok, loyalty, cost }
// or { ok:false, reason }.
export function reinforce(facilityId) {
  const rec = state[facilityId]
  if (!rec || rec.owner !== 'you') return { ok: false, reason: 'not-yours' }
  const cur = effectiveLoyalty(rec)
  if (cur >= LOYALTY_MAX) return { ok: false, reason: 'full' }
  const cost = reinforceCost(facilityId)
  if (!spendSteel(cost)) return { ok: false, reason: 'broke' }
  const next = Math.min(LOYALTY_MAX, cur + REINFORCE_AMOUNT)
  commit({ ...state, [facilityId]: { ...rec, loyalty: next, loyaltyAt: Date.now() } })
  return { ok: true, loyalty: next, cost }
}

// Bank a held facility's accrued income. Returns what was credited.
export function collect(facilityId) {
  const rec = state[facilityId]
  if (!rec || rec.owner !== 'you') return { hustle: 0, steel: 0 }
  const got = pendingIncome(facilityId)
  if (got.hustle > 0) addHustle(got.hustle)
  if (got.steel > 0)  addSteel(got.steel)
  commit({ ...state, [facilityId]: { ...rec, lastCollectedAt: Date.now() } })
  return got
}

// ---- internals -----------------------------------------------------

function commit(next) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
  listeners.forEach(fn => fn(state))
}
