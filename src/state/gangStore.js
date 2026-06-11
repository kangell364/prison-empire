// Gang (clan) store — simulated single-player version.
//
// New players aren't in a gang. They can either FOUND their own (gated behind a
// level + a Cash cost) or JOIN one of the simulated AI gangs you can browse.
// When real multiplayer (Supabase) lands, the AI browse list is swapped for real
// gangs and these same screens keep working.
//
// The gang you're in is snapshotted in full into `myGang` and persisted, so it
// survives even though the browsable AI gangs are regenerated each load.

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../supabase'

const KEY = 'pe_gang_v1'

// ---- tuning knobs ---------------------------------------------------
export const CREATE_MIN_LEVEL = 10     // level required to FOUND a gang
export const FOUND_COST_CASH   = 25000 // Cash spent to found a gang (tunable)
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
  // Real (live) gang the player isn't in — resolved from the cache loaded by the
  // browse list / turf attribution; colorless gangs get a stable hashed color.
  const r = realIdentityCache.get(id)
  if (r) return { id, name: r.name, tag: r.tag || '', crest: r.crest || '🏴', color: r.color || hashColor(id), isMine: false }
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
      // `live` flags a server-backed gang; it's re-hydrated from Supabase on boot
      // (ensureGangs), so the cached copy is just an optimistic first paint.
      return { myGang: p.myGang || null, applied: p.applied || {}, live: !!p.live }
    }
  } catch {}
  return { myGang: null, applied: {}, live: false }
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

// ====================================================================
// LIVE (Supabase) backend — real multiplayer gangs. AI gangs (g_*) and any
// locally-founded gang stay 100% client-side; gangs with a UUID id are real,
// server-backed, and kept live by realtime. The myGang/member shapes are
// identical either way, so every consumer is unchanged. All currency/cross-user
// writes go through SECURITY DEFINER RPCs (see public/gangs_m1.txt).
// ====================================================================

export function liveGangsEnabled() { return isSupabaseConfigured }
export function isLiveGang() { return !!state.live }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isLiveGangId(id) { return typeof id === 'string' && UUID_RE.test(id) }

const MEMBER_FACES = ['😤', '💀', '🔪', '👊', '🥊', '🧤', '🎭', '🩸', '🐺', '👹']
function hashOf(s) { let h = 0; const str = String(s || ''); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h }
function faceFor(uid) { return MEMBER_FACES[hashOf(uid) % MEMBER_FACES.length] }
const HASH_COLORS = ['#e74c3c', '#4a9eff', '#9b59b6', '#2ecc71', '#e67e22', '#16a085', '#d35400', '#8e44ad', '#e84393', '#1abc9c']
function hashColor(id) { return HASH_COLORS[hashOf(id) % HASH_COLORS.length] }

// Real-gang identity cache (id -> {id,name,tag,crest,color}) so gangIdentity()
// + the turf leaderboard resolve live gangs the player isn't in.
const realIdentityCache = new Map()
// userId -> gangId, for attributing a rival's blocks to their gang (turf board).
const userGangCache = new Map()
export function gangIdForUser(uid) { return userGangCache.get(uid) || null }

async function getUid() { try { const { data } = await supabase.auth.getUser(); return data?.user?.id || null } catch { return null } }

