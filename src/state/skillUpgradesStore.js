// Skill upgrades store — per (skill_id, card_level) DMG upgrade level.
//
// Mirrors the player-card upgradesStore (which tracks ATK/DEF for numeric card
// ids), but for SKILL cards: one upgradable stat, 'dmg'. Each upgrade level
// adds SKILL_DMG_PER_LEVEL to the skill's per-hit damage. localStorage-only for
// now; joins the Supabase migration with the rest of the card data later.
//
// Internal state shape: Map<"skillId:level", { dmg }>  (dmg = upgrade LEVEL)

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'pe_skill_upgrades_v1'

export const MAX_SKILL_UPGRADE_LEVEL = 20
export const SKILL_DMG_PER_LEVEL     = 5            // +5 per-hit damage per upgrade level
export const SKILL_UPGRADE_COST = (currentLevel) => 400 + currentLevel * 200   // in Hustle

const ZERO = { dmg: 0 }

function keyOf(id, level) { return `${id}:${level}` }

let state = readLocalSeed()
const listeners = new Set()

// ---- public API ----------------------------------------------------

export function useSkillUpgrades() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}

export function readSkillUpgrade(map, skillId, level = 1) {
  return map.get(keyOf(skillId, level)) || ZERO
}

export function getSkillUpgrade(skillId, level = 1) {
  return state.get(keyOf(skillId, level)) || ZERO
}

// Bump the dmg upgrade level by 1 for (skill_id, level). Capped.
export function upgradeSkillStat(skillId, level) {
  const k = keyOf(skillId, level)
  const cur = state.get(k) || ZERO
  const next = (cur.dmg || 0) + 1
  if (next > MAX_SKILL_UPGRADE_LEVEL) return
  const m = new Map(state)
  m.set(k, { dmg: next })
  commit(m)
}

// On merge, the new (skill, toLevel) card inherits the higher dmg level.
export function carrySkillUpgrades(skillId, fromLevel, toLevel) {
  const from = state.get(keyOf(skillId, fromLevel)) || ZERO
  if (from.dmg === 0) return
  const toKey = keyOf(skillId, toLevel)
  const cur = state.get(toKey) || ZERO
  const merged = { dmg: Math.max(cur.dmg, from.dmg) }
  if (merged.dmg === cur.dmg) return
  const m = new Map(state)
  m.set(toKey, merged)
  commit(m)
}

// ---- internals -----------------------------------------------------

function commit(next) {
  state = next
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(state))) } catch {}
  listeners.forEach(fn => fn(state))
}

function readLocalSeed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const obj = JSON.parse(raw)
      const m = new Map()
      for (const [k, v] of Object.entries(obj)) if (v && (v.dmg | 0) > 0) m.set(k, { dmg: v.dmg | 0 })
      return m
    }
  } catch {}
  return new Map()
}
