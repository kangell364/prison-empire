// Gang (clan) store — simulated single-player version.
//
// New players aren't in a gang. They can either FOUND their own (gated behind a
// level + a Steel cost) or JOIN one of the simulated AI gangs you can browse.
// When real multiplayer (Supabase) lands, the AI browse list is swapped for real
// gangs and these same screens keep working.
//
// The gang you're in is snapshotted in full into `myGang` and persisted, so it
// survives even though the browsable AI gangs are regenerated each load.

import { useEffect, useState } from 'react'

const KEY = 'pe_gang_v1'

// ---- tuning knobs ---------------------------------------------------
export const CREATE_MIN_LEVEL = 10     // level required to FOUND a gang
export const FOUND_COST_STEEL  = 25    // Steel spent to found a gang
export const GANG_CAPACITY     = 30    // MAX members per gang (1 boss + 29)
const GANG_BASE_CAPACITY       = 6     // capacity at Lv 1 (1 boss + 5)
// Capacity grows +2 per gang level, capped at GANG_CAPACITY — so the OG must
// level the gang (via contributions) to open more recruit spots. 30 is the
// ceiling (not 50): enough for real gang-vs-gang turf scale without a wall of
// empty seats; bump GANG_CAPACITY later once real multiplayer fills rosters.
export function capacityForLevel(level) {
  return Math.min(GANG_CAPACITY, GANG_BASE_CAPACITY + (Math.max(1, level) - 1) * 2)
}
const APPLY_DECISION_MS = 8000         // simulated time for an OG to accept you

export const ROLES = { BOSS: 'boss', OFFICER: 'officer', MEMBER: 'member' }
export const ENROLLMENT = { OPEN: 'open', APPLY: 'apply', INVITE: 'invite' }
export const PLAYER_MEMBER_ID = 'player'

// Gang perks — funded from the treasury, bought by the OG. Each adds a flat
// `perLevel` bonus per level, up to `maxLevel`. The two shipped perks are wired
// for real: 'plug' multiplies block income, 'lawyer' multiplies XP gains.
export const PERKS = [
  { id: 'plug',   name: 'The Plug',         emoji: '🔌', effect: 'Block income', perLevel: 0.10, maxLevel: 5, baseCost: 2000, growth: 1.8 },
  { id: 'lawyer', name: 'Jailhouse Lawyer', emoji: '⚖️', effect: 'XP gained',    perLevel: 0.10, maxLevel: 5, baseCost: 2500, growth: 1.8 },
]
function perkById(id) { return PERKS.find(p => p.id === id) }
export function perkCost(perk, level) { return Math.round(perk.baseCost * Math.pow(perk.growth, level)) }

// ---- AI gang generation (browse list) -------------------------------
const STREET_NAMES = [
  'Tiny', 'Lil Ghost', 'Big Sleep', 'Trigga', 'Smoke', 'Capone', 'Ice', 'Murda',
  'Snake', 'Bones', 'Diesel', 'Cash', 'Reaper', 'Loco', 'Shadow', 'Blitz',
  'Razor', 'Tank', 'Spider', 'Fold', 'Heavy', 'Slim', 'Gator', 'Ace',
]
const MEMBER_EMOJIS = ['😤', '💀', '🔪', '👊', '🥊', '🧤', '🎭', '🩸', '🐺', '👹']

let idSeq = 1
function nextId() { return `m${idSeq++}` }

// Build a roster of `count` AI members around `avgLevel`. The first is the boss.
function makeRoster(count, avgLevel) {
  const used = new Set()
  const pickName = () => {
    for (let i = 0; i < 40; i++) {
      const n = STREET_NAMES[Math.floor(Math.random() * STREET_NAMES.length)]
      if (!used.has(n)) { used.add(n); return n }
    }
    return STREET_NAMES[Math.floor(Math.random() * STREET_NAMES.length)]
  }
  const members = []
  for (let i = 0; i < count; i++) {
    const lvl = Math.max(1, Math.round(avgLevel + (Math.random() * 6 - 3)))
    members.push({
      id: nextId(),
      name: pickName(),
      level: lvl,
      power: lvl * 120 + Math.floor(Math.random() * 200),
      role: i === 0 ? ROLES.BOSS : ROLES.MEMBER,
      emoji: MEMBER_EMOJIS[Math.floor(Math.random() * MEMBER_EMOJIS.length)],
    })
  }
  return members
}

function gangPower(members) { return members.reduce((s, m) => s + (m.power || 0), 0) }