function toLiveMember(r, myId) {
  const mine = r.user_id === myId
  return {
    id: mine ? PLAYER_MEMBER_ID : r.user_id,   // keep PLAYER_MEMBER_ID for self so myRole/etc. work
    userId: r.user_id,
    name: r.name || 'Player', level: r.level || 1, power: r.power || 0,
    role: r.role || ROLES.MEMBER, emoji: mine ? '🎯' : faceFor(r.user_id), isPlayer: mine,
  }
}
function membersToContrib(rows, myId) {
  const c = {}; for (const r of rows) c[r.user_id === myId ? PLAYER_MEMBER_ID : r.user_id] = r.contribution || 0; return c
}
function buildLiveGang(g, rows, myId) {
  const members = (rows || []).map(r => toLiveMember(r, myId))
  return {
    id: g.id, name: g.name, tag: g.tag || '', crest: g.crest || '🏴', color: g.color || null,
    enrollment: g.enrollment, minLevel: g.min_level || 0,
    level: g.level || 1, xp: Number(g.xp || 0), capacity: g.capacity || GANG_BASE_CAPACITY,
    treasury: Number(g.treasury || 0), perks: g.perks || {},
    members, power: gangPower(members), contributions: membersToContrib(rows || [], myId),
    founded: g.founder_id === myId, live: true,
  }
}
function patchLiveGang(prev, g) {
  return { ...prev,
    name: g.name, tag: g.tag || '', crest: g.crest || '🏴', color: g.color || null,
    enrollment: g.enrollment, minLevel: g.min_level || 0,
    level: g.level || prev.level, xp: Number(g.xp || 0), capacity: g.capacity || prev.capacity,
    treasury: Number(g.treasury || 0), perks: g.perks || {},
  }
}

// ---- realtime ----
let liveChannels = []
function teardownLive() { liveChannels.forEach(c => { try { supabase.removeChannel(c) } catch {} }); liveChannels = [] }
function subscribeLive(gangId, myId) {
  teardownLive()
  const cg = supabase.channel(`gang:${gangId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gangs', filter: `id=eq.${gangId}` }, payload => {
      if (payload.eventType === 'DELETE') { teardownLive(); commit({ ...state, myGang: null, live: false }); return }
      if (!state.myGang || state.myGang.id !== gangId) return
      realIdentityCache.set(gangId, { id: gangId, name: payload.new.name, tag: payload.new.tag, crest: payload.new.crest, color: payload.new.color })
      commit({ ...state, myGang: patchLiveGang(state.myGang, payload.new) })
    }).subscribe()
  const cm = supabase.channel(`gang_members:${gangId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gang_members', filter: `gang_id=eq.${gangId}` }, async () => {
      const { data: rows } = await supabase.from('gang_members').select('*').eq('gang_id', gangId)
      if (!rows || !rows.some(m => m.user_id === myId)) { teardownLive(); commit({ ...state, myGang: null, live: false }); return }
      if (!state.myGang || state.myGang.id !== gangId) return
      const members = rows.map(r => toLiveMember(r, myId))
      commit({ ...state, myGang: { ...state.myGang, members, power: gangPower(members), contributions: membersToContrib(rows, myId) } })
    }).subscribe()
  liveChannels = [cg, cm]
}

// ---- hydration (called from App after auth) ----
async function hydrateLiveGang(gangId, myId) {
  const [{ data: g }, { data: rows }] = await Promise.all([
    supabase.from('gangs').select('*').eq('id', gangId).maybeSingle(),
    supabase.from('gang_members').select('*').eq('gang_id', gangId),
  ])
  if (!g) { teardownLive(); commit({ ...state, myGang: null, live: false }); return null }
  realIdentityCache.set(g.id, { id: g.id, name: g.name, tag: g.tag, crest: g.crest, color: g.color })
  commit({ ...state, myGang: buildLiveGang(g, rows || [], myId), live: true, applied: {} })
  subscribeLive(gangId, myId)
  return state.myGang
}

export async function ensureGangs() {
  if (!isSupabaseConfigured) return
  loadRealGangs()   // warm the browse + userId->gang caches (turf attribution)
  const uid = await getUid()
  if (!uid) return
  const { data: mem } = await supabase.from('gang_members').select('gang_id').eq('user_id', uid).maybeSingle()
  if (!mem) {
    // No server membership. If a stale live gang sits in local state, clear it
    // (left on another device). A local AI/founded gang is left untouched.
    if (state.live) { teardownLive(); commit({ ...state, myGang: null, live: false }) }
    return
  }
  await hydrateLiveGang(mem.gang_id, uid)
}

