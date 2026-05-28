// Crew store — 12 slots (1 Leader + 11 Members) + per-card stat upgrades.
// Persists to localStorage. Replaced by Supabase when the backend lands.
//
// Stat model:
//   baseAtk(card) = muscle * 5 + 15         (matches BattleDiceModal formula)
//   baseDef(card) = cred   * 5 + 10
//   atk(card) = baseAtk + 10 × upgrades.atk
//   def(card) = baseDef + 10 × upgrades.def
//
// Upgrade economy: each +10 ATK or +10 DEF costs HUSTLE_COST_PER_LEVEL Hustle.
// Capped at MAX_UPGRADE_LEVEL per stat.

import { useEffect, useState } from 'react'
import { STARTER_CARD_IDS } from '../data/gameData'

const KEY = 'pe_crew_v1'

export const CREW_MEMBER_SLOTS = 11
export const ATK_PER_LEVEL     = 10
export const DEF_PER_LEVEL     = 10
export const MAX_UPGRADE_LEVEL = 20
export const HUSTLE_COST_PER_LEVEL = (currentLevel) => 200 + currentLevel * 100

// ---- store internals -----------------------------------------------

let state = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return normalize(parsed)
    }
  } catch {}
  return seedFromCollection()
}

function normalize(s) {
  return {
    leader:  s.leader  ?? null,
    members: padOrTrim(Array.isArray(s.members) ? s.members : [], CREW_MEMBER_SLOTS),
    upgrades: s.upgrades && typeof s.upgrades === 'object' ? s.upgrades : {},
  }
}

function padOrTrim(arr, n) {
  const out = arr.slice(0, n)
  while (out.length < n) out.push(null)
  return out
}

// First-launch crew: drop starter cards into the slots so the player isn't
// staring at an empty roster. SlickRico (id 1) is the natural leader.
// Once Phase 3 moves crew to Supabase, this seed only runs in the
// localStorage fallback path.
function seedFromCollection() {
  const leaderId = STARTER_CARD_IDS.includes(1) ? 1 : (STARTER_CARD_IDS[0] ?? null)
  const memberIds = STARTER_CARD_IDS
    .filter(id => id !== leaderId)
    .slice(0, CREW_MEMBER_SLOTS)
  return {
    leader:  leaderId,
    members: padOrTrim(memberIds, CREW_MEMBER_SLOTS),
    upgrades: {},
  }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
}

function notify() { listeners.forEach(fn => fn(state)) }

function commit(next) {
  state = next
  persist()
  notify()
}

// ---- public API ----------------------------------------------------

export function getCrewState() { return state }

export function setLeader(cardId) {
  // If the card is already a member, take it out of that slot.
  const members = state.members.map(id => id === cardId ? null : id)
  // Old leader returns to the bench — into the first empty slot, or unbenched.
  const old = state.leader
  if (old != null && old !== cardId) {
    const emptyIdx = members.findIndex(id => id == null)
    if (emptyIdx !== -1) members[emptyIdx] = old
  }
  commit({ ...state, leader: cardId, members })
}

export function setMember(slotIndex, cardId) {
  if (slotIndex < 0 || slotIndex >= CREW_MEMBER_SLOTS) return
  let leader = state.leader
  const members = state.members.slice()
  // Take the card out of any other slot it occupies.
  for (let i = 0; i < members.length; i++) {
    if (i !== slotIndex && members[i] === cardId) members[i] = null
  }
  // If it's the current leader, demote them (their old slot stays empty).
  if (cardId != null && leader === cardId) leader = null
  members[slotIndex] = cardId
  commit({ ...state, leader, members })
}

export function clearSlot(kind, slotIndex) {
  if (kind === 'leader') {
    commit({ ...state, leader: null })
  } else if (kind === 'member') {
    const members = state.members.slice()
    members[slotIndex] = null
    commit({ ...state, members })
  }
}

export function upgradeStat(cardId, stat /* 'atk' | 'def' */) {
  const u = state.upgrades[cardId] || { atk: 0, def: 0 }
  const next = (u[stat] || 0) + 1
  if (next > MAX_UPGRADE_LEVEL) return
  commit({
    ...state,
    upgrades: { ...state.upgrades, [cardId]: { ...u, [stat]: next } },
  })
}

export function useCrew() {
  const [s, setS] = useState(state)
  useEffect(() => {
    listeners.add(setS)
    return () => listeners.delete(setS)
  }, [])
  return s
}

// ---- stat helpers --------------------------------------------------

export function baseAtk(card) {
  if (!card) return 0
  if (card.muscle != null) return card.muscle * 5 + 15
  if (card.power  != null) return Math.floor(card.power * 0.55) + 10
  return 0
}

export function baseDef(card) {
  if (!card) return 0
  if (card.cred  != null) return card.cred * 5 + 10
  if (card.power != null) return Math.floor(card.power * 0.45) + 15
  return 0
}

export function atkOf(card, upgrades = state.upgrades) {
  const u = upgrades[card?.id]
  return baseAtk(card) + (u?.atk || 0) * ATK_PER_LEVEL
}

export function defOf(card, upgrades = state.upgrades) {
  const u = upgrades[card?.id]
  return baseDef(card) + (u?.def || 0) * DEF_PER_LEVEL
}

export function upgradeLevels(cardId, upgrades = state.upgrades) {
  return upgrades[cardId] || { atk: 0, def: 0 }
}

// Combined ATK/DEF for a full crew (leader + members). Cards can be card
// objects directly or null entries (empty slots contribute 0).
export function crewTotals(crewCards, upgrades) {
  let atk = 0, def = 0, filled = 0
  crewCards.forEach(c => {
    if (!c) return
    atk += atkOf(c, upgrades || {})
    def += defOf(c, upgrades || {})
    filled++
  })
  return { atk, def, filled, total: crewCards.length }
}