// Gang XP comes from member contributions — 1 Hustle donated = 1 gang XP. Each
// level costs progressively more (linear growth), so the gang climbs as the
// treasury is fed.
const GANG_XP_BASE = 5000   // Hustle to go from Lv 1 → 2; ×2 for 2→3, etc.
export function xpForGangLevel(level) {   // total XP to REACH `level` (Lv 1 = 0)
  const L = Math.max(1, level)
  return GANG_XP_BASE * ((L - 1) * L) / 2
}
export function gangLevelFromXp(xp) {
  let level = 1
  while (xpForGangLevel(level + 1) <= xp) level++
  return level
}
// Progress within the current level — drives the gang XP bar.
export function gangLevelProgress(gang) {
  const xp = gang?.xp || 0
  const level = gangLevelFromXp(xp)
  const base = xpForGangLevel(level)
  const next = xpForGangLevel(level + 1)
  const span = next - base
  const inLevel = xp - base
  return { level, xp, inLevel: Math.max(0, inLevel), span, toNext: Math.max(0, next - xp), pct: span > 0 ? Math.min(100, (inLevel / span) * 100) : 0 }
}

// Eight hand-authored AI gangs. The IDENTITY (id/name/tag/crest/color) is stable
// across sessions — only the member rosters are regenerated. `color` tints the
// gang on the turf leaderboard + map; gold (#c9a84c) is reserved for the player.
export const GANG_DEFS = [
  { id: 'g_blok',  name: 'Block Boys',            tag: 'BLOK', crest: '🏚️', color: '#e74c3c', avgLevel: 6,  size: 9,  enrollment: ENROLLMENT.OPEN,   minLevel: 0 },
  { id: 'g_yard',  name: 'Yard Kings',            tag: 'YARD', crest: '👑', color: '#e67e22', avgLevel: 14, size: 11, enrollment: ENROLLMENT.APPLY,  minLevel: 8 },
  { id: 'g_dss',   name: 'Dirty South Syndicate', tag: 'DSS',  crest: '💀', color: '#9b59b6', avgLevel: 22, size: 12, enrollment: ENROLLMENT.INVITE, minLevel: 0 },
  { id: 'g_cb9',   name: 'Cell Block 9',          tag: 'CB9',  crest: '🔒', color: '#4a9eff', avgLevel: 4,  size: 5,  enrollment: ENROLLMENT.OPEN,   minLevel: 0 },
  { id: 'g_com',   name: 'The Commissary',        tag: 'COM',  crest: '🛒', color: '#2ecc71', avgLevel: 10, size: 8,  enrollment: ENROLLMENT.APPLY,  minLevel: 0 },
  { id: 'g_wire',  name: 'Razor Wire',            tag: 'WIRE', crest: '🪒', color: '#1abc9c', avgLevel: 7,  size: 6,  enrollment: ENROLLMENT.OPEN,   minLevel: 5 },
  { id: 'g_conc',  name: 'Concrete Mafia',        tag: 'CONC', crest: '🧱', color: '#95a5a6', avgLevel: 28, size: 12, enrollment: ENROLLMENT.INVITE, minLevel: 0 },
  { id: 'g_ldl',   name: 'Lockdown Legion',       tag: 'LDL',  crest: '⛓️', color: '#e84393', avgLevel: 12, size: 7,  enrollment: ENROLLMENT.APPLY,  minLevel: 0 },
]

// Stable gang identity for the leaderboard/map. Resolves the 8 AI gangs plus the
// player's own gang (founded id 'mine', or a joined AI gang) — flagging `isMine`
// so the UI can highlight it. Player-founded gangs fall back to gold.
export function gangIdentity(id) {
  const myId = state.myGang?.id
  if (state.myGang && id === myId) {
    const base = GANG_DEFS.find(d => d.id === id)
    return { id, name: state.myGang.name, tag: state.myGang.tag, crest: state.myGang.crest || '🏴',
             color: base?.color || '#c9a84c', isMine: true }
  }
  const d = GANG_DEFS.find(g => g.id === id)
  if (d) return { id: d.id, name: d.name, tag: d.tag, crest: d.crest, color: d.color, isMine: false }
  return { id, name: id, tag: '', crest: '🏴', color: '#888', isMine: false }
}
export function getMyGangId() { return state.myGang?.id || null }
export const ALL_GANG_IDS = GANG_DEFS.map(d => d.id)

