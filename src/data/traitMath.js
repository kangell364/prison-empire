// Trait math — the single, PURE source of truth for how the five upgradable
// traits turn into real stats, and for the trait-point economy that drives all
// 2,000 player levels. No React, no localStorage — so the boss/PvP ladders and
// the player's live stat store can both import it without cycles.
//
// Design (locked with the user):
//   * Full integrated growth — trait points ARE your per-level growth. Every
//     trait feeds a real stat: Muscle→ATK, Cred→DEF, Toughness→Health pool,
//     Hustle→Stamina, Smarts→Knowledge.
//   * Scaling grant — points per level rise with level so a level's allocation
//     stays a meaningful slice of your (growing) power, instead of the old flat
//     "3 points" that was game-breaking at L1 and noise by L100.
//   * The boss yardstick is DERIVED from the expected (balanced) spend at a
//     level — so bosses follow whatever the points do and the ladder stays
//     tuned at every level. Spend your points → you stay at-level; hoard or
//     min-max → you trade one axis for another.

export const TRAIT_IDS = ['hustle', 'toughness', 'smarts', 'muscle', 'cred']

// What ONE point in a trait adds to its stat. Calibrated so that a balanced
// at-level-1 player (5 points, one per trait) reproduces the original proven
// curve floor exactly: ATK 20 / DEF 15 / HP 200. The ATK:DEF:HP ratio (10:8:40)
// matches the old linear curve, so fight pacing (~rounds to kill) is preserved.
export const PER_POINT = {
  muscle:    10,   // → ATK
  cred:       8,   // → DEF
  toughness: 40,   // → max Health (this IS the combat HP pool)
  hustle:     2,   // → max Stamina (more rolls before resting)
  smarts:     5,   // → max Knowledge (unlocks/levels skills)
}

// Innate stats at zero trait points (a raw rookie). Points stack on top.
export const STAT_FLOOR = {
  atk: 10,
  def: 7,
  hp: 160,
  stamina: 100,    // keeps the old flat 100 as the floor; Hustle is upside
  knowledge: 0,
}

// Points granted on reaching a level: 5 at low levels, climbing 1 per 10 levels.
//   L1–9: 5   L10–19: 6   …   L100: 15   L1000: 105
export function pointsForLevel(level) {
  return 5 + Math.floor(Math.max(1, level) / 10)
}

// Total points a player has earned by the time they're AT `level` — the sum of
// every level's grant from 1..level. Closed form (no loop, safe to call in
// render for any level up to 2,000+):
//   Σ 5            = 5·L
//   Σ floor(k/10)  = 5q(q-1) + q(r+1),  q=⌊L/10⌋, r=L−10q
export function totalPointsEarned(level) {
  const L = Math.max(1, Math.floor(level))
  const q = Math.floor(L / 10)
  const r = L - 10 * q
  return 5 * L + (5 * q * (q - 1) + q * (r + 1))
}

// Real combat/pool stats from a concrete trait allocation (point counts per
// trait). Used for BOTH the live player (their actual spend) and the yardstick
// (the expected spend) — same formula, different inputs.
export function statsFromTraits(traits = {}) {
  const m = traits.muscle    || 0
  const c = traits.cred      || 0
  const t = traits.toughness || 0
  const h = traits.hustle    || 0
  const s = traits.smarts    || 0
  return {
    atk:          STAT_FLOOR.atk       + PER_POINT.muscle    * m,
    def:          STAT_FLOOR.def       + PER_POINT.cred      * c,
    hp:           STAT_FLOOR.hp        + PER_POINT.toughness * t,
    staminaMax:   STAT_FLOOR.stamina   + PER_POINT.hustle    * h,
    knowledgeMax: STAT_FLOOR.knowledge + PER_POINT.smarts    * s,
  }
}

// The "balanced at-level player": all earned points spread evenly across the
// five traits. This is the reference the boss/PvP ladders scale against, so the
// ladder tracks the point economy automatically.
export function expectedTraitsAtLevel(level) {
  const per = totalPointsEarned(level) / TRAIT_IDS.length
  return { hustle: per, toughness: per, smarts: per, muscle: per, cred: per }
}

// Boss/PvP yardstick stats at a level — atk/def/hp of the balanced at-level
// player. (Replaces the old hand-tuned linear curve; reproduces it at L1.)
export function playerCombatStats(level) {
  const s = statsFromTraits(expectedTraitsAtLevel(level))
  return { atk: Math.round(s.atk), def: Math.round(s.def), hp: Math.round(s.hp) }
}
