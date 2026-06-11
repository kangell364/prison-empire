// Skill loadout store — which SKILL card is equipped in each Battle-Dice slot
// (2–12, eleven slots). This is the player's skill equivalent of the crew
// (crewStore equips player cards into crew slots). Only skill cards live here.
//
// When a roll lands on a slot that holds a skill, that skill fires for bonus
// attack (see BattleDiceModal). A skill occupies one slot at a time — equipping
// it elsewhere clears the previous slot, just like crew members.
//
// State shape: { [slot]: skillId }  (slot ∈ 2..12). localStorage-only for now.

import { useEffect, useState } from 'react'
import { SKILLS } from '../data/gameData'
import { getOwnedSkillTuples } from './skillCardsStore'
import { getSkillUpgrade, SKILL_DMG_PER_LEVEL } from './skillUpgradesStore'
import { getTileAffixes } from './skillAffixStore'

const KEY = 'pe_skill_loadout_v1'

// The eleven Battle-Dice slots (two d6 sum to 2..12).
export const SKILL_SLOTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

let state = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const obj = JSON.parse(raw)
      const out = {}
      for (const s of SKILL_SLOTS) if (obj[s]) out[s] = obj[s]
      return out
    }
  } catch {}
  return {}
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

// ---- public API ----------------------------------------------------

export function getSkillLoadout() { return state }

export function useSkillLoadout() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}

// Equip a skill into a slot. Pulls it out of any other slot it occupied.
export function setSkillSlot(slot, skillId) {
  if (!SKILL_SLOTS.includes(slot)) return
  const next = { ...state }
  for (const s of SKILL_SLOTS) if (next[s] === skillId) delete next[s]
  next[slot] = skillId
  commit(next)
}

export function clearSkillSlot(slot) {
  if (!state[slot]) return
  const next = { ...state }
  delete next[slot]
  commit(next)
}

// ---- combat hook ---------------------------------------------------

// The best owned level of a skill (merging produces higher-level cards), or 0
// if unowned.
function bestOwnedLevel(skillId) {
  let best = 0
  for (const t of getOwnedSkillTuples()) if (t.id === skillId && t.level > best) best = t.level
  return best
}

// Resolved loadout for a fight: { [slot]: { skillId, level, bonus } }. `bonus`
// is the per-fire attack the skill adds — its card level × effective per-hit
// damage (base perLevelAttack + DMG upgrades at that level). Empty slots and
// skills the player no longer owns are dropped.
export function getBattleSkillLoadout() {
  const out = {}
  for (const slot of SKILL_SLOTS) {
    const skillId = state[slot]
    if (!skillId) continue
    const skill = SKILLS.find(s => s.id === skillId)
    if (!skill) continue
    const level = bestOwnedLevel(skillId)
    if (level <= 0) continue
    const dmgUpgrade = getSkillUpgrade(skillId, level).dmg || 0
    const perHit = skill.perLevelAttack + dmgUpgrade * SKILL_DMG_PER_LEVEL
    // `potency` = the upgrade level; it scales the skill's EFFECT magnitude too
    // (see skillEffects.scaled), not just the per-hit nuke baked into `bonus`.
    // `affixes` = the random BONUS skills rolled onto this tile (Phase 3); they
    // fire alongside the signature when the slot lands.
    out[slot] = { skillId, level, bonus: level * perHit, potency: dmgUpgrade, affixes: getTileAffixes(skillId, level) }
  }
  return out
}
