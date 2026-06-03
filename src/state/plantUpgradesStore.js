// Plant upgrades store — per (plant_id, card_level) YIELD upgrade level.
//
// Mirrors the skill-card skillUpgradesStore (which tracks DMG for string ids),
// but for GROW (plant) cards: one upgradable stat, 'yield'. Each upgrade level
// adds PLANT_YIELD_PER_LEVEL to the plant's product per harvest. localStorage-
// only for now; joins the Supabase migration with the rest of the card data.
//
// Internal state shape: Map<"plantId:level", { yield }>  (yield = upgrade LEVEL)

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'pe_plant_upgrades_v1'

export const MAX_PLANT_UPGRADE_LEVEL = 20
export const PLANT_YIELD_PER_LEVEL   = 3            // +3 stash units per harvest per upgrade level
export const PLANT_UPGRADE_COST = (currentLevel) => 400 + currentLevel * 200   // in Hustle

const ZERO = { yield: 0 }

function keyOf(id, level) { return `${id}:${level}` }

let state = readLocalSeed()
const listeners = new Set()

// ---- public API ----------------------------------------------------

export function usePlantUpgrades() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}

export function readPlantUpgrade(map, plantId, level = 1) {
  return map.get(keyOf(plantId, level)) || ZERO
}

export function getPlantUpgrade(plantId, level = 1) {
  return state.get(keyOf(plantId, level)) || ZERO
}

// Bump the yield upgrade level by 1 for (plant_id, level). Capped.
export function upgradePlantStat(plantId, level) {
  const k = keyOf(plantId, level)
  const cur = state.get(k) || ZERO
  const next = (cur.yield || 0) + 1
  if (next > MAX_PLANT_UPGRADE_LEVEL) return
  const m = new Map(state)
  m.set(k, { yield: next })
  commit(m)
}

// On merge, the new (plant, toLevel) card inherits the higher yield level.
export function carryPlantUpgrades(plantId, fromLevel, toLevel) {
  const from = state.get(keyOf(plantId, fromLevel)) || ZERO
  if (from.yield === 0) return
  const toKey = keyOf(plantId, toLevel)
  const cur = state.get(toKey) || ZERO
  const merged = { yield: Math.max(cur.yield, from.yield) }
  if (merged.yield === cur.yield) return
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
      for (const [k, v] of Object.entries(obj)) if (v && (v.yield | 0) > 0) m.set(k, { yield: v.yield | 0 })
      return m
    }
  } catch {}
  return new Map()
}
