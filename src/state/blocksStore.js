// blocksStore — the block / loyalty-market economy (v1).
//
// The map is an infinite uniform grid of ~1.8km (4×4 "merged") blocks. We do NOT store every
// block — that's billions of cells. Instead:
//   - blockDefault(gx,gy) gives every cell a DETERMINISTIC ambient state
//     (procedural rival crews hold turf everywhere, with a base value/income).
//   - `overrides` (localStorage) records only the blocks the player has changed
//     (recruited onto, poached). getBlock merges override over default.
//
// Loop: recruit a member onto a vacant block (Hustle) → it earns Hustle/hr →
// poach a held block for loyalty x1.10 (loyalty ratchets +10% each takeover) →
// the displaced owner gets their stake back + a cut (a payday, not a robbery;
// only credited for real players — ambient AI has no recipient) → loyalty
// decays slowly when uncontested → a re-poach cooldown + a per-player cap keep
// whales in check. Blocks near your trap house get a home-turf bonus.
//
// Map-roam: you can claim/poach anywhere; no GPS. Home-turf is anchored to your
// in-game trap house location (passed in by the caller), not the phone's GPS.

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../supabase'
import { addHustle, spendHustle, getUserId } from './profileStore'
import { gangBlockIncomeMult } from './gangStore'
import { getProgress } from './progressionStore'

// Shared world (M2b): the open county. My claimed turf stays in localStorage
// (offline-friendly, economy unchanged) AND publishes to the Supabase `blocks`
// table; other players' claims stream back in via `remoteBlocks`. Must match
// sharedHousesStore's county.
const COUNTY_FIPS = '48201'   // Harris

// One block = the "merged 4×4" unit (~1.8km / ~1.1mi across — a neighborhood).
// Each block has one NPC, one recruit card, one color, one centered icon.
// (Was 0.004° / ~440m; coarsening 4× makes the map readable + better for GPS.)
export const GRID = 0.016             // ~1.8km block — MUST match the TurfMap grid
// Bumped v1→v2 with the grid change: old 0.004° turf coordinates don't map onto
// the new grid, so we start fresh rather than scatter owned blocks to wrong spots.
const KEY = 'pe_blocks_v2'

const POACH_MULT       = 1.10          // +10% per takeover
const PAYOUT_CUT       = 0.5           // displaced owner gets stake + this share of the premium
const DECAY_PER_HR     = 0.02          // loyalty decays 2%/hr toward its base when uncontested
const COOLDOWN_MS      = 60 * 1000     // re-poach lock after a takeover
// Block cap scales with player level (25 per level) — a soft anti-whale ceiling
// that doubles as a progression reward: low levels are gently capped, high
// levels are effectively uncapped. Level comes from the live progression store.
export const BLOCKS_PER_LEVEL = 25
export function blockCap() { return BLOCKS_PER_LEVEL * Math.max(1, getProgress().level || 1) }
const INCOME_CAP_HRS   = 24
export const HOME_RADIUS_DEG = 0.06    // ~4mi home-turf radius
const HOME_INCOME_MULT = 1.25
const HOME_COST_MULT   = 0.85

export const CREW_COLORS = { red: '#e74c3c', blue: '#4a9eff', purple: '#9b59b6', you: '#c9a84c' }
const NPC_NAMES = ['Tre', 'Paco', 'Big L', 'Smoke', 'Reek', 'Vinnie', 'Tommy', 'Los', 'Deuce', 'Mac', 'Cash', 'Slim', 'Boomer', 'Rico', 'Tank']

// ---- grid helpers --------------------------------------------------

function frac(x) { return x - Math.floor(x) }
function cellRng(gx, gy, salt) { return Math.abs(frac(Math.sin(gx * 12.9898 + gy * 78.233 + salt * 37.719) * 43758.5453)) }
export function cellKey(gx, gy) { return gx + '_' + gy }
export function cellCenter(gx, gy) { return [gy * GRID + GRID / 2, gx * GRID + GRID / 2] }  // [lat,lng]
export function cellOf(lng, lat) { return [Math.floor(lng / GRID), Math.floor(lat / GRID)] }
function hoursSince(ts) { return Math.max(0, (Date.now() - ts) / 3_600_000) }

