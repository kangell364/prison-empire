// Boss Ladder — procedural generator for the Fight screen's PvE tabs.
//
// Three tabs (Guards / The Yard / Kitchen), each an endless ladder of "waves".
// A wave is 10 bosses (slots 1..10) at a given LEVEL. Beat all 10 → the tab
// advances to the next wave (level + 1). Planned to run to ~2,000 levels, so
// every boss is GENERATED from (tab, level, slot) rather than hand-authored.
//
// Balance backbone (see progressionStore): the player's combat stats grow per
// level on the SAME curve the bosses scale against, so an at-level player wins
// the whole wave with slot 10 as a real sweat, while the NEXT wave (a level
// ahead) walls them until they level up. Damage uses a ratio model in
// BattleDiceModal, so fights always resolve and small stat gaps don't flip a
// fight between unwinnable and trivial.
//
// XP/scaling constants live here; the player power curve now comes from the
// trait economy (traitMath) so the ladder tracks however points are tuned.

import { playerCombatStats } from './traitMath'

export const SLOTS_PER_WAVE = 10

// Re-export so existing importers of bossLadder keep working. The yardstick is
// the "balanced at-level player" — atk/def/hp of someone who spent every earned
// trait point in an even spread (see traitMath.playerCombatStats).
export { playerCombatStats }

// ---- boss scaling (relative to an at-level player) ------------------
// Slot 1 is a warm-up; slot 10 is the wave's wall. Tuned so an at-level player
// narrowly wins slot 10 and crushes slot 1; a player one level under loses the
// next wave's slot 10 decisively.
const B_ATK = slot => 0.55 + 0.035 * slot   // slot1 .585×  → slot10 .90×
const B_DEF = slot => 0.55 + 0.035 * slot
const B_HP  = slot => 0.70 + 0.045 * slot   // slot1 .745× → slot10 1.15×

// Bosses NEVER heal — their HP persists between fights (see progressionStore).
// So a boss's difficulty is really "how much total HP must I grind through",
// not win/lose. Milestone (slot 10) bosses get a fat HP pool so a named boss
// takes a couple stamina bars to wear down and feels like a real wall.
const MILESTONE_HP_MULT = 2.6

export function bossStats(level, slot) {
  const p = playerCombatStats(level)
  const hpMult = B_HP(slot) * (slot === SLOTS_PER_WAVE ? MILESTONE_HP_MULT : 1)
  return {
    atk: Math.round(p.atk * B_ATK(slot)),
    def: Math.round(p.def * B_DEF(slot)),
    hp:  Math.round(p.hp  * hpMult),
  }
}

// ---- rewards --------------------------------------------------------
// XP ramp you specified: +50, +75, +100 … +275 across the 10 slots, with the
// base climbing per level so higher waves pay more.
export function bossXp(level, slot)     { return level * 50 + (slot - 1) * 25 }
export function bossHustle(level, slot) { return Math.round(bossXp(level, slot) * 0.5) }

// XP to go from `level` to `level + 1` = the sum of ALL 30 bosses (3 tabs × 10)
// at that level. So clearing all three tabs at your level = exactly one level.
//   = 3 × Σ_{s=1..10} (level·50 + (s-1)·25)  = 1500·level + 3375
export function xpForLevel(level) {
  let total = 0
  for (let s = 1; s <= SLOTS_PER_WAVE; s++) total += bossXp(level, s)
  return total * 3
}

// ---- flavor pools (deterministic per boss id) -----------------------

export const TABS = {
  guards:  { key: 'guards',  label: 'Guards',     icon: 'ti-shield',  emojis: ['👮', '🚨', '🥊', '🔦', '🪖'] },
  yard:    { key: 'yard',    label: 'The Yard',   icon: 'ti-barbell', emojis: ['😤', '💀', '🔪', '🐕', '🏋️', '🎭', '🩸', '👊'] },
  kitchen: { key: 'kitchen', label: 'Kitchen',    icon: 'ti-tools-kitchen-2', emojis: ['👨‍🍳', '🔪', '🍲', '🥩', '🍳', '🧂', '🔥'] },
}
export const TAB_ORDER = ['guards', 'yard', 'kitchen']

const GUARD_TITLES = ['CO', 'Sgt.', 'Officer', 'Lt.', 'Cpl.', 'Deputy', 'Capt.', 'Sarge', 'Brick', 'Boot']
const GUARD_NAMES  = ['Johnson', 'Briggs', 'Hale', 'Stokes', 'Mercer', 'Vance', 'Doyle', 'Kowalski', 'Pruitt', 'Rourke', 'Hargrove', 'Maddox', 'Cain', 'Boon', 'Tackett', 'Grimes', 'Fletcher', 'Ramsey', 'Dunlap', 'Voss']

const YARD_TAGS  = ['Bully', 'Tattoo', 'Mad Dog', 'Knuckles', 'Scarface', 'Razor', 'Bruiser', 'Smiley', 'Lefty', 'Iron', 'Bricktop', 'Snake', 'Crazy', 'Big', 'Slick', 'Ghost']
const YARD_NAMES = ['Brad', 'Tommy', 'Vic', 'Marco', 'Tank', 'Cisco', 'Dre', 'Hector', 'Pauly', 'Reggie', 'Moose', 'Tyrone', 'Eddie', 'Sal', 'Boomer', 'Diesel']

