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
import { PVP_LEVEL_RANGE } from './gameData'

export const POOL_PER_LEVEL = 50   // depth available at each level (ids 0..49)

// How many to surface, per offset above the player's level. Weighted toward
// same-level (fair, 1× reward) with a thinning tail of higher-reward targets.
const VISIBLE_PLAN = [[0, 6], [1, 3], [2, 3], [3, 2], [4, 2], [5, 2]]

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

// The visible rival list for a player at `playerLevel`: same-level fair fights
// plus a thinning tail of higher-reward targets, all within the PvP range.
export function generateOpponents(playerLevel) {
  const out = []
  for (const [off, count] of VISIBLE_PLAN) {
    const level = playerLevel + off
    if (off > PVP_LEVEL_RANGE) break
    for (let i = 0; i < count; i++) out.push(generateOpponent(level, i))
  }
  return out
}