// ---- US-land mask --------------------------------------------------
// The block / NPC economy only exists on real US land. A predicate built from
// the states GeoJSON (installed via setLandTest once map data loads) tells us
// whether a cell's center falls on US turf; ocean, Canada, and Mexico return
// false → no NPCs spawn there and nobody can take those cells over. Canada is a
// later expansion; the ocean is permanently off-limits.
let landTest = null                 // (lng,lat) => bool ; null until map data loads
const landCache = new Map()         // cellKey → bool (memoized; each cell tested at most once)

// Install the US-land predicate. Until it's set every cell reads as land, so
// the world isn't blank during the async map-data load. Setting it clears the
// memo and notifies listeners so the map repaints with ocean/Canada cleared.
export function setLandTest(fn) {
  landTest = fn
  landCache.clear()
  listeners.forEach(f => f(overrides))
}

// Is this cell on claimable US turf? Memoized per cell. Returns true before the
// predicate loads (so nothing flickers blank on first paint).
export function isLandCell(gx, gy) {
  if (!landTest) return true
  const k = cellKey(gx, gy)
  let v = landCache.get(k)
  if (v === undefined) {
    const [lat, lng] = cellCenter(gx, gy)
    v = landTest(lng, lat)
    landCache.set(k, v)
  }
  return v
}

// Ambient (procedural) state for any cell — rival crews hold turf everywhere.
function blockDefault(gx, gy) {
  // Off US land (ocean / Canada / Mexico): an empty, non-claimable cell — no
  // owner, no NPC, zero income. The map skips drawing these entirely.
  if (!isLandCell(gx, gy)) {
    return { owner: null, ownerKind: null, color: null, loyalty: 0, baseLoyalty: 0, incomePerHr: 0, npc: null, land: false }
  }
  const h = cellRng(gx, gy, 0)
  const owner = h < 0.08 ? 'red' : h < 0.15 ? 'blue' : h < 0.20 ? 'purple' : null
  const tier = Math.floor(cellRng(gx, gy, 1) * 3)        // 0..2
  const baseLoyalty = 600 + tier * 700                   // 600 / 1300 / 2000
  const incomePerHr = 20 + tier * 40                     // 20 / 60 / 100
  const npc = NPC_NAMES[Math.floor(cellRng(gx, gy, 2) * NPC_NAMES.length)]
  return {
    owner, ownerKind: owner ? 'ai' : null, color: owner ? CREW_COLORS[owner] : null,
    loyalty: owner ? baseLoyalty : 0, baseLoyalty, incomePerHr, npc, land: true,
  }
}

// ---- store ---------------------------------------------------------

let overrides = load()
const listeners = new Set()
function load() { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) || {} } catch {} return {} }
function commit() { try { localStorage.setItem(KEY, JSON.stringify(overrides)) } catch {}; listeners.forEach(f => f(overrides)) }

export function subscribeBlocks(fn) { listeners.add(fn); return () => listeners.delete(fn) }
export function useBlocksVersion() {
  const [v, set] = useState(0)
  useEffect(() => subscribeBlocks(() => set(x => x + 1)), [])
  return v
}

// ---- shared world: other players' turf -----------------------------
// `remoteBlocks` holds OTHER players' claimed cells (keyed by cellKey), streamed
// from Supabase. My own turf lives in `overrides` (above) and takes precedence.
let remoteBlocks = {}
let myId = null
let blocksChannel = null

// Activity feed bus — fires on every turf takeover (yours or a rival's) so the
// UI can show a live "who took what" feed. Session-only (not persisted).
const activityListeners = new Set()
export function subscribeActivity(fn) { activityListeners.add(fn); return () => activityListeners.delete(fn) }
function emitActivity(ev) { activityListeners.forEach(fn => fn(ev)) }