// ---- browse list (real gangs + the AI browse list) ----
let realGangs = []
let realGangsLoaded = false
const browseListeners = new Set()
export async function loadRealGangs() {
  if (!isSupabaseConfigured) return []
  const [{ data: gangs }, { data: rows }] = await Promise.all([
    supabase.from('gangs').select('*'),
    supabase.from('gang_members').select('gang_id, user_id, power'),
  ])
  const counts = {}, powers = {}
  userGangCache.clear()
  ;(rows || []).forEach(m => { counts[m.gang_id] = (counts[m.gang_id] || 0) + 1; powers[m.gang_id] = (powers[m.gang_id] || 0) + (m.power || 0); userGangCache.set(m.user_id, m.gang_id) })
  realGangs = (gangs || []).map(g => {
    realIdentityCache.set(g.id, { id: g.id, name: g.name, tag: g.tag, crest: g.crest, color: g.color })
    return {
      id: g.id, name: g.name, tag: g.tag || '', crest: g.crest || '🏴', color: g.color,
      enrollment: g.enrollment, minLevel: g.min_level || 0, level: g.level || 1,
      capacity: g.capacity || GANG_BASE_CAPACITY, power: powers[g.id] || 0,
      members: new Array(counts[g.id] || 0), live: true,
    }
  })
  realGangsLoaded = true
  browseListeners.forEach(fn => fn())
  return realGangs
}

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

// Browsable gangs = real (live) gangs first, then the AI list — minus the one
// you're already in. Real gangs carry `live: true` for the LIVE badge.
export function getBrowseGangs() {
  const mine = state.myGang?.id
  return [...realGangs.filter(g => g.id !== mine), ...AI_GANGS.filter(g => g.id !== mine)]
}

