// Builds opposing crews for crew-vs-crew battles. Pulls from existing
// named characters (RANKED_PLAYERS + BATTLE_ENEMIES + HIT_LIST) so opponents
// feel like real rivals, not generic mooks.
//
// Each opponent character is normalized into the same card shape that
// crewStore.atkOf / defOf expects — they read either { muscle, cred } or
// { power }. Most BATTLE_ENEMIES / RANKED_PLAYERS have `power`, so that's
// the path taken here.

import { RANKED_PLAYERS, BATTLE_ENEMIES } from './gameData'

const RARITY_BY_POWER = [
  { min: 400, rarity: 'legendary' },
  { min: 200, rarity: 'epic'      },
  { min: 100, rarity: 'rare'      },
  { min: 50,  rarity: 'uncommon'  },
  { min: 0,   rarity: 'common'    },
]

function rarityFor(power = 0) {
  return (RARITY_BY_POWER.find(r => power >= r.min) || {}).rarity || 'common'
}

// Lift a named character into a card-shaped object (has .power so atkOf/defOf
// reach the power-based branch). The original ranked_players / battle_enemies
// objects already carry name + emoji + avatar — we just add rarity.
function asCard(c) {
  if (!c) return null
  return {
    id:     c.id,
    name:   c.name,
    emoji:  c.emoji,
    avatar: c.avatar,
    power:  c.power,
    rarity: c.rarity || rarityFor(c.power),
    special: c.archetype || 'Crew Member',
    bio:     c.bio,
  }
}

// Pull `n` distinct cards from a pool, seeded by a string. Deterministic so
// the same opponent always fields the same crew across reloads.
function pickN(pool, n, seedStr) {
  let s = 0
  for (let i = 0; i < seedStr.length; i++) s = (s * 31 + seedStr.charCodeAt(i)) >>> 0
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  const arr = pool.slice()
  const out = []
  while (out.length < n && arr.length) {
    const i = Math.floor(rng() * arr.length)
    out.push(arr.splice(i, 1)[0])
  }
  return out
}

// Practice-mode opponent — strong but beatable. Pulls heavy hitters from
// RANKED_PLAYERS for the leader + some members, fleshes out the bench with
// BATTLE_ENEMIES and HIT_LIST entries.
export function buildPracticeCrew(seed = 'practice') {
  const leaders = RANKED_PLAYERS.filter(p => !p.isYou && p.power >= 350)
  const benchPool = [
    ...RANKED_PLAYERS.filter(p => !p.isYou && p.power < 350),
    ...BATTLE_ENEMIES,
  ]
  const leader = pickN(leaders, 1, seed + ':leader')[0]
  const members = pickN(benchPool, 11, seed + ':members')

  return {
    name: leader ? `${leader.name}'s Crew` : 'Rival Crew',
    leader: asCard(leader),
    members: members.map(asCard),
  }
}