const KITCHEN_TAGS  = ['Chef', 'Greasy', 'Soup', 'Dishpit', 'Cleaver', 'Sous', 'Butcher', 'Grill', 'Saucy', 'Ladle', 'Burner', 'Hash', 'Spuds', 'Cutter']
const KITCHEN_NAMES = ['Chaos', 'Carl', 'Vinny', 'Gordo', 'Manny', 'Rosa', 'Lou', 'Benny', 'Hodge', 'Mack', 'Otis', 'Curtis', 'Dom', 'Reyes', 'Boone']

const BIOS = {
  guards:  ['Runs this block with a forgotten badge and a heavy hand.', 'Bent, mean, and built. Collects more than commissary.', 'Twenty years on the wall, zero patience left.', 'Keys on the belt, grudge in the chest.'],
  yard:    ['Owns a stretch of fence and everyone who walks it.', 'Came in light, left a legend on the weight pile.', 'Settles every debt the same way — with knuckles.', 'Bites first, talks never.'],
  kitchen: ['Runs the kitchen black market out of the walk-in.', 'His soup is poisoned. So is his right hook.', 'Trades favors in grease and pain.', 'Owns the knives and the men who hold them.'],
}

// FNV-1a — deterministic seed from a boss id, so a given (tab,level,slot)
// always produces the same name/emoji.
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const pick = (arr, n) => arr[n % arr.length]

function flavor(tab, level, slot) {
  const h = hash(`${tab}:${level}:${slot}`)
  if (tab === 'guards') return { name: `${pick(GUARD_TITLES, h)} ${pick(GUARD_NAMES, h >> 5)}`, emoji: pick(TABS.guards.emojis, h >> 11), bio: pick(BIOS.guards, h >> 17) }
  if (tab === 'kitchen') return { name: `${pick(KITCHEN_TAGS, h)} ${pick(KITCHEN_NAMES, h >> 5)}`, emoji: pick(TABS.kitchen.emojis, h >> 11), bio: pick(BIOS.kitchen, h >> 17) }
  return { name: `${pick(YARD_TAGS, h)} ${pick(YARD_NAMES, h >> 5)}`, emoji: pick(TABS.yard.emojis, h >> 11), bio: pick(BIOS.yard, h >> 17) }
}

// ---- hand-authored boss skill loadouts ------------------------------
// Per-boss skill cards, keyed by boss id (`${tab}-${level}-${slot}`). Shape:
//   { [diceSlot 2..12]: { skillId, level, dmgUpgrade } }
// These are INDEPENDENT of the player's skill cards/levels/upgrades — a boss
// owning a SKULL CRUSHER at level N is its own copy. Bosses NOT listed here
// fight with no skills (empty loadout). Combat reads this via
// opponentSkillLoadout(); damage = level × (perLevelAttack + dmgUpgrade × 5).
export const BOSS_SKILL_LOADOUTS = {
  'guards-1-1': { 9: { skillId: 'skull_crusher', level: 1, dmgUpgrade: 0 } },
}

// ---- the generator --------------------------------------------------

// Build one boss. `id` is stable: `${tab}-${level}-${slot}`.
export function generateBoss(tab, level, slot) {
  const stats = bossStats(level, slot)
  const milestone = slot === SLOTS_PER_WAVE         // slot 10 — the "named" boss
  let look = flavor(tab, level, slot)

  // Pin CO Johnson as the very first Guards milestone (keeps his real card art).
  if (tab === 'guards' && level === 1 && slot === SLOTS_PER_WAVE) {
    look = { name: 'CO Johnson', emoji: '👮', bio: 'Bent, mean, built. Runs the Intake Block with his fists and a forgotten badge. Boss of the block.', avatar: '/co-johnson.jpg' }
  }

  // Pin custom card art on the first Guards bosses (wave 1). Art is optimized
  // to the player-card pipeline — ~720px-wide JPG (see scripts/optimize-art.py),
  // so a boss tile loads as light as a player card (~60 KB, not multi-MB).
  if (tab === 'guards' && level === 1 && slot === 1) {
    look = { ...look, avatar: '/guard-boss-1.jpg' }
  }
  if (tab === 'guards' && level === 1 && slot === 2) {
    look = { ...look, avatar: '/guard-boss-2.jpg' }
  }
  if (tab === 'guards' && level === 1 && slot === 3) {
    look = { ...look, avatar: '/guard-boss-3.jpg' }
  }
  if (tab === 'guards' && level === 1 && slot === 4) {
    look = { ...look, avatar: '/guard-boss-4.jpg' }
  }
  if (tab === 'guards' && level === 1 && slot === 5) {
    look = { ...look, avatar: '/guard-boss-5.jpg' }
  }

  return {
    id: `${tab}-${level}-${slot}`,
    tab, level, slot,
    name: look.name,
    emoji: look.emoji,
    avatar: look.avatar,
    bio: look.bio,
    ...stats,                       // atk, def, hp
    power: stats.atk + stats.def,   // drives the dice modal's skill loadout count
    xp:     bossXp(level, slot),
    hustle: bossHustle(level, slot),
    boss: milestone,                // gold styling + BOSS badge for the wall boss
    milestone,
    cardDrop: milestone,            // milestone bosses drop a card
    final: false,
    // Hand-authored skill loadout (independent of the player). Defaults to an
    // empty object so non-authored bosses fight with no skills.
    skills: BOSS_SKILL_LOADOUTS[`${tab}-${level}-${slot}`] || {},
  }
}

// Build the full wave of 10 bosses for a tab at a level.
export function generateWave(tab, level) {
  return Array.from({ length: SLOTS_PER_WAVE }, (_, i) => generateBoss(tab, level, i + 1))
}
