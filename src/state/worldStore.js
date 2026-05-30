// worldStore — the source of truth for the territory game (Phase A).
//
// Model (player / gang / mob / trap-house):
//   player   : the local user. Their player card is cosmetic ("in prison"); the
//              gang (gang_card_ids) is the combat roster. mob_id = which mob they
//              run with (null = independent). home_house_id = their personal house.
//   mobs     : organized-crime orgs (the alliance layer). Color the overview map.
//   players  : every actor that can own a house — 'you' + AI holder stand-ins.
//   houses   : trap houses, three kinds:
//                business — one per county, income, the ONLY capturable kind.
//                personal — a player's home; movable, KO-able, not capturable.
//                mansion  — a mob's HQ; movable, KO-able, not capturable.
//
// `hp` is the capture/defense pool (the old "loyalty"): a hit chips it, it
// regenerates over time, and at 0 a business house flips to the attacker.
//
// localStorage-only for now (key pe_world_v1). Moves to Supabase in the
// multiplayer phase. The legacy territoriesStore is now a thin facade over this.

import { useEffect, useState } from 'react'
import {
  FACILITIES, FACILITY_TIERS, PLAYER, PLAYER_HOME_FACILITY_ID,
  DEFAULT_LOOK_ID, STARTER_CARD_IDS,
} from '../data/gameData'
import { AI_MOBS } from '../data/mobs'
import { addHustle, addSteel, spendSteel } from './profileStore'

const KEY                   = 'pe_world_v1'
const LEGACY_TERRITORIES_KEY = 'pe_territories_v1'

// Combat / economy constants (hp == the old "loyalty").
export const HP_MAX           = 100
export const HIT_DAMAGE       = 25     // hp removed per attack landing
export const FLIP_HP          = 50     // hp a business house starts at after flipping
export const REINFORCE_AMOUNT = 30     // hp restored per reinforce
export const REGEN_PER_HR     = 5      // hp healed per hour while held
const INCOME_CAP_HRS = 24              // max hours of income that accrue uncollected

const FACILITY_BY_ID = new Map(FACILITIES.map(f => [f.id, f]))

// AI player handles — each gets a personal trap house on the map (Phase C3).
const AI_HANDLES = [
  'Ghost', 'TreyDeuce', 'BigSmoke', 'Lil_Capo', 'D-Loc', 'MamboMarco', 'SlickVic',
  'Reyes99', 'TonyGz', 'FatSammy', 'KingKutt', 'BabyFace', 'OldmanRudy', 'Domino',
]

// ---- helpers -------------------------------------------------------

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}
function hoursSince(ts) { return Math.max(0, (Date.now() - ts) / 3_600_000) }

// One AI "holder" player per AI mob holds that mob's houses until real players exist.
function aiHolderId(mobId) { return `${mobId}__holder` }
function mobByName(mobs, name) { return Object.values(mobs).find(m => m.name === name) || null }

// hp with regen applied. Vacant business houses have no owner → 0.
export function effectiveHp(house) {
  if (!house) return 0
  if (house.kind === 'business' && !house.owner_player_id) return 0
  return Math.min(house.hp_max, Math.round(house.hp + REGEN_PER_HR * hoursSince(house.hpAt)))
}

export function tierIncome(tier) { return FACILITY_TIERS[tier] || FACILITY_TIERS[1] }

// ---- seeding / migration -------------------------------------------

function readLegacyTerritories() {
  try { const raw = localStorage.getItem(LEGACY_TERRITORIES_KEY); if (raw) return JSON.parse(raw) || {} } catch {}
  return {}
}

