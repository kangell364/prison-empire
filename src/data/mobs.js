// Mob (organized-crime org) reference data — the alliance layer above an
// individual player. A mob owns a mansion (the 50-slot pyramid HQ) and colors
// the overview map. See the gang/territory design memory for the full model.
//
// Phase A introduces this data; the pyramid/mansion UI lands in later phases.

import { AI_GANGS } from './gameData'

// The pyramid: 50 ranked slots, top→bottom (mafia titles). Each slot holds a
// placed card OR a recruited member player (mutually exclusive). weight = power
// multiplier + payout share — placeholders, to tune.
export const MOB_RANKS = [
  { key: 'don',         label: 'Don',         count: 1,  weight: 5 },
  { key: 'underboss',   label: 'Underboss',   count: 1,  weight: 4 },
  { key: 'consigliere', label: 'Consigliere', count: 1,  weight: 4 },
  { key: 'capo',        label: 'Capo',        count: 5,  weight: 3 },
  { key: 'soldier',     label: 'Soldier',     count: 5,  weight: 2 },
  { key: 'associate',   label: 'Associate',   count: 37, weight: 1 },
]

export const MOB_SLOT_TOTAL = MOB_RANKS.reduce((n, r) => n + r.count, 0)  // 50

// An empty 50-slot pyramid (all slots open) for a newly-founded mob.
export function emptyPyramid() {
  const slots = []
  MOB_RANKS.forEach(r => {
    for (let i = 0; i < r.count; i++) slots.push({ rank: r.key, card_id: null, player_id: null })
  })
  return slots
}

const MOB_COLORS = [
  '#e74c3c', '#e67e22', '#9b59b6', '#16a085', '#2980b9',
  '#c0392b', '#8e44ad', '#27ae60', '#d35400', '#34495e',
]

// AI mobs — stand-ins that hold business houses until real players exist.
// Seeded from the existing AI_GANGS names for now (rename to family names later).
export const AI_MOBS = AI_GANGS.map((name, i) => ({
  id: 'mob_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
  name,
  color: MOB_COLORS[i % MOB_COLORS.length],
  is_ai: true,
}))
