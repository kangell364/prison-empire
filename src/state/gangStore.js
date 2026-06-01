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
export const GANG_CAPACITY     = 12    // members per gang (1 boss + 11)
const APPLY_DECISION_MS = 8000         // simulated time for an OG to accept you

export const ROLES = { BOSS: 'boss', OFFICER: 'officer', MEMBER: 'member' }
export const ENROLLMENT = { OPEN: 'open', APPLY: 'apply', INVITE: 'invite' }
export const PLAYER_MEMBER_ID = 'player'

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

// Eight hand-authored AI gangs, rosters generated at load. Not persisted — this
// is just the browse list, regenerated each session.
function buildAiGangs() {
  const defs = [
    { id: 'g_blok',  name: 'Block Boys',       tag: 'BLOK',  crest: '🏚️', avgLevel: 6,  size: 9,  enrollment: ENROLLMENT.OPEN,   minLevel: 0 },
    { id: 'g_yard',  name: 'Yard Kings',       tag: 'YARD',  crest: '👑', avgLevel: 14, size: 11, enrollment: ENROLLMENT.APPLY,  minLevel: 8 },
    { id: 'g_dss',   name: 'Dirty South Syndicate', tag: 'DSS', crest: '💀', avgLevel: 22, size: 12, enrollment: ENROLLMENT.INVITE, minLevel: 0 },
    { id: 'g_cb9',   name: 'Cell Block 9',     tag: 'CB9',   crest: '🔒', avgLevel: 4,  size: 5,  enrollment: ENROLLMENT.OPEN,   minLevel: 0 },
    { id: 'g_com',   name: 'The Commissary',   tag: 'COM',   crest: '🛒', avgLevel: 10, size: 8,  enrollment: ENROLLMENT.APPLY,  minLevel: 0 },
    { id: 'g_wire',  name: 'Razor Wire',       tag: 'WIRE',  crest: '🪒', avgLevel: 7,  size: 6,  enrollment: ENROLLMENT.OPEN,   minLevel: 5 },
    { id: 'g_conc',  name: 'Concrete Mafia',   tag: 'CONC',  crest: '🧱', avgLevel: 28, size: 12, enrollment: ENROLLMENT.INVITE, minLevel: 0 },
    { id: 'g_ldl',   name: 'Lockdown Legion',  tag: 'LDL',   crest: '⛓️', avgLevel: 12, size: 7,  enrollment: ENROLLMENT.APPLY,  minLevel: 0 },
  ]
  return defs.map(d => {
    const members = makeRoster(d.size, d.avgLevel)
    return {
      id: d.id, name: d.name, tag: d.tag, crest: d.crest,
      enrollment: d.enrollment, minLevel: d.minLevel,
      level: Math.max(1, Math.round(d.avgLevel)),
      capacity: GANG_CAPACITY,
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
    capacity: GANG_CAPACITY,
    members,
    power: gangPower(members),
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