// Reactive browse list — loads real gangs from Supabase on first use and
// re-renders when they arrive or when your own gang changes.
export function useBrowseGangs() {
  const [, bump] = useState(0)
  useEffect(() => {
    const fn = () => bump(v => v + 1)
    browseListeners.add(fn); listeners.add(fn)
    if (isSupabaseConfigured && !realGangsLoaded) loadRealGangs()
    return () => { browseListeners.delete(fn); listeners.delete(fn) }
  }, [])
  return getBrowseGangs()
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
  // Live: the RPC debits server Hustle + credits treasury/xp atomically; realtime
  // echoes it back. The caller must NOT pre-spend Hustle for a live gang.
  if (state.live) { rpcQuiet('donate_to_gang', { p_gang_id: state.myGang.id, p_amount: amt }, 'donate'); return }
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
  if (state.live) { rpcQuiet('buy_gang_perk', { p_gang_id: state.myGang.id, p_perk_id: perkId }, 'buyPerk'); return true }
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
// roster doesn't look dead on day one. Caller pre-checks level + spends the Cash
// (Cash is client-only, so it's charged client-side for both backends).
export function foundGang({ name, tag, crest, enrollment = ENROLLMENT.APPLY, minLevel = 0 }, player) {
  // Live: real server gang via RPC. Otherwise the local AI-seeded gang below.
  if (isSupabaseConfigured) { foundGangLive({ name, tag, crest, enrollment, minLevel }, player); return }
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

// Join a gang. A UUID id → a real (live) server gang via RPC; a g_* id → snapshot
// the local AI gang and add the player as a Member.
export function joinGang(gangId, player) {
  if (isLiveGangId(gangId)) { joinGangLive(gangId, player); return true }
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
  if (state.live) { leaveGangLive(); return }
  commit({ ...state, myGang: null })
}

// ---- live write helpers (RPCs) ----
async function foundGangLive({ name, tag, crest, enrollment = ENROLLMENT.APPLY, minLevel = 0 }, player) {
  const myId = await getUid(); if (!myId) return
  const { data, error } = await supabase.rpc('found_gang', {
    p_name: (name || '').trim() || 'My Gang',
    p_tag: (tag || '').trim().toUpperCase().slice(0, 5),
    p_crest: crest || '🏴', p_enrollment: enrollment, p_min_level: Math.max(0, minLevel | 0),
    p_name_snap: player.name || 'You', p_level: player.level || 1, p_power: player.power || 0, p_color: null,
  })
  if (error) { console.warn('[gang] found failed:', error.message); return }
  await hydrateLiveGang(data.id, myId)
}
async function joinGangLive(gangId, player) {
  const myId = await getUid(); if (!myId) return
  const { error } = await supabase.rpc('join_gang', { p_gang_id: gangId, p_name: player.name || 'You', p_level: player.level || 1, p_power: player.power || 0 })
  if (error) { console.warn('[gang] join failed:', error.message); return }
  await hydrateLiveGang(gangId, myId)
}
async function leaveGangLive() {
  const { error } = await supabase.rpc('leave_gang')
  if (error) console.warn('[gang] leave failed:', error.message)
  teardownLive()
  commit({ ...state, myGang: null, live: false })
}
function rpcQuiet(fn, args, label) {
  supabase.rpc(fn, args).then(({ error }) => { if (error) console.warn(`[gang] ${label} failed:`, error.message) })
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
  if (state.live) return false   // live rosters are real players only — no card fillers
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
  // For live gangs, a member's id IS their user_id (see toLiveMember).
  if (state.live) { rpcQuiet('kick_member', { p_gang_id: state.myGang.id, p_user_id: memberId }, 'kick'); return }
  mutateMembers(ms => ms.filter(m => m.id !== memberId))
}

export function promoteMember(memberId) {
  if (state.live) { rpcQuiet('set_member_role', { p_gang_id: state.myGang.id, p_user_id: memberId, p_role: ROLES.OFFICER }, 'promote'); return }
  mutateMembers(ms => ms.map(m =>
    m.id === memberId && m.role === ROLES.MEMBER ? { ...m, role: ROLES.OFFICER } : m))
}

export function demoteMember(memberId) {
  if (state.live) { rpcQuiet('set_member_role', { p_gang_id: state.myGang.id, p_user_id: memberId, p_role: ROLES.MEMBER }, 'demote'); return }
  mutateMembers(ms => ms.map(m =>
    m.id === memberId && m.role === ROLES.OFFICER ? { ...m, role: ROLES.MEMBER } : m))
}

// ---- OG (boss) gang settings ----------------------------------------
export function setEnrollment(mode) {
  if (!state.myGang) return
  if (state.live) { rpcQuiet('set_gang_settings', { p_gang_id: state.myGang.id, p_enrollment: mode, p_min_level: state.myGang.minLevel || 0 }, 'settings'); return }
  commit({ ...state, myGang: { ...state.myGang, enrollment: mode } })
}

export function setMinLevel(n) {
  if (!state.myGang) return
  if (state.live) { rpcQuiet('set_gang_settings', { p_gang_id: state.myGang.id, p_enrollment: state.myGang.enrollment, p_min_level: Math.max(0, n | 0) }, 'settings'); return }
  commit({ ...state, myGang: { ...state.myGang, minLevel: Math.max(0, n | 0) } })
}

// Keep the player's roster row in sync with their live level/power/name.
let lastSyncKey = ''
async function syncLiveMember(player) {
  const key = `${player.name}|${player.level}|${player.power}`
  if (key === lastSyncKey) return
  lastSyncKey = key
  const myId = await getUid(); if (!myId) return
  await supabase.from('gang_members').update({ name: player.name, level: player.level, power: player.power }).eq('user_id', myId)
}
export function syncPlayerMember(player) {
  if (!state.myGang) return
  if (state.live) { syncLiveMember(player); return }
  const idx = state.myGang.members.findIndex(m => m.id === PLAYER_MEMBER_ID)
  if (idx < 0) return
  const cur = state.myGang.members[idx]
  if (cur.level === player.level && cur.power === player.power && cur.name === player.name) return
  mutateMembers(ms => ms.map(m =>
    m.id === PLAYER_MEMBER_ID ? { ...m, name: player.name, level: player.level, power: player.power } : m))
}