function buildWorld() {
  const now = Date.now()

  // AI mobs + their holder players.
  const mobs = {}, players = {}
  AI_MOBS.forEach(m => {
    mobs[m.id] = { id: m.id, name: m.name, color: m.color, is_ai: true, leader_player_id: aiHolderId(m.id) }
    players[aiHolderId(m.id)] = { id: aiHolderId(m.id), name: m.name, mob_id: m.id, is_ai: true }
  })
  players['you'] = { id: 'you', name: PLAYER.name, mob_id: null, is_ai: false }

  // Business houses — migrate from the legacy territories save if present, else
  // mirror the old seed (home = you, ~30% vacant, the rest deterministic AI).
  const legacy = readLegacyTerritories()
  const houses = {}
  FACILITIES.forEach(f => {
    let owner_player_id = null, owner_mob_id = null, hp = 0, hpAt = now, lastCollectedAt = now
    const prev = legacy[f.id]
    if (prev) {
      hpAt = prev.loyaltyAt || now
      lastCollectedAt = prev.lastCollectedAt || now
      if (prev.owner === 'you') {
        owner_player_id = 'you'; hp = prev.loyalty ?? HP_MAX
      } else if (prev.owner) {
        const mob = mobByName(mobs, prev.owner) ||
          mobs[AI_MOBS[hash(prev.owner) % AI_MOBS.length].id]
        owner_mob_id = mob.id; owner_player_id = aiHolderId(mob.id); hp = prev.loyalty ?? HP_MAX
      } else {
        owner_player_id = null; hp = 0
      }
    } else if (f.id === PLAYER_HOME_FACILITY_ID) {
      owner_player_id = 'you'; hp = HP_MAX
    } else {
      const h = hash(f.id)
      if (h % 100 < 30) { owner_player_id = null; hp = 0 }
      else {
        const m = AI_MOBS[h % AI_MOBS.length]
        owner_mob_id = m.id; owner_player_id = aiHolderId(m.id); hp = HP_MAX
      }
    }
    houses[f.id] = {
      id: f.id, kind: 'business', cityId: f.cityId, tier: f.tier, name: f.name,
      county_fips: null, x: null, y: null,
      owner_player_id, owner_mob_id,
      hp, hp_max: HP_MAX, hpAt,
      income_per_hr: FACILITY_TIERS[f.tier]?.hustlePerHr ?? 0,
      lastCollectedAt, moving_until: null, moving_to_fips: null,
    }
  })

  // Player's personal home house.
  const home = FACILITY_BY_ID.get(PLAYER_HOME_FACILITY_ID)
  const homeId = 'home_you'
  houses[homeId] = {
    id: homeId, kind: 'personal', cityId: home?.cityId ?? null, tier: null, name: PLAYER.name,
    county_fips: null, x: null, y: null,
    owner_player_id: 'you', owner_mob_id: null,
    hp: HP_MAX, hp_max: HP_MAX, hpAt: now, income_per_hr: 0,
    lastCollectedAt: now, moving_until: null, moving_to_fips: null,
  }

  // AI mob mansions — one per mob, anchored at a county it holds. Seeded now so
  // the model is complete; not rendered until the top-down map (Phase B).
  AI_MOBS.forEach(m => {
    const held = Object.values(houses).find(h => h.kind === 'business' && h.owner_mob_id === m.id)
    const id = `mansion_${m.id}`
    houses[id] = {
      id, kind: 'mansion', cityId: held?.cityId ?? null, tier: null, name: `${m.name} Mansion`,
      county_fips: null, x: null, y: null,
      owner_player_id: null, owner_mob_id: m.id,
      hp: HP_MAX, hp_max: HP_MAX, hpAt: now, income_per_hr: 0,
      lastCollectedAt: now, moving_until: null, moving_to_fips: null,
    }
  })

  // AI member players with their own personal houses, scattered across facility
  // counties so counties have MULTIPLE occupants (Phase C3). Anchored to facility
  // cities (so they resolve into those counties); cycling i % 10 clusters a few
  // into the same county. They belong to AI mobs.
  AI_HANDLES.forEach((handle, i) => {
    const mob = AI_MOBS[i % AI_MOBS.length]
    const fac = FACILITIES[i % Math.min(10, FACILITIES.length)]
    const pid = 'ai_' + handle.toLowerCase()
    players[pid] = { id: pid, name: handle, mob_id: mob.id, is_ai: true }
    const id = 'home_' + pid
    houses[id] = {
      id, kind: 'personal', cityId: fac.cityId, tier: null, name: handle,
      county_fips: null, x: null, y: null,
      owner_player_id: pid, owner_mob_id: mob.id,
      hp: HP_MAX, hp_max: HP_MAX, hpAt: now, income_per_hr: 0,
      lastCollectedAt: now, moving_until: null, moving_to_fips: null,
    }
  })

  const player = {
    id: 'you', name: PLAYER.name, player_look_id: DEFAULT_LOOK_ID,
    gang_card_ids: [...(STARTER_CARD_IDS || [])], mob_id: null,
    home_house_id: homeId, color: '#c9a84c',
  }

  return { player, mobs, players, houses }
}

