// territoriesStore — COMPATIBILITY FACADE over worldStore (Phase A).
//
// The real model now lives in worldStore (player / gang / mob / trap-house).
// This file re-presents the business houses in the legacy shape
//   { [facilityId]: { owner: 'you' | <mob name> | null, loyalty, loyaltyAt, lastCollectedAt } }
// so MapScreen and ScoutScreen keep working byte-for-byte unchanged. It will be
// retired in Phase B when those screens read worldStore directly.

import { FACILITIES, FACILITY_TIERS } from '../data/gameData'
import {
  useWorld, getWorld, getHouse,
  hitHouse, raidHouse, reinforceHouse, collectHouse, housePendingIncome,
  HP_MAX, HIT_DAMAGE as HP_HIT, FLIP_HP, REINFORCE_AMOUNT as HP_REINFORCE, REGEN_PER_HR,
} from './worldStore'

// Legacy constant names (kept for ScoutScreen's imports).
export const LOYALTY_MAX      = HP_MAX
export const HIT_DAMAGE       = HP_HIT
export const FLIP_LOYALTY     = FLIP_HP
export const REINFORCE_AMOUNT = HP_REINFORCE

const FACILITY_BY_ID = new Map(FACILITIES.map(f => [f.id, f]))

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}
function hoursSince(ts) { return Math.max(0, (Date.now() - ts) / 3_600_000) }

// Map a business house to the legacy owner string the UI expects:
// 'you' | <holding mob's name> | null.
function ownerLabel(house, world) {
  if (!house || !house.owner_player_id) return null
  if (house.owner_player_id === 'you') return 'you'
  const p = world.players[house.owner_player_id]
  const mob = p && world.mobs[p.mob_id]
  return mob ? mob.name : (p ? p.name : 'Rival')
}

function recFor(house, world) {
  if (!house) return null
  return {
    owner: ownerLabel(house, world),
    loyalty: house.hp,
    loyaltyAt: house.hpAt,
    lastCollectedAt: house.lastCollectedAt,
  }
}

// Project the business houses into the legacy { [facilityId]: rec } map.
// Cached by world identity so the reference stays stable between renders (the
// old store returned a stable ref until commit; effects depend on that).
let _cacheWorld = null, _cacheMap = null
function projectTerritories(world) {
  if (world === _cacheWorld && _cacheMap) return _cacheMap
  const out = {}
  for (const f of FACILITIES) {
    const rec = recFor(world.houses[f.id], world)
    if (rec) out[f.id] = rec
  }
  _cacheWorld = world; _cacheMap = out
  return out
}

// ---- public API (unchanged signatures) -----------------------------

export function getTerritories() { return projectTerritories(getWorld()) }
export function getTerritory(facilityId) { return recFor(getHouse(facilityId), getWorld()) }

export function useTerritories() {
  const world = useWorld()
  return projectTerritories(world)
}

// Loyalty with regen applied (vacant = 0). Operates on a projected rec.
export function effectiveLoyalty(rec) {
  if (!rec || !rec.owner) return 0
  return Math.min(LOYALTY_MAX, Math.round(rec.loyalty + REGEN_PER_HR * hoursSince(rec.loyaltyAt)))
}

export function tierIncome(tier) { return FACILITY_TIERS[tier] || FACILITY_TIERS[1] }

const TIER_POWER = { 1: 150, 2: 350, 3: 700, 4: 1500 }
// Deterministic "gang strength" of a facility's holder — a flavor/threat read
// for the scout screen (capture is hp-based, not power-gated).
export function holderPower(facilityId) {
  const fac = FACILITY_BY_ID.get(facilityId)
  if (!fac) return 0
  const base = TIER_POWER[fac.tier] || 150
  return Math.round(base * (0.85 + (hash(facilityId) % 30) / 100))
}

export function pendingIncome(facilityId) { return housePendingIncome(facilityId) }

// A drive-by landed — chip loyalty / flip at 0. Returns { flipped, loyalty }.
export function applyHit(facilityId) { return hitHouse(facilityId) }

// An enemy raid landed on a facility you hold. Returns { lost, loyalty, gang }.
export function applyRaid(facilityId, gang) { return raidHouse(facilityId, gang) }

// Cash cost to reinforce (scales with tier). Tunable.
export function reinforceCost(facilityId) {
  const fac = FACILITY_BY_ID.get(facilityId)
  return fac ? fac.tier * 1500 : 0
}

export function reinforce(facilityId) {
  return reinforceHouse(facilityId, reinforceCost(facilityId))
}

export function collect(facilityId) {
  return collectHouse(facilityId, pendingIncome(facilityId))
}