// Eight hand-authored AI gangs, rosters generated at load. Not persisted — this
// is just the browse list, regenerated each session.
function buildAiGangs() {
  return GANG_DEFS.map(d => {
    const level = Math.max(1, Math.round(d.avgLevel))
    const capacity = capacityForLevel(level)
    const members = makeRoster(Math.min(d.size, capacity), d.avgLevel)
    return {
      id: d.id, name: d.name, tag: d.tag, crest: d.crest,
      enrollment: d.enrollment, minLevel: d.minLevel,
      level,
      xp: xpForGangLevel(level),   // seed XP so leveling stays consistent if you join + donate
      capacity,
      members,
      power: gangPower(members),
    }
  })
}

const AI_GANGS = buildAiGangs()

// ---- state ----------------------------------------------------------
let state = readInitial()   // { myGang: gangObject|null, applied: { [gangId]: ts } }
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { myGang: p.myGang || null, applied: p.applied || {} }
    }
  } catch {}
  return { myGang: null, applied: {} }
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

// ---- reads ----------------------------------------------------------
export function getMyGang() { return state.myGang }
export function isInGang()  { return !!state.myGang }

// Player's role in their current gang (or null).
export function myRole() {
  const me = state.myGang?.members.find(m => m.id === PLAYER_MEMBER_ID)
  return me ? me.role : null
}
export function amBoss() { return myRole() === ROLES.BOSS }

export function useGang() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}

// Plain (non-React) subscription — fires on any gang change (join/leave/found).
// Used by the turf map to recolor blocks the moment your gang allegiance shifts.
export function subscribeGang(fn) { listeners.add(fn); return () => listeners.delete(fn) }

// Browsable gangs = the AI list minus the one you're already in.
export function getBrowseGangs() {
  return AI_GANGS.filter(g => g.id !== state.myGang?.id)
}

// 'none' | 'pending' | 'accepted' — derived from when you applied.
export function applicationStatus(gangId) {
  const ts = state.applied[gangId]
  if (!ts) return 'none'
  return (Date.now() - ts >= APPLY_DECISION_MS) ? 'accepted' : 'pending'
}

// ---- treasury + perks (reads) ---------------------------------------
export function getTreasury()        { return state.myGang?.treasury || 0 }
export function getPerkLevel(id)     { return state.myGang?.perks?.[id] || 0 }
export function getContribution(mid) { return state.myGang?.contributions?.[mid] || 0 }

// Multipliers other stores read (no React) to apply the active gang's perks.
export function gangBlockIncomeMult() { return 1 + getPerkLevel('plug') * perkById('plug').perLevel }
export function gangXpMult()          { return 1 + getPerkLevel('lawyer') * perkById('lawyer').perLevel }

// ---- treasury + perks (writes) --------------------------------------

// Donate to the treasury. The caller charges the player's Hustle first; this
// just credits the pool and tracks who gave what.
export function donateToTreasury(amount, memberId = PLAYER_MEMBER_ID) {
  if (!state.myGang) return
  const amt = Math.max(0, Math.floor(amount || 0))
  if (!amt) return
  const treasury = (state.myGang.treasury || 0) + amt
  const contributions = { ...(state.myGang.contributions || {}) }
  contributions[memberId] = (contributions[memberId] || 0) + amt
  // Every Hustle donated is gang XP — the gang levels up off contributions,
  // and each level opens another recruit spot (capacity).
  const xp = (state.myGang.xp || 0) + amt
  const level = gangLevelFromXp(xp)
  const capacity = Math.max(state.myGang.capacity || 0, capacityForLevel(level))
  commit({ ...state, myGang: { ...state.myGang, treasury, contributions, xp, level, capacity } })
}

// Buy the next level of a perk out of the treasury (OG-gated in the UI).
export function buyPerk(perkId) {
  if (!state.myGang) return false
  const perk = perkById(perkId)
  if (!perk) return false
  const level = state.myGang.perks?.[perkId] || 0
  if (level >= perk.maxLevel) return false
  const cost = perkCost(perk, level)
  if ((state.myGang.treasury || 0) < cost) return false
  commit({
    ...state,
    myGang: {
      ...state.myGang,
      treasury: state.myGang.treasury - cost,
      perks: { ...(state.myGang.perks || {}), [perkId]: level + 1 },
    },
  })
  return true
}

// ---- writes ---------------------------------------------------------