function readInitial() {
  let w
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const base = buildWorld()
      // Merge so entities added to the catalog since last save appear (new
      // facilities, AI players/mobs, their houses), while keeping saved state.
      w = {
        ...base, ...parsed,
        mobs:    { ...base.mobs, ...parsed.mobs },
        players: { ...base.players, ...parsed.players },
        houses:  { ...base.houses, ...parsed.houses },
      }
    }
  } catch {}
  if (!w) w = buildWorld()
  // Persist on first load so the migration is locked in and the legacy key is
  // no longer re-read on subsequent visits.
  try { localStorage.setItem(KEY, JSON.stringify(w)) } catch {}
  return w
}

// ---- store ---------------------------------------------------------

let world = readInitial()
const listeners = new Set()

function commit(next) {
  world = next
  try { localStorage.setItem(KEY, JSON.stringify(world)) } catch {}
  listeners.forEach(fn => fn(world))
}

function setHouse(id, patch) {
  return { ...world, houses: { ...world.houses, [id]: { ...world.houses[id], ...patch } } }
}

// ---- selectors -----------------------------------------------------

export function getWorld() { return world }
export function getHouse(id) { return world.houses[id] || null }

export function useWorld() {
  const [w, setW] = useState(world)
  useEffect(() => { listeners.add(setW); return () => listeners.delete(setW) }, [])
  return w
}

// ---- mutators ------------------------------------------------------

// Owner patch for a winning attacker: 'you' → you (+ your mob); a mob id → that
// mob's AI holder (+ the mob).
function ownerPatchFor(attackerId) {
  if (attackerId === 'you') return { owner_player_id: 'you', owner_mob_id: world.player.mob_id }
  return { owner_player_id: aiHolderId(attackerId), owner_mob_id: attackerId }
}
function topContributor(contest, fallback) {
  let winner = fallback, max = -1
  for (const k in contest) if (contest[k] > max) { max = contest[k]; winner = k }
  return winner
}

// CONTESTED ATTACK on a business house (Phase D). attackerId = 'you' or a mob
// id. Damage ACCUMULATES per attacker in house.contest; when hp hits 0 the
// MOST-DAMAGE attacker wins — NOT whoever landed the final hit. Vacant houses
// are claimed on first hit. Returns { captured, winner, leader, contest, ... }.
export function attackHouse(houseId, attackerId, dmg = HIT_DAMAGE) {
  const h = world.houses[houseId]
  if (!h || h.kind !== 'business') return { captured: false }
  if (h.owner_player_id === attackerId || (attackerId !== 'you' && h.owner_mob_id === attackerId)) {
    return { captured: false, own: true }   // don't attack what you already hold
  }
  const now = Date.now()
  if (!h.owner_player_id) {
    commit(setHouse(houseId, { ...ownerPatchFor(attackerId), hp: FLIP_HP, hpAt: now, lastCollectedAt: now, contest: {} }))
    return { captured: true, winner: attackerId, vacant: true }
  }
  const contest = { ...(h.contest || {}) }
  contest[attackerId] = (contest[attackerId] || 0) + dmg
  const hp = effectiveHp(h) - dmg
  if (hp <= 0) {
    const winner = topContributor(contest, attackerId)
    commit(setHouse(houseId, { ...ownerPatchFor(winner), hp: FLIP_HP, hpAt: now, lastCollectedAt: now, contest: {} }))
    return { captured: true, winner, finalHitter: attackerId, contest }
  }
  commit(setHouse(houseId, { hp, hpAt: now, contest }))
  return { captured: false, hp, leader: topContributor(contest, attackerId), contest }
}

// Your drive-by landing — routes through the contest model. Returns the legacy
// { flipped, loyalty } shape (+ takenBy when a rival out-damaged you and grabbed
// the house even though you landed the final hit).
export function hitHouse(houseId) {
  const r = attackHouse(houseId, 'you')
  if (r.own) return { flipped: false, loyalty: effectiveHp(world.houses[houseId]) }
  if (r.captured) {
    if (r.winner === 'you') return { flipped: true, loyalty: FLIP_HP }
    const mob = world.mobs[r.winner]
    return { flipped: false, loyalty: FLIP_HP, takenBy: mob ? mob.name : 'a rival mob' }
  }
  return { flipped: false, loyalty: r.hp }
}

