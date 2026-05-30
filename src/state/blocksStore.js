// blocksStore — the block / loyalty-market economy (v1).
//
// The map is an infinite uniform grid of ~440m blocks. We do NOT store every
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
import { addHustle, spendHustle } from './profileStore'
import { PLAYER } from '../data/gameData'

export const GRID = 0.004              // ~440m block — MUST match the TurfMap grid
const KEY = 'pe_blocks_v1'

const POACH_MULT       = 1.10          // +10% per takeover
const PAYOUT_CUT       = 0.5           // displaced owner gets stake + this share of the premium
const DECAY_PER_HR     = 0.02          // loyalty decays 2%/hr toward its base when uncontested
const COOLDOWN_MS      = 60 * 1000     // re-poach lock after a takeover
// Block cap scales with player level (25 per level) — a soft anti-whale ceiling
// that doubles as a progression reward: low levels are gently capped, high
// levels are effectively uncapped. Level is static (PLAYER.level) for now;
// swap to the level store when it exists.
export const BLOCKS_PER_LEVEL = 25
export function blockCap() { return BLOCKS_PER_LEVEL * Math.max(1, PLAYER.level || 1) }
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

// Ambient (procedural) state for any cell — rival crews hold turf everywhere.
function blockDefault(gx, gy) {
  const h = cellRng(gx, gy, 0)
  const owner = h < 0.08 ? 'red' : h < 0.15 ? 'blue' : h < 0.20 ? 'purple' : null
  const tier = Math.floor(cellRng(gx, gy, 1) * 3)        // 0..2
  const baseLoyalty = 600 + tier * 700                   // 600 / 1300 / 2000
  const incomePerHr = 20 + tier * 40                     // 20 / 60 / 100
  const npc = NPC_NAMES[Math.floor(cellRng(gx, gy, 2) * NPC_NAMES.length)]
  return {
    owner, ownerKind: owner ? 'ai' : null, color: owner ? CREW_COLORS[owner] : null,
    loyalty: owner ? baseLoyalty : 0, baseLoyalty, incomePerHr, npc,
  }
}

// ---- store ---------------------------------------------------------

let overrides = load()
const listeners = new Set()
function load() { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) || {} } catch {} return {} }
function commit() { try { localStorage.setItem(KEY, JSON.stringify(overrides)) } catch {}; listeners.forEach(f => f(overrides)) }

export function subscribeBlocks(fn) { listeners.add(fn); return () => listeners.delete(fn) }
export function useBlocksVersion() {
  const [, set] = useState(0)
  useEffect(() => subscribeBlocks(() => set(v => v + 1)), [])
}

// Loyalty with decay applied (decays toward base once past the cooldown).
export function effectiveLoyalty(b) {
  if (!b.lastPoachAt) return b.loyalty
  const decayed = b.loyalty * Math.pow(1 - DECAY_PER_HR, hoursSince(b.lastPoachAt))
  return Math.max(b.baseLoyalty, Math.round(decayed))
}

export function getBlock(gx, gy) {
  const def = blockDefault(gx, gy)
  const o = overrides[cellKey(gx, gy)]
  const b = o ? { ...def, ...o } : def
  b.gx = gx; b.gy = gy
  b.color = b.owner ? CREW_COLORS[b.owner] : null
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

// AI crew takes one of YOUR blocks. You (a real displaced owner) get the payout
// — stake back + a cut of the premium — so a loss is a payday, not a wipeout.
// Returns { payout, crew, npc }.
export function aiPoachBlock(gx, gy, crew) {
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
  return { ok: true, cost }
}

// Poach a HELD block (buy out the member's loyalty for +10%). Returns
// { ok, reason?, cost }. The displaced owner is credited only if a real player
// (ambient AI has no recipient — the spend is a Hustle sink).
export function poach(gx, gy, homeTurf) {
  const b = getBlock(gx, gy)
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
  return yourBlocks().reduce((sum, b) => sum + (b.incomePerHr || 0), 0)
}

// Total uncollected (pending) Hustle waiting across all your blocks.
export function yourPendingIncome() {
  return yourBlocks().reduce((sum, b) => sum + pendingIncome(b.gx, b.gy), 0)
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
  if (total > 0) { addHustle(total); commit() }
  return total
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

// ---- DEV SEED (temporary) ------------------------------------------
// TODO REMOVE BEFORE LAUNCH. One-time-per-device seed that hands the player a
// starter empire of 50 owned blocks (a contiguous 10×5 patch around Houston) so
// the "Your Turf" card + turf map have real data to play with. Guarded by a
// localStorage flag so it only runs once and never fights the player's own
// recruit/poach/collect. Each block is left ~2h "uncollected" so the Collect
// flow has something to bank. Bypasses the block cap on purpose (it's a seed).
;(function devSeedBlocks() {
  const FLAG = 'pe_blocks_devseed_50_v1'
  try {
    if (localStorage.getItem(FLAG)) return
    const [cx, cy] = cellOf(-95.3698, 29.7604)   // Houston, TX
    const twoHoursAgo = Date.now() - 2 * 3_600_000
    let count = 0
    for (let dy = 0; dy < 5; dy++) {
      for (let dx = 0; dx < 10; dx++) {
        const gx = cx + dx, gy = cy + dy
        const b = getBlock(gx, gy)
        overrides[cellKey(gx, gy)] = {
          owner: 'you', ownerKind: 'you', npc: b.npc, baseLoyalty: b.baseLoyalty,
          incomePerHr: b.incomePerHr, loyalty: b.baseLoyalty, basePaid: 0,
          lastCollectedAt: twoHoursAgo, lastPoachAt: twoHoursAgo,
        }
        count++
      }
    }
    localStorage.setItem(FLAG, '1')
    commit()
    if (count) console.info(`[devSeed] granted ${count} starter blocks near Houston`)
  } catch {}
})()