// Live turf standings for the leaderboard: { ownerId: blockCount } across me +
// every rival currently in the shared cache. My own count keys off my user id.
export function turfStandings() {
  const counts = {}
  const me = getUserId() || 'you'
  for (const b of Object.values(overrides)) if (b.owner === 'you') counts[me] = (counts[me] || 0) + 1
  for (const b of Object.values(remoteBlocks)) counts[b.owner_id] = (counts[b.owner_id] || 0) + 1
  return counts
}

const RIVAL_COLORS = ['#e74c3c', '#4a9eff', '#9b59b6', '#2ecc71', '#e67e22', '#16a085', '#d35400', '#8e44ad']
function rivalColor(id) {
  let h = 0; const s = String(id || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return RIVAL_COLORS[h % RIVAL_COLORS.length]
}
function rowToRemote(r) {
  return {
    owner: 'rival', ownerKind: 'player', owner_id: r.owner_id, color: rivalColor(r.owner_id),
    npc: r.npc, loyalty: r.loyalty, baseLoyalty: r.base_loyalty, incomePerHr: r.income_per_hr,
    lastPoachAt: r.last_poach_at ? new Date(r.last_poach_at).getTime() : null, land: true,
  }
}
function rowToMine(r) {
  return {
    owner: 'you', ownerKind: 'you', npc: r.npc, baseLoyalty: r.base_loyalty,
    incomePerHr: r.income_per_hr, loyalty: r.loyalty, basePaid: r.loyalty,
    lastCollectedAt: r.last_collected_at ? new Date(r.last_collected_at).getTime() : Date.now(),
    lastPoachAt: r.last_poach_at ? new Date(r.last_poach_at).getTime() : Date.now(),
  }
}

// Called from the map once auth is ready. Loads the county's claimed turf,
// publishes my local turf so others can see it, and opens a realtime stream.
export async function initSharedBlocks() {
  if (!isSupabaseConfigured) return
  myId = getUserId()
  if (!myId) return
  await loadRemoteBlocks()
  await publishMyLocalBlocks()
  subscribeBlockRealtime()
}

async function loadRemoteBlocks() {
  const { data, error } = await supabase.from('blocks').select('*').eq('county_fips', COUNTY_FIPS)
  if (error || !data) return
  const next = {}
  for (const r of data) {
    const k = cellKey(r.gx, r.gy)
    if (r.owner_id === myId) { if (!overrides[k]) overrides[k] = rowToMine(r) }   // my turf from another device
    else next[k] = rowToRemote(r)
  }
  remoteBlocks = next
  commit()
}

// One-time publish of my existing local Harris turf so other players see it.
async function publishMyLocalBlocks() {
  const uid = myId; if (!uid) return
  if (!landTest) return    // land mask not loaded yet — don't mis-tag out-of-county turf
  const rows = []
  for (const [k, b] of Object.entries(overrides)) {
    if (b.owner !== 'you') continue
    const [gx, gy] = k.split('_').map(Number)
    if (!isLandCell(gx, gy)) continue                 // only cells inside the open county
    rows.push(claimRow(gx, gy, b, uid))
  }
  if (rows.length) {
    const { error } = await supabase.from('blocks').upsert(rows, { onConflict: 'county_fips,gx,gy' })
    if (error) console.warn('[blocks] publish failed', error)
  }
}

function claimRow(gx, gy, o, uid) {
  return {
    county_fips: COUNTY_FIPS, gx, gy, owner_id: uid,
    loyalty: o.loyalty, base_loyalty: o.baseLoyalty, income_per_hr: o.incomePerHr, npc: o.npc,
    last_collected_at: new Date(o.lastCollectedAt || Date.now()).toISOString(),
    last_poach_at: new Date(o.lastPoachAt || Date.now()).toISOString(),
    updated_at: new Date().toISOString(),
  }
}

// Push one of my claims/poaches to the shared table (fire-and-forget, optimistic).
function pushClaim(gx, gy) {
  if (!isSupabaseConfigured) return
  const uid = getUserId(); if (!uid) return
  const k = cellKey(gx, gy)
  if (remoteBlocks[k]) { delete remoteBlocks[k] }     // it's mine now, not a rival's
  const o = overrides[k]; if (!o) return
  supabase.from('blocks').upsert(claimRow(gx, gy, o, uid), { onConflict: 'county_fips,gx,gy' })
    .then(({ error }) => { if (error) console.warn('[blocks] claim push failed', error) })
}

function subscribeBlockRealtime() {
  if (blocksChannel) return
  blocksChannel = supabase
    .channel(`blocks:${COUNTY_FIPS}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `county_fips=eq.${COUNTY_FIPS}` }, payload => {
      const row = payload.eventType === 'DELETE' ? payload.old : payload.new
      if (!row || row.gx == null) return
      const k = cellKey(row.gx, row.gy)
      if (payload.eventType === 'DELETE') {
        delete remoteBlocks[k]
      } else if (row.owner_id === myId) {
        delete remoteBlocks[k]                         // now mine (e.g. another device) — local wins
      } else {
        const tookFromMe = !!(overrides[k] && overrides[k].owner === 'you')
        remoteBlocks[k] = rowToRemote(row)             // a rival's claim/poach
        if (tookFromMe) delete overrides[k]            // they took MY block
        emitActivity({ id: `${k}-${row.updated_at || Date.now()}`, actorId: row.owner_id, gx: row.gx, gy: row.gy, tookFromMe, at: Date.now() })
      }
      commit()
    })
    .subscribe()
}

// Loyalty with decay applied (decays toward base once past the cooldown).
export function effectiveLoyalty(b) {
  if (!b.lastPoachAt) return b.loyalty
  const decayed = b.loyalty * Math.pow(1 - DECAY_PER_HR, hoursSince(b.lastPoachAt))
  return Math.max(b.baseLoyalty, Math.round(decayed))
}

export function getBlock(gx, gy) {
  const def = blockDefault(gx, gy)
  const k = cellKey(gx, gy)
  const mine = overrides[k]
  const remote = remoteBlocks[k]
  // My own turf wins; otherwise a rival's claim; otherwise the procedural default.
  const b = mine ? { ...def, ...mine } : remote ? { ...def, ...remote } : def
  b.gx = gx; b.gy = gy
  // Color: me = gold, rival player = their hashed color, ambient AI crew = crew color.
  if (b.owner === 'you') b.color = CREW_COLORS.you
  else if (b.owner === 'rival') b.color = b.color || rivalColor(b.owner_id)
  else b.color = b.owner ? CREW_COLORS[b.owner] : null
  return b
}

export function yourBlockCount() { return Object.values(overrides).filter(b => b.owner === 'you').length }

// The blocks you currently hold (for the AI-poach picker).
export function yourBlocks() {
  return Object.entries(overrides).filter(([, b]) => b.owner === 'you').map(([k, b]) => {
    const [gx, gy] = k.split('_').map(Number)
    return { gx, gy, ...b }
  })
}

// Reactive read of your held blocks — re-renders the host whenever ownership
// changes (recruit / poach / AI poach / KO landing). Used by the map's
// "blocks by state/county" lists so they stay live.
export function useYourBlocks() {
  const [blocks, setBlocks] = useState(yourBlocks)
  useEffect(() => subscribeBlocks(() => setBlocks(yourBlocks())), [])
  return blocks
}

// AI crew takes one of YOUR blocks. You (a real displaced owner) get the payout
// — stake back + a cut of the premium — so a loss is a payday, not a wipeout.
// Returns { payout, crew, npc }.
export function aiPoachBlock(gx, gy, crew) {
  // In the shared world, ambient AI no longer steals real player turf (it has no
  // account to own the cell). Server-side AI is a later phase (M3).
  if (isSupabaseConfigured) return null
  const key = cellKey(gx, gy)
  const o = overrides[key]
  if (!o || o.owner !== 'you') return null
  const b = getBlock(gx, gy)
  const stake = effectiveLoyalty(b)
  const price = Math.round(stake * POACH_MULT)
  const payout = Math.round(stake + (price - stake) * PAYOUT_CUT)
  addHustle(payout)
  overrides[key] = {
    owner: crew, ownerKind: 'ai', npc: b.npc, baseLoyalty: b.baseLoyalty,
    incomePerHr: b.incomePerHr, loyalty: price, basePaid: price,
    lastCollectedAt: Date.now(), lastPoachAt: Date.now(),
  }
  commit()
  return { payout, crew, npc: b.npc }
}

export function poachPrice(b, homeTurf) {
  return Math.round(effectiveLoyalty(b) * POACH_MULT * (homeTurf ? HOME_COST_MULT : 1))
}
export function recruitCost(b, homeTurf) {
  return Math.round(b.baseLoyalty * (homeTurf ? HOME_COST_MULT : 1))
}
export function onCooldown(b) { return b.lastPoachAt ? (Date.now() - b.lastPoachAt) < COOLDOWN_MS : false }
export function cooldownLeft(b) { return b.lastPoachAt ? Math.max(0, Math.ceil((COOLDOWN_MS - (Date.now() - b.lastPoachAt)) / 1000)) : 0 }

export function pendingIncome(gx, gy) {
  const b = getBlock(gx, gy)
  if (b.owner !== 'you') return 0
  const hrs = Math.min(INCOME_CAP_HRS, hoursSince(b.lastCollectedAt || Date.now()))
  return Math.floor(b.incomePerHr * hrs)
}

// ---- actions -------------------------------------------------------

// Recruit a member onto a VACANT block. Returns { ok, reason?, cost }.
export function recruit(gx, gy, homeTurf) {
  const b = getBlock(gx, gy)
  if (b.land === false) return { ok: false, reason: 'offmap' }
  if (b.owner) return { ok: false, reason: 'taken' }
  if (yourBlockCount() >= blockCap()) return { ok: false, reason: 'cap' }
  const cost = recruitCost(b, homeTurf)
  if (!spendHustle(cost)) return { ok: false, reason: 'broke', cost }
  const now = Date.now()
  overrides[cellKey(gx, gy)] = {
    owner: 'you', ownerKind: 'you', npc: b.npc, baseLoyalty: b.baseLoyalty,
    incomePerHr: Math.round(b.incomePerHr * (homeTurf ? HOME_INCOME_MULT : 1)),
    loyalty: cost, basePaid: cost, lastCollectedAt: now, lastPoachAt: now,
  }
  commit()
  pushClaim(gx, gy)
  emitActivity({ id: `mine-${cellKey(gx, gy)}-${now}`, actorId: getUserId(), gx, gy, mine: true, at: now })
  return { ok: true, cost }
}

// Poach a HELD block (buy out the member's loyalty for +10%). Returns
// { ok, reason?, cost }. The displaced owner is credited only if a real player
// (ambient AI has no recipient — the spend is a Hustle sink).
export function poach(gx, gy, homeTurf) {
  const b = getBlock(gx, gy)
  if (b.land === false) return { ok: false, reason: 'offmap' }
  if (!b.owner || b.owner === 'you') return { ok: false, reason: 'own' }
  if (onCooldown(b)) return { ok: false, reason: 'cooldown' }
  if (yourBlockCount() >= blockCap()) return { ok: false, reason: 'cap' }
  const cost = poachPrice(b, homeTurf)
  if (!spendHustle(cost)) return { ok: false, reason: 'broke', cost }
  const now = Date.now()
  // A displaced REAL player gets their stake back + a 50% cut of the premium (a
  // payday, not a robbery) — wired in the multiplayer phase. Ambient AI owners
  // have no recipient, so their loss is just a Hustle sink.
  overrides[cellKey(gx, gy)] = {
    owner: 'you', ownerKind: 'you', npc: b.npc, baseLoyalty: b.baseLoyalty,
    incomePerHr: Math.round(b.incomePerHr * (homeTurf ? HOME_INCOME_MULT : 1)),
    loyalty: cost, basePaid: cost, lastCollectedAt: now, lastPoachAt: now,
  }
  commit()
  pushClaim(gx, gy)
  emitActivity({ id: `mine-${cellKey(gx, gy)}-${now}`, actorId: getUserId(), gx, gy, mine: true, at: now })
  return { ok: true, cost }
}

// ---- KO / scatter landing ------------------------------------------

// Where a KO'd / scattered movable house (personal trap house OR mob mansion)
// touches down. Spiral outward from the destination point for the nearest
// VACANT block and plant on it (free — a forced landing isn't a purchase). If
// EVERY block in range is already owned, take over the CHEAPEST one (lowest
// takeover price) so the house always has somewhere to land. Returns the chosen
// cell center [lat, lng] so the caller can pin the house exactly on that block.
export function scatterToBlock(lng, lat, maxRing = 14) {
  const [bx, by] = cellOf(lng, lat)
  let cheapest = null, cheapestCost = Infinity
  for (let r = 0; r <= maxRing; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue   // ring r only
      const gx = bx + dx, gy = by + dy
      if (!isLandCell(gx, gy)) continue                          // never land in ocean / off-US
      const b = getBlock(gx, gy)
      if (!b.owner) return claimLanding(gx, gy)                  // vacant — land here, free
      const cost = poachPrice(b, false)                          // owned — remember the cheapest
      if (cost < cheapestCost) { cheapestCost = cost; cheapest = [gx, gy] }
    }
  }
  // 100% of blocks in range are owned → take over the cheapest one.
  return cheapest ? claimLanding(cheapest[0], cheapest[1]) : cellCenter(bx, by)
}

// Plant your flag on a cell (a forced KO landing — no Hustle charged, ignores
// the block cap). Returns the cell center [lat, lng].
function claimLanding(gx, gy) {
  const b = getBlock(gx, gy)
  const now = Date.now()
  overrides[cellKey(gx, gy)] = {
    owner: 'you', ownerKind: 'you', npc: b.npc, baseLoyalty: b.baseLoyalty,
    incomePerHr: b.incomePerHr, loyalty: b.baseLoyalty, basePaid: 0,
    lastCollectedAt: now, lastPoachAt: now,
  }
  commit()
  pushClaim(gx, gy)
  return cellCenter(gx, gy)
}

// Bank a held block's accrued income.
export function collect(gx, gy) {
  const got = pendingIncome(gx, gy)
  const o = overrides[cellKey(gx, gy)]
  if (!o || o.owner !== 'you') return 0
  if (got > 0) addHustle(got)
  o.lastCollectedAt = Date.now()
  commit()
  return got
}

// ---- home-screen "Your Turf" aggregates ----------------------------

// Total Hustle/hr across every block you hold.
export function yourBlockIncomePerHr() {
  const base = yourBlocks().reduce((sum, b) => sum + (b.incomePerHr || 0), 0)
  return Math.round(base * gangBlockIncomeMult())
}

// Total uncollected (pending) Hustle waiting across all your blocks.
export function yourPendingIncome() {
  const base = yourBlocks().reduce((sum, b) => sum + pendingIncome(b.gx, b.gy), 0)
  return Math.round(base * gangBlockIncomeMult())
}

// Bank pending income from ALL your blocks in one pass (single credit + commit).
// Returns the total Hustle banked.
export function collectAllBlocks() {
  let total = 0
  const now = Date.now()
  for (const [k, o] of Object.entries(overrides)) {
    if (o.owner !== 'you') continue
    const [gx, gy] = k.split('_').map(Number)
    const got = pendingIncome(gx, gy)
    if (got > 0) { total += got; o.lastCollectedAt = now }
  }
  total = Math.round(total * gangBlockIncomeMult())   // gang 'plug' perk boost
  if (total > 0) { addHustle(total); commit() }
  return total
}

// DEV (TODO REMOVE BEFORE LAUNCH): wipe ALL block overrides — every block you
// recruited/poached (and any AI poaches) — back to the procedural default, so
// your turf resets to zero owned blocks. Backs the in-app "Reset Turf" button.
export function resetTurf() {
  overrides = {}
  commit()
  if (isSupabaseConfigured) {
    const uid = getUserId()
    if (uid) supabase.from('blocks').delete().eq('county_fips', COUNTY_FIPS).eq('owner_id', uid)
      .then(({ error }) => { if (error) console.warn('[blocks] reset delete failed', error) })
  }
}

// ---- global hourly payout clock ------------------------------------
// Block income pays out on a GLOBAL hourly tick — aligned to the top of every
// UTC hour, so the countdown is identical for every player worldwide (not a
// per-account timer). When the hour rolls over, accrued income is auto-banked.
// Income still accrues continuously underneath (capped 24h), so being away just
// means the next boundary you're present for banks the backlog.
const PAYOUT_PERIOD_MS  = 3_600_000               // 1 hour
const PAYOUT_BUCKET_KEY = 'pe_block_payout_bucket_v1'

// Payout event bus — fired with the Hustle amount whenever a payout banks, so
// any screen (e.g. the home card's chime) can react without owning the ticker.
const payoutListeners = new Set()
export function subscribePayout(fn) { payoutListeners.add(fn); return () => payoutListeners.delete(fn) }

// ms remaining until the next top-of-hour payout (same instant for everyone).
export function msToNextPayout() { return PAYOUT_PERIOD_MS - (Date.now() % PAYOUT_PERIOD_MS) }

function payoutBucket() { return Math.floor(Date.now() / PAYOUT_PERIOD_MS) }

// If the global hour rolled over since our last payout, auto-bank all block
// income. First ever run just starts the clock (no payout). Returns Hustle paid
// and notifies payout subscribers when paid > 0.
export function runDueBlockPayout() {
  let last = null
  try { const raw = localStorage.getItem(PAYOUT_BUCKET_KEY); if (raw != null) last = parseInt(raw, 10) } catch {}
  const bucket = payoutBucket()
  if (last == null || Number.isNaN(last)) {            // first run — start the clock
    try { localStorage.setItem(PAYOUT_BUCKET_KEY, String(bucket)) } catch {}
    return 0
  }
  if (bucket <= last) return 0
  const paid = collectAllBlocks()
  try { localStorage.setItem(PAYOUT_BUCKET_KEY, String(bucket)) } catch {}
  if (paid > 0) payoutListeners.forEach(fn => fn(paid))
  return paid
}

// APP-ROOT ticker — fires the hourly payout regardless of which screen is open.
// Holds NO state, so it never re-renders its host every second; payouts reach
// the UI via the block store's own listeners (commit) + subscribePayout.
export function useBlockPayoutTicker() {
  useEffect(() => {
    runDueBlockPayout()                          // catch up on mount (e.g. after being away)
    const iv = setInterval(runDueBlockPayout, 1000)
    return () => clearInterval(iv)
  }, [])
}

// DISPLAY-ONLY countdown for the Your Turf card. Re-renders each second to tick
// the clock; does NOT fire the payout (the app-root ticker owns that).
export function useNextPayoutCountdown() {
  const [ms, setMs] = useState(msToNextPayout())
  useEffect(() => {
    const iv = setInterval(() => setMs(msToNextPayout()), 1000)
    return () => clearInterval(iv)
  }, [])
  return ms
}