// An enemy raid landed on a business house YOU hold — chip its hp; lose it to
// the raiding mob at 0. Returns { lost, loyalty, gang }.
export function raidHouse(houseId, gangName) {
  const h = world.houses[houseId]
  if (!h || h.owner_player_id !== 'you') return { lost: false, loyalty: 0, gang: gangName }
  const now = Date.now()
  const next = effectiveHp(h) - HIT_DAMAGE
  if (next <= 0) {
    const mob = mobByName(world.mobs, gangName) || world.mobs[AI_MOBS[hash(gangName) % AI_MOBS.length].id]
    commit(setHouse(houseId, { owner_player_id: aiHolderId(mob.id), owner_mob_id: mob.id, hp: FLIP_HP, hpAt: now, lastCollectedAt: now }))
    return { lost: true, loyalty: FLIP_HP, gang: gangName }
  }
  commit(setHouse(houseId, { hp: next, hpAt: now }))
  return { lost: false, loyalty: next, gang: gangName }
}

// Spend Steel (cost computed by the caller) to restore a held house's hp.
export function reinforceHouse(houseId, cost) {
  const h = world.houses[houseId]
  if (!h || h.owner_player_id !== 'you') return { ok: false, reason: 'not-yours' }
  const cur = effectiveHp(h)
  if (cur >= h.hp_max) return { ok: false, reason: 'full' }
  if (!spendSteel(cost)) return { ok: false, reason: 'broke' }
  const next = Math.min(h.hp_max, cur + REINFORCE_AMOUNT)
  commit(setHouse(houseId, { hp: next, hpAt: Date.now() }))
  return { ok: true, loyalty: next, cost }
}

// Bank a held house's accrued income (amount computed by the caller).
export function collectHouse(houseId, got) {
  const h = world.houses[houseId]
  if (!h || h.owner_player_id !== 'you') return { hustle: 0, steel: 0 }
  if (got.hustle > 0) addHustle(got.hustle)
  if (got.steel > 0) addSteel(got.steel)
  commit(setHouse(houseId, { lastCollectedAt: Date.now() }))
  return got
}

// ---- movement (Phase C) --------------------------------------------

// Begin relocating a movable house (personal/mansion) to a destination county.
// travelMs scales with real distance (computed by the caller from coordinates).
export function moveHouse(houseId, destFips, travelMs) {
  const h = world.houses[houseId]
  if (!h || h.kind === 'business') return { ok: false }
  if (h.moving_until) return { ok: false, reason: 'already-moving' }
  commit(setHouse(houseId, { moving_to_fips: destFips, moving_until: Date.now() + travelMs }))
  return { ok: true }
}

// Complete an in-flight move (called when the timer elapses). The house's
// location becomes the destination county (county_fips takes over from cityId).
export function arriveHouse(houseId) {
  const h = world.houses[houseId]
  if (!h || !h.moving_to_fips) return null
  const dest = h.moving_to_fips
  commit(setHouse(houseId, { county_fips: dest, cityId: null, moving_to_fips: null, moving_until: null }))
  return dest
}

// An enemy raid landed on your PERSONAL trap house — chip its hp. At 0 you're
// knocked out: the house is NOT captured (personal houses can't be owned), you
// scatter to a random live county and respawn at full hp. respawnFips is chosen
// by the caller (which has the map data). Returns { ko, gang, county, hp }.
export function applyHomeRaid(houseId, gang, respawnFips) {
  const h = world.houses[houseId]
  if (!h || h.kind !== 'personal') return { ko: false, gang }
  const next = effectiveHp(h) - HIT_DAMAGE
  if (next <= 0) {
    commit(setHouse(houseId, {
      county_fips: respawnFips ?? h.county_fips, cityId: respawnFips ? null : h.cityId,
      hp: h.hp_max, hpAt: Date.now(), moving_until: null, moving_to_fips: null,
    }))
    return { ko: true, gang, county: respawnFips, hp: h.hp_max }
  }
  commit(setHouse(houseId, { hp: next, hpAt: Date.now() }))
  return { ko: false, gang, hp: next }
}

// Pending uncollected income for a business house you hold (capped).
export function housePendingIncome(houseId) {
  const h = world.houses[houseId]
  if (!h || h.owner_player_id !== 'you' || h.kind !== 'business') return { hustle: 0, steel: 0 }
  const hrs = Math.min(INCOME_CAP_HRS, hoursSince(h.lastCollectedAt))
  const { hustlePerHr, steelPerHr } = tierIncome(h.tier)
  return { hustle: Math.floor(hustlePerHr * hrs), steel: Math.floor(steelPerHr * hrs) }
}