// Build the player's own member entry from live identity passed by the caller.
function playerMember(player, role) {
  return {
    id: PLAYER_MEMBER_ID,
    name: player.name || 'You',
    level: player.level || 1,
    power: player.power || 0,
    role,
    emoji: '🎯',
    isPlayer: true,
  }
}

// Found your own gang — you become the Boss. Seeds 2 AI lieutenants so the
// roster doesn't look dead on day one. Caller must pre-check level + Steel.
export function foundGang({ name, tag, crest, enrollment = ENROLLMENT.APPLY, minLevel = 0 }, player) {
  const seed = makeRoster(2, Math.max(1, (player.level || 1) - 1))
    .map(m => ({ ...m, role: ROLES.MEMBER }))
  const members = [playerMember(player, ROLES.BOSS), ...seed]
  const gang = {
    id: 'mine',
    name: name.trim() || 'My Gang',
    tag: (tag || '').trim().toUpperCase().slice(0, 5),
    crest: crest || '🏴',
    enrollment, minLevel: Math.max(0, minLevel | 0),
    level: 1,
    xp: 0,
    capacity: capacityForLevel(1),
    members,
    power: gangPower(members),
    treasury: 0,
    perks: {},
    contributions: {},
    founded: true,
  }
  commit({ ...state, myGang: gang })
}

// Join an AI gang — snapshot it and add the player as a Member.
export function joinGang(gangId, player) {
  const g = AI_GANGS.find(x => x.id === gangId)
  if (!g) return false
  if (g.members.length >= g.capacity) return false
  const members = [...g.members, playerMember(player, ROLES.MEMBER)]
  const snapshot = { ...g, members, power: gangPower(members) }
  const applied = { ...state.applied }; delete applied[gangId]
  commit({ ...state, myGang: snapshot, applied })
  return true
}

export function applyToGang(gangId) {
  commit({ ...state, applied: { ...state.applied, [gangId]: Date.now() } })
}

export function leaveGang() {
  commit({ ...state, myGang: null })
}

// ---- OG (boss) roster controls --------------------------------------
function mutateMembers(fn) {
  if (!state.myGang) return
  const members = fn(state.myGang.members.slice())
  commit({ ...state, myGang: { ...state.myGang, members, power: gangPower(members) } })
}

// The OG fills an open spot with one of his own cards. `card` carries the
// already-computed display + power so this store stays free of crew/upgrade deps.
// { cardId, name, avatar, emoji, level, power }
export function addCardMember(card) {
  if (!state.myGang) return false
  if (state.myGang.members.length >= state.myGang.capacity) return false
  const memberId = `card:${card.cardId}`
  if (state.myGang.members.some(m => m.id === memberId)) return false   // no dupes
  mutateMembers(ms => [...ms, {
    id: memberId,
    name: card.name,
    level: card.level || 1,
    power: card.power || 0,
    role: ROLES.MEMBER,
    emoji: card.emoji,
    avatar: card.avatar,
    isCard: true,
    cardId: card.cardId,
  }])
  return true
}

export function kickMember(memberId) {
  if (memberId === PLAYER_MEMBER_ID) return
  mutateMembers(ms => ms.filter(m => m.id !== memberId))
}

export function promoteMember(memberId) {
  mutateMembers(ms => ms.map(m =>
    m.id === memberId && m.role === ROLES.MEMBER ? { ...m, role: ROLES.OFFICER } : m))
}

export function demoteMember(memberId) {
  mutateMembers(ms => ms.map(m =>
    m.id === memberId && m.role === ROLES.OFFICER ? { ...m, role: ROLES.MEMBER } : m))
}

// ---- OG (boss) gang settings ----------------------------------------
export function setEnrollment(mode) {
  if (!state.myGang) return
  commit({ ...state, myGang: { ...state.myGang, enrollment: mode } })
}

export function setMinLevel(n) {
  if (!state.myGang) return
  commit({ ...state, myGang: { ...state.myGang, minLevel: Math.max(0, n | 0) } })
}

// Keep the player's roster row in sync with their live level/power/name.
export function syncPlayerMember(player) {
  if (!state.myGang) return
  const idx = state.myGang.members.findIndex(m => m.id === PLAYER_MEMBER_ID)
  if (idx < 0) return
  const cur = state.myGang.members[idx]
  if (cur.level === player.level && cur.power === player.power && cur.name === player.name) return
  mutateMembers(ms => ms.map(m =>
    m.id === PLAYER_MEMBER_ID ? { ...m, name: player.name, level: player.level, power: player.power } : m))
}
