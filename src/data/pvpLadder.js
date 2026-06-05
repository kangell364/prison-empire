// PvP opponent ladder — procedural AI rivals so the Fight → Players tab is
// never empty, at any level from 1 to ~2,000. There's a deep pool (50) at every
// level; we surface a handful around the player so there's always a fair fight
// plus a few higher-reward stretch targets.
//
// These are a fallback/grind source: PvP is a quick DUEL (resets each bout,
// win/lose, repeatable) — so an over-leveled boss can never hard-wall you; you
// can always farm same-level rivals for XP to catch up. The named RANKED_PLAYERS
// in gameData stay as the leaderboard's flavor; this fills the actual fight list.

import { playerCombatStats } from './bossLadder'

export const POOL_PER_LEVEL = 50   // depth available at each level (ids 0..49)

// CENTERED band: opponents around YOUR level — a couple below, mostly at-level,
// a couple above — clamped so it never drops under level 1. (Was one-directional
// your-level→+5, which left a level-1 player facing only higher levels.) Counts
// sum to ~18 surfaced rivals.
const BAND_PLAN = [[-2, 2], [-1, 3], [0, 6], [1, 4], [2, 3]]

const HANDLE_PREFIX = ['Iron', 'Yard', 'Block', 'Steel', 'Mad', 'Slick', 'Big', 'Ghost', 'King', 'Stone', 'Cold', 'Quick', 'Trap', 'Razor', 'Boss', 'Smoke', 'Diesel', 'Loc', 'Shotta', 'Grim']
const HANDLE_CORE   = ['Mike', 'Rico', 'Tony', 'Chino', 'Mack', 'Vince', 'Loco', 'Dre', 'Cisco', 'Capo', 'King', 'Reyes', 'Goon', 'Shooter', 'Cash', 'Pesos', 'Don', 'Hova', 'Vato', 'Zilla']
const HANDLE_TAIL   = ['', '', '99', '305', '_TX', '_NY', 'god', '23', '_ATL', '187', 'OG', '_CA']
const EMOJIS        = ['👑', '🔥', '🦅', '🐊', '🌃', '💀', '🗡️', '🥊', '🎯', '🐺', '💰', '🚬', '♠️', '🔫', '🦍', '🐍', '⚡', '🎲']
const FACILITIES    = ['County Jail', 'State Prison', 'Federal Penn', 'Supermax']
const STATES        = ['TX', 'NY', 'CA', 'FL', 'IL', 'GA', 'LA', 'OH', 'AZ', 'NC', 'MI', 'PA']
const BIOS = [
  'Came up on the yard and never looked back. Owes nobody.',
  'Quiet until he isn\'t. Then it\'s already over.',
  'Runs a cell block like a business. You\'re late on payment.',
  'Lost once. Made sure the guy who beat him retired.',
  'All gas, no brakes. Picks fights to stay sharp.',
  'Smiles at the cameras, settles scores in the blind spots.',
]

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
// Negative-safe index: callers pass `h >> k`, and a signed right shift on a
// hash >= 2^31 goes negative — `negative % len` stays negative in JS, so the
// raw `arr[n % len]` returned undefined ~half the time (names like
// "Bigundefinedundefined", plus broken emoji/facility/state). Normalize first.
const pick = (arr, n) => arr[((n % arr.length) + arr.length) % arr.length]

// One AI rival, stable for a given (level, index) — the same rival always looks
// and fights the same, so the list is consistent as you re-enter / level up.
export function generateOpponent(level, index) {
  const h = hash(`pvp:${level}:${index}`)
  const base = playerCombatStats(level)
  const vAtk = 0.85 + ((h % 36) / 100)            // 0.85 .. 1.20
  const vDef = 0.85 + (((h >> 6) % 36) / 100)
  const vHp  = 0.90 + (((h >> 12) % 26) / 100)    // 0.90 .. 1.15
  const atk = Math.round(base.atk * vAtk)
  const def = Math.round(base.def * vDef)
  const hp  = Math.round(base.hp  * vHp)
  const handle = `${pick(HANDLE_PREFIX, h)}${pick(HANDLE_CORE, h >> 5)}${pick(HANDLE_TAIL, h >> 10)}`

  return {
    id: `ai-${level}-${index}`,
    name: handle,
    emoji: pick(EMOJIS, h >> 14),
    level,
    atk, def, hp,
    power: atk + def,                              // drives the dice modal's skill loadout
    facility: pick(FACILITIES, h >> 17),
    state: pick(STATES, h >> 20),
    wins:   30 + (h % 400),
    losses: 1 + ((h >> 8) % 60),
    bio: pick(BIOS, h >> 23),
    isAi: true,
  }
}

// Rebuild a fightable opponent from its stable id (`ai-{level}-{index}`) — used
// to fight revenge / hit-list targets stored only by id.
export function opponentFromId(id) {
  const m = /^ai-(\d+)-(\d+)$/.exec(id || '')
  return m ? generateOpponent(Number(m[1]), Number(m[2])) : null
}

// Seeded PRNG (mulberry32) — a given seed yields a stable shuffle, but bumping
// the seed rotates the lineup so you see DIFFERENT rivals each refresh.
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Pick `count` distinct indices from the 0..POOL_PER_LEVEL pool via the rng.
function pickIndices(count, rand) {
  const pool = Array.from({ length: POOL_PER_LEVEL }, (_, i) => i)
  const n = Math.min(count, pool.length)
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (pool.length - i))
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp
  }
  return pool.slice(0, n)
}

// The visible rival list for a player at `playerLevel`, CENTERED on their level
// and ROTATED by `seed` (random per refresh). ids stay `ai-{level}-{index}` so
// revenge / hit-list targets still rebuild via opponentFromId. Sorted so the
// closest-level rivals show first.
export function generateOpponents(playerLevel, seed = 0) {
  const out = []
  const seen = new Set()
  const rand = rng((seed >>> 0) ^ 0x9e3779b9)
  for (const [off, count] of BAND_PLAN) {
    const level = Math.max(1, playerLevel + off)
    for (const i of pickIndices(count, rand)) {
      const key = `${level}:${i}`
      if (seen.has(key)) continue            // bands can clamp to the same level (low levels)
      seen.add(key)
      out.push(generateOpponent(level, i))
    }
  }
  // Closest-level-first so the fair fights lead, stretch targets trail.
  out.sort((a, b) => Math.abs(a.level - playerLevel) - Math.abs(b.level - playerLevel))
  return out
}
