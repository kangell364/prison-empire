// Game Data — Prison Empire

import { playerCombatStats } from './traitMath'

// Give a named NPC (ranked players, leaderboard rivals) combat stats on the
// CURRENT build's scale, derived from their level via the same yardstick the
// bosses + fightable rivals use — so the leaderboard, the character-detail card,
// and an actual fight all agree. Variance is deterministic per id/name (stable
// across renders/sessions) and mirrors pvpLadder.generateOpponent's spread, so a
// tougher-looking veteran really is tougher. Overwrites any legacy `power`.
function npcRng(seed) {
  let h = 2166136261
  const s = String(seed)
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  h >>>= 0
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h >>>= 0; return h / 4294967296 }
}
function withCombat(p) {
  const base = playerCombatStats(p.level || 1)
  const rng = npcRng(p.id || p.name || 'x')
  const atk = Math.round(base.atk * (0.85 + rng() * 0.35))   // 0.85..1.20
  const def = Math.round(base.def * (0.85 + rng() * 0.35))
  const hp  = Math.round(base.hp  * (0.90 + rng() * 0.25))   // 0.90..1.15
  return { ...p, atk, def, hp, power: atk + def }
}

export const PLAYER = {
  name: 'SlickRico',
  level: 42,
  xp: 6820,
  xpNext: 10000,
  power: 284,
  loyalty: 94,
  rank: 4,
  facility: 'Federal Penn',
  state: 'Texas',
  archetype: 'Con Artist',          // Cat-Champions "breed" equivalent
  primaryTrait: 'hustle',           // auto-levels each new level-up
  traitPoints: 3,                   // unspent points (decoupled from level for v1)
  // PvP / skill state
  dailyKills: 0,
  // No skills learned/equipped — the old demo skill was removed (see SKILLS).
  // Real persistence comes with the Supabase pass.
  learnedSkills:   {},
  equippedSkills:  {},
  lastSkillUpgradeLevel: 0,         // skill upgrades are gated to 1 per player level
  // Trait values — the upgradable Stats. Card stats give the starting baseline;
  // additional points from level-ups and upgrades stack on top.
  traits: {
    hustle:    15,
    toughness: 75,
    smarts:    14,
    muscle:    6,
    cred:      12,
  },
  // Current resource pools (current / max). Max is derived from traits in the
  // Profile screen (e.g., healthMax = toughness × 25).
  pools: {
    health:    1484,
    stamina:   78,
    knowledge: 0,
  },
  card: {
    id: 'slick_rico',
    name: 'Slick Rico',
    emoji: '🤵',
    avatar: '/slickrico.jpg',      // optional artwork — falls back to emoji when missing
    rarity: 'epic',
    rarityColor: '#a855f7',
    hustle: 15,
    muscle: 6,
    smarts: 14,
    cred: 12,
    special: 'Con Artist',
    specialDesc: '+20% attack bonus on missions',
  }
}

// Trait definitions — keyed by trait id. `perPoint` describes what one point
// of investment yields. `pool` says which pool's max is derived from this trait
// (null = no pool, just used in combat formulas).
export const TRAITS = [
  { id: 'hustle',    label: 'Hustle',    icon: 'ti-flame',    color: '#c9a84c',
    perPoint: 2,  poolMax: 'stamina',
    description: 'Each Hustle point increases max Stamina by 2.',
    detail: 'More stamina lets you push more missions and brawls before resting.' },
  { id: 'toughness', label: 'Toughness', icon: 'ti-heart',    color: '#e74c3c',
    perPoint: 40, poolMax: 'health',
    description: 'Each Toughness point increases max Health by 40.',
    detail: 'Higher toughness means you absorb beatings without going down. Your Health pool is what you fight on.' },
  { id: 'smarts',    label: 'Smarts',    icon: 'ti-brain',    color: '#4a9eff',
    perPoint: 5,  poolMax: 'knowledge',
    description: 'Each Smarts point increases max Knowledge by 5.',
    detail: 'Knowledge unlocks better skills, schemes, and yard influence.' },
  { id: 'muscle',    label: 'Muscle',    icon: 'ti-barbell',  color: '#f0d080',
    perPoint: 10, poolMax: null,
    description: 'Each Muscle point increases attack damage by 10.',
    detail: 'Muscle cuts through enemy defense — harder than gear-based bonuses.' },
  { id: 'cred',      label: 'Cred',      icon: 'ti-star',     color: '#a855f7',
    perPoint: 8, poolMax: null,
    description: 'Each Cred point increases defense by 8.',
    detail: 'Street credibility makes enemies think twice — soaks defense-piercing hits.' },
]

export const RESOURCES = {
  hustle: { value: 7420, max: 10000, color: '#c9a84c', icon: 'ti-flame' },
  steel:  { value: 3210, max: 8000,  color: '#4a9eff', icon: 'ti-shield' },
  crew:   { value: 5,    max: 8,     color: '#a855f7', icon: 'ti-users'  },
  snitch: { value: 1,    max: 3,     color: '#e74c3c', icon: 'ti-eye-off'},
}

export const CITY = {
  name: 'Houston',
  state: 'TX',
  tier: 3,
  tierName: 'Major City',
  hustle_per_hr: 420,
  steel_per_hr: 180,
  days_held: 3,
  hours_held: 14,
  defense: 68,
}

export const INCOMING_ATTACK = {
  attacker: 'YardBoss99',
  attacker_power: 541,
  city: 'Houston',
  timer_seconds: 14 * 60 + 32,
}

export const CREW = [
  { id: 1, name: 'Slick Rico', emoji: '🤵', power: 68, rarity: 'epic',     locked: false },
  { id: 2, name: 'Big T',      emoji: '💪', power: 54, rarity: 'rare',     locked: false },
  { id: 3, name: 'Professor',  emoji: '🧠', power: 42, rarity: 'uncommon', locked: false },
  { id: 4, name: 'OG Marcus',  emoji: '👴', power: 38, rarity: 'uncommon', locked: false },
  { id: 5, name: 'Tiny',       emoji: '🤏', power: 32, rarity: 'common',   locked: false },
  { id: 6, name: 'Locked',     emoji: '',   power: 0,  rarity: 'locked',   locked: true,  unlockLevel: 50  },
  { id: 7, name: 'Locked',     emoji: '',   power: 0,  rarity: 'locked',   locked: true,  unlockLevel: 65  },
  { id: 8, name: 'Locked',     emoji: '',   power: 0,  rarity: 'locked',   locked: true,  unlockLevel: 80  },
]

// Home-screen leaderboard preview. Levels mirror the matching RANKED_PLAYERS so
// withCombat puts everyone on the current build's scale (no more legacy ~200-900
// powers sitting next to multi-thousand fight stats).
export const LEADERBOARD = [
  { rank: 1, name: 'IronMike_TX',   emoji: '👑', facility: 'Supermax',     state: 'Texas', level: 88, isYou: false },
  { rank: 2, name: 'YardBoss99',    emoji: '🔥', facility: 'Federal Penn', state: 'Texas', level: 67, isYou: false },
  { rank: 3, name: 'TexasCartel',   emoji: '💎', facility: 'Federal Penn', state: 'Texas', level: 61, isYou: false },
  { rank: 4, name: 'SlickRico',     emoji: '🤵', avatar: '/slickrico.jpg', facility: 'Federal Penn', state: 'Texas', level: 42, isYou: true  },
  { rank: 5, name: 'HoustonKing',   emoji: '🏙️', facility: 'State Prison', state: 'Texas', level: 47, isYou: false },
].map(withCombat)

// CREW CARDS — the 100-common collection from CREW LIST.txt. Each is one
// street-gang member with an explicit ATK/DEF (baseAtk/baseDef in crewStore read
// `atk`/`def` directly when present, instead of deriving from traits). Crew ids
// are offset +100 from their CREW LIST number (CARD 1 -> id 101) so they never
// collide with the legacy player-card ids (1-8) sitting in old saves. `archetype`,
// `bonus`, `weakness` are flavor for now; they wire into combat later.
export const CARDS_COLLECTION = [
  { id: 101, no: 1, name: 'Outcast', emoji: '🏍️', avatar: '/crew-1.webp', face: '/crew-1-face.webp', rarity: 'common',
    archetype: 'OUTLAW', atk: 44, def: 18, special: 'Lone Wolf',
    bonus: '+8% ATK when fighting alone',
    weakness: '-10% ATK when his crew outnumbers the enemy',
    bio: 'Long hair, heavy mustache, a battered leather cut with a 13 patch and gold round his neck. Rides alone and likes it that way — deadliest with nobody watching his back, and itchy the moment he is boxed in by his own crew.' },
  { id: 102, no: 2, name: 'Lil Smoke', emoji: '🚬', avatar: '/crew-2.webp', face: '/crew-2-face.webp', rarity: 'common',
    archetype: 'BRUISER', atk: 44, def: 18, special: 'Outnumber',
    bonus: '+8% ATK when his crew outnumbers the enemy',
    weakness: '-10% DEF when fighting alone',
    bio: 'Short, wiry, hood up, blunt tucked behind the ear and smoke always curling. Hits harder when the block has his back — and folds a little when he is left holding it alone.' },
  { id: 103, no: 3, name: 'Re-Up', emoji: '💵', avatar: '/crew-3.webp', face: '/crew-3-face.webp', rarity: 'common',
    archetype: 'STRIKER', atk: 38, def: 26, special: 'Skim',
    bonus: '+10% Hustle from a winning fight (skims every score)',
    weakness: '-8% DEF when the bank is empty',
    bio: 'Lean and always counting — a fat knot of bills in one hand, a duffel over the shoulder. Skims a little off every score he wins, but he is shaky when the bank runs dry.' },
  { id: 104, no: 4, name: 'Dukes', emoji: '🥊', avatar: '/crew-4.webp', face: '/crew-4-face.webp', rarity: 'common',
    archetype: 'BRAWLER', atk: 32, def: 32, special: 'First Strike',
    bonus: '+6% ATK on the first strike of a fight',
    weakness: '-6% ATK once below half health',
    bio: 'Solid, taped fists up, busted lip he never bothers to fix. Comes out swinging hard — fades a touch once the tank runs low.' },
  { id: 105, no: 5, name: 'Scrappy', emoji: '👟', avatar: '/crew-5.webp', face: '/crew-5-face.webp', rarity: 'common',
    archetype: 'RUNNER', atk: 48, def: 12, special: 'Dodge',
    bonus: '12% chance to dodge the first incoming hit',
    weakness: 'takes +15% damage from heavy hitters',
    bio: 'Small, fast, all mean grin and untied high-tops. Slips the first shot more often than not — but a real heavy hitter folds him fast.' },
  { id: 106, no: 6, name: 'Ghost', emoji: '👻', avatar: '/crew-6.webp', face: '/crew-6-face.webp', rarity: 'common',
    archetype: 'RUNNER', atk: 46, def: 12, special: 'Nightstalker',
    bonus: '+10% ATK at night',
    weakness: '-12% ATK in daylight',
    bio: 'Half-faded into the shadow, only the eyes lit. Deadly after dark, useless once the sun is up.' },
  { id: 107, no: 7, name: 'Pelican', emoji: '👀', avatar: '/crew-7.webp', face: '/crew-7-face.webp', rarity: 'common',
    archetype: 'WALL', atk: 18, def: 44, special: 'Home Turf',
    bonus: '+8% DEF when defending home turf',
    weakness: '-10% DEF when attacking away',
    bio: 'Tall, lanky, perched on the stoop with a watchful slouch. Immovable on his own block, soft once he leaves it.' },
  { id: 108, no: 8, name: 'Quickdraw', emoji: '💨', avatar: '/crew-8.webp', face: '/crew-8-face.webp', rarity: 'common',
    archetype: 'BRUISER', atk: 46, def: 18, special: 'Opener',
    bonus: '+10% ATK on the opening exchange',
    weakness: '-8% ATK if the fight drags past 3 rounds',
    bio: 'Wiry, twitchy hands hovering at the waistband. First to move every time — but he gasses out if it turns into a war.' },
  { id: 109, no: 9, name: 'Two-Step', emoji: '🕺', avatar: '/crew-9.webp', face: '/crew-9-face.webp', rarity: 'common',
    archetype: 'STRIKER', atk: 36, def: 24, special: 'Counter',
    bonus: '8% chance to counter after taking a hit',
    weakness: '-6% DEF against grapplers',
    bio: 'Lean and athletic, always mid bob-and-weave. Make him eat one and he might fire two back — just keep him off the mat.' },
  { id: 110, no: 10, name: 'Cinder', emoji: '🔥', avatar: '/crew-10.webp', face: '/crew-10-face.webp', rarity: 'common',
    archetype: 'BRUISER', atk: 42, def: 20, special: 'Finisher',
    bonus: '+8% ATK while the enemy is below half health',
    weakness: '-10% DEF on the opening exchange',
    bio: 'Wild-eyed, a zippo flame lighting the face. Smells blood and pours it on — but he leaves himself wide open early.' },
  { id: 111, no: 11, name: 'Mumbles', emoji: '🤫', avatar: '/crew-11.webp', face: '/crew-11-face.webp', rarity: 'common',
    archetype: 'GUARD', atk: 24, def: 36, special: 'Hard Read',
    bonus: 'enemy ATK -5% on their first strike (hard to read)',
    weakness: '-8% ATK (never commits fully)',
    bio: 'Low cap, face shadowed, lips barely moving. Impossible to read on the open — but he never quite commits.' },
  { id: 112, no: 12, name: 'Knuckles', emoji: '🤜', avatar: '/crew-12.webp', face: '/crew-12-face.webp', rarity: 'common',
    archetype: 'BRUISER', atk: 44, def: 16, special: 'Melee',
    bonus: '+10% ATK in a melee (blades & fists)',
    weakness: '-12% DEF against ranged attackers',
    bio: 'Stocky, scarred, brass on both hands and a permanent scowl. Murder up close, helpless against anyone who keeps their distance.' },
  { id: 113, no: 13, name: 'Greasy Lou', emoji: '🔧', avatar: '/crew-13.webp', face: '/crew-13-face.webp', rarity: 'common',
    archetype: 'GUARD', atk: 22, def: 38, special: 'Slip',
    bonus: '10% chance to slip a grab and reset',
    weakness: '-6% ATK (more talk than action)',
    bio: 'Slick hair, stained mechanic jumpsuit, a fixer who talks more than he throws. Wriggles out of trouble; rarely starts any.' },
  { id: 114, no: 14, name: 'Pockets', emoji: '🧤', avatar: '/crew-14.webp', face: '/crew-14-face.webp', rarity: 'common',
    archetype: 'RUNNER', atk: 50, def: 14, special: 'Pickpocket',
    bonus: '+15% Hustle from a win where the enemy never lands a hit (clean pickpocket)',
    weakness: '-15% DEF when caught flat-footed',
    bio: 'Wiry, hands buried in an oversized coat, already counting your money. Cleans you out if you never touch him — but caught flat-footed he is done.' },
  { id: 115, no: 15, name: 'Slim Jaws', emoji: '🦷', avatar: '/crew-15.webp', face: '/crew-15-face.webp', rarity: 'common',
    archetype: 'BRUISER', atk: 40, def: 22, special: 'Desperate',
    bonus: '+8% ATK when outnumbered (fights desperate)',
    weakness: '-8% DEF when the crew is full (gets lazy)',
    bio: 'Gaunt, long reach, hollow cheeks and a gold grill. Fights like a cornered animal when the odds are bad, coasts when they are good.' },
  { id: 116, no: 16, name: 'Domino', emoji: '🎲', avatar: '/crew-16.webp', face: '/crew-16-face.webp', rarity: 'common',
    archetype: 'BRAWLER', atk: 30, def: 30, special: 'Revenge',
    bonus: '+6% ATK for each ally already knocked out (revenge)',
    weakness: '-6% DEF on round one',
    bio: 'Lean gambler flicking a domino, dice inked on the neck. Gets meaner with every man you drop — slow to wake up, though.' },
  { id: 117, no: 17, name: 'Razor Ray', emoji: '🔪', avatar: '/crew-17.webp', face: '/crew-17-face.webp', rarity: 'common',
    archetype: 'RUNNER', atk: 50, def: 12, special: 'Blades',
    bonus: '+10% ATK with blades',
    weakness: 'takes +18% damage once hit (no defense)',
    bio: 'Thin, pale, all nervous energy and a flashing box cutter. Carves people up — but one clean hit and he comes apart.' },
  { id: 118, no: 18, name: 'Fat Stacks', emoji: '💰', avatar: '/crew-18.webp', face: '/crew-18-face.webp', rarity: 'common',
    archetype: 'WALL', atk: 16, def: 46, special: 'Bankroll',
    bonus: '+8% DEF while holding the bank lead',
    weakness: '-10% ATK (slow, content to sit)',
    bio: 'Short, heavyset, rings on every finger and a smug grin. Hardest to move when he is up — never in a hurry to do the moving.' },
  { id: 119, no: 19, name: 'Creeper', emoji: '🌙', avatar: '/crew-19.webp', face: '/crew-19-face.webp', rarity: 'common',
    archetype: 'STRIKER', atk: 38, def: 22, special: 'Nightstalker',
    bonus: '+10% ATK at night',
    weakness: '-10% ATK in daylight',
    bio: 'Lean, hood drawn low, easing out from an alley you did not clock. Owns the dark; daylight is not his friend.' },
  { id: 120, no: 20, name: 'Hollow', emoji: '💀', avatar: '/crew-20.webp', face: '/crew-20-face.webp', rarity: 'common',
    archetype: 'WALL', atk: 18, def: 46, special: 'Last Stand',
    bonus: '+6% DEF when below half health (digs in)',
    weakness: '-8% ATK against fresh opponents',
    bio: 'Hollow-eyed, scarred, weathered — simply refuses to go down. Hardest to finish when he is nearly finished.' },
  { id: 121, no: 21, name: 'Tank', emoji: '🛡️', avatar: '/crew-21.webp', face: '/crew-21-face.webp', rarity: 'common',
    archetype: 'BODY', atk: 14, def: 50, special: 'Front Line',
    bonus: '+8% DEF on the front line (defends first)',
    weakness: '-15% ATK against runners',
    bio: 'Enormous, bald, neck tattooed, arms crossed like a door. Anchors the front line — just do not ask him to chase anybody.' },
]

// Cards a new player starts with. Empty for the crew-card era: My Crew starts
// empty until you collect crew cards (via the Commissary pull). The SQL signup
// trigger (supabase/migrations/0002_owned_cards.sql) still seeds the legacy ids
// 1-6, but those are no longer in CARDS_COLLECTION so they resolve to nothing in
// the UI — update that migration when the backend crew-card table lands.
export const STARTER_CARD_IDS = [101]

// Player "look" cards — purely cosmetic skins for the home-screen player card.
// ISOLATED from CARDS_COLLECTION on purpose: these are NOT earned in-game and
// have NO attack/defense. They are curated by an admin only, and reached only
// through the SWAP button on the home screen. The active look is stored on the
// profile (profiles.player_look_id) so it persists; the default is look_1.
// To add art for a card, drop the image in public/ and set its `avatar` path
// (e.g. avatar: '/player-look-3.jpg'). Cards without an avatar show the 👤
// placeholder until art is added.
export const PLAYER_LOOKS = [
  { id: 'look_1',  name: 'Player Card 1',  avatar: '/player-look-1.jpg',  rarity: 'epic' },
  { id: 'look_2',  name: 'Player Card 2',  avatar: '/player-look-2.jpg',  rarity: 'epic' },
  { id: 'look_3',  name: 'Player Card 3',  avatar: '/player-look-3.jpg',  rarity: 'epic' },
  { id: 'look_4',  name: 'Player Card 4',  avatar: '/player-look-4.jpg',  rarity: 'epic' },
  { id: 'look_5',  name: 'Player Card 5',  avatar: '/player-look-5.jpg',  rarity: 'epic' },
  { id: 'look_6',  name: 'Player Card 6',  avatar: '/player-look-6.jpg',  rarity: 'epic' },
  { id: 'look_7',  name: 'Player Card 7',  avatar: '/player-look-7.jpg',  rarity: 'epic' },
  { id: 'look_8',  name: 'Player Card 8',  avatar: '/player-look-8.jpg',  rarity: 'epic' },
  { id: 'look_9',  name: 'Player Card 9',  avatar: '/player-look-9.jpg',  rarity: 'epic' },
  { id: 'look_10', name: 'Player Card 10', avatar: '/player-look-10.jpg', rarity: 'epic' },
  { id: 'look_11', name: 'Player Card 11', avatar: '/player-look-11.jpg', rarity: 'epic' },
  { id: 'look_12', name: 'Player Card 12', avatar: '/player-look-12.jpg', rarity: 'epic' },
  { id: 'look_13', name: 'Player Card 13', avatar: '/player-look-13.jpg', rarity: 'epic' },
  { id: 'look_14', name: 'Player Card 14', avatar: '/player-look-14.jpg', rarity: 'epic' },
  { id: 'look_15', name: 'Player Card 15', avatar: '/player-look-15.jpg', rarity: 'epic' },
  { id: 'look_16', name: 'Player Card 16', avatar: '/player-look-16.jpg', rarity: 'epic' },
  { id: 'look_17', name: 'Player Card 17', avatar: '/player-look-17.jpg', rarity: 'epic' },
  { id: 'look_18', name: 'Player Card 18', avatar: '/player-look-18.jpg', rarity: 'epic' },
  { id: 'look_19', name: 'Player Card 19', avatar: '/player-look-19.jpg', rarity: 'epic' },
  { id: 'look_20', name: 'Player Card 20', avatar: '/player-look-20.jpg', rarity: 'epic' },
  { id: 'look_21', name: 'Player Card 21', avatar: '/player-look-21.jpg', rarity: 'epic' },
  { id: 'look_22', name: 'Player Card 22', avatar: '/player-look-22.jpg', rarity: 'epic' },
  { id: 'look_23', name: 'Player Card 23', avatar: '/player-look-23.jpg', rarity: 'epic' },
  { id: 'look_24', name: 'Player Card 24', avatar: '/player-look-24.jpg', rarity: 'epic' },
  { id: 'look_25', name: 'Player Card 25', avatar: '/player-look-25.jpg', rarity: 'epic' },
  { id: 'look_26', name: 'Player Card 26', avatar: '/player-look-26.jpg', rarity: 'epic' },
  { id: 'look_27', name: 'Player Card 27', avatar: '/player-look-27.jpg', rarity: 'epic' },
  { id: 'look_28', name: 'Player Card 28', avatar: '/player-look-28.jpg', rarity: 'epic' },
  { id: 'look_29', name: 'Player Card 29', avatar: '/player-look-29.jpg', rarity: 'epic' },
  { id: 'look_30', name: 'Player Card 30', avatar: '/player-look-30.jpg', rarity: 'epic' },
  { id: 'look_31', name: 'Player Card 31', avatar: '/player-look-31.jpg', rarity: 'epic' },
  { id: 'look_32', name: 'Player Card 32', avatar: '/player-look-32.jpg', rarity: 'epic' },
  { id: 'look_33', name: 'Player Card 33', avatar: '/player-look-33.jpg', rarity: 'epic' },
  { id: 'look_34', name: 'Player Card 34', avatar: '/player-look-34.jpg', rarity: 'epic' },
  { id: 'look_35', name: 'Player Card 35', avatar: '/player-look-35.jpg', rarity: 'epic' },
  { id: 'look_36', name: 'Player Card 36', avatar: '/player-look-36.jpg', rarity: 'epic' },
  { id: 'look_37', name: 'Player Card 37', avatar: '/player-look-37.jpg', rarity: 'epic' },
  { id: 'look_38', name: 'Player Card 38', avatar: '/player-look-38.jpg', rarity: 'epic' },
  { id: 'look_39', name: 'Player Card 39', avatar: '/player-look-39.jpg', rarity: 'epic' },
  { id: 'look_40', name: 'Player Card 40', avatar: '/player-look-40.jpg', rarity: 'epic' },
  { id: 'look_41', name: 'Player Card 41', avatar: '/player-look-41.jpg', rarity: 'epic' },
  { id: 'look_42', name: 'Player Card 42', avatar: '/player-look-42.jpg', rarity: 'epic' },
  { id: 'look_43', name: 'Player Card 43', avatar: '/player-look-43.jpg', rarity: 'epic' },
  { id: 'look_44', name: 'Player Card 44', avatar: '/player-look-44.jpg', rarity: 'epic' },
  { id: 'look_45', name: 'Player Card 45', avatar: '/player-look-45.jpg', rarity: 'epic' },
  { id: 'look_46', name: 'Player Card 46', avatar: '/player-look-46.jpg', rarity: 'epic' },
  { id: 'look_47', name: 'Player Card 47', avatar: '/player-look-47.jpg', rarity: 'epic' },
  { id: 'look_48', name: 'Player Card 48', avatar: '/player-look-48.jpg', rarity: 'epic' },
  { id: 'look_49', name: 'Player Card 49', avatar: '/player-look-49.jpg', rarity: 'epic' },
  { id: 'look_50', name: 'Player Card 50', avatar: '/player-look-50.jpg', rarity: 'epic' },
  { id: 'look_51', name: 'Player Card 51', avatar: '/player-look-51.jpg', rarity: 'epic' },
  { id: 'look_52', name: 'Player Card 52', avatar: '/player-look-52.jpg', rarity: 'epic' },
  { id: 'look_53', name: 'Player Card 53', avatar: '/player-look-53.jpg', rarity: 'epic' },
  { id: 'look_54', name: 'Player Card 54', avatar: '/player-look-54.jpg', rarity: 'epic' },
  { id: 'look_55', name: 'Player Card 55', avatar: '/player-look-55.jpg', rarity: 'epic' },
  { id: 'look_56', name: 'Player Card 56', avatar: '/player-look-56.jpg', rarity: 'epic' },
  { id: 'look_57', name: 'Player Card 57', avatar: '/player-look-57.jpg', rarity: 'epic' },
  { id: 'look_58', name: 'Player Card 58', avatar: '/player-look-58.jpg', rarity: 'epic' },
  { id: 'look_59', name: 'Player Card 59', avatar: '/player-look-59.jpg', rarity: 'epic' },
  { id: 'look_60', name: 'Player Card 60', avatar: '/player-look-60.jpg', rarity: 'epic' },
  { id: 'look_61', name: 'Player Card 61', avatar: '/player-look-61.jpg', rarity: 'epic' },
  { id: 'look_62', name: 'Player Card 62', avatar: '/player-look-62.jpg', rarity: 'epic' },
  { id: 'look_63', name: 'Player Card 63', avatar: '/player-look-63.jpg', rarity: 'epic' },
  { id: 'look_64', name: 'Player Card 64', avatar: '/player-look-64.jpg', rarity: 'epic' },
  { id: 'look_65', name: 'Player Card 65', avatar: '/player-look-65.jpg', rarity: 'epic' },
  { id: 'look_66', name: 'Player Card 66', avatar: '/player-look-66.jpg', rarity: 'epic' },
  { id: 'look_67', name: 'Player Card 67', avatar: '/player-look-67.jpg', rarity: 'epic' },
  { id: 'look_68', name: 'Player Card 68', avatar: '/player-look-68.jpg', rarity: 'epic' },
  { id: 'look_69', name: 'Player Card 69', avatar: '/player-look-69.jpg', rarity: 'epic' },
  { id: 'look_70', name: 'Player Card 70', avatar: '/player-look-70.jpg', rarity: 'epic' },
  { id: 'look_71', name: 'Player Card 71', avatar: '/player-look-71.jpg', rarity: 'epic' },
  { id: 'look_72', name: 'Player Card 72', avatar: '/player-look-72.jpg', rarity: 'epic' },
  { id: 'look_73', name: 'Player Card 73', avatar: '/player-look-73.jpg', rarity: 'epic' },
  { id: 'look_74', name: 'Player Card 74', avatar: '/player-look-74.jpg', rarity: 'epic' },
  { id: 'look_75', name: 'Player Card 75', avatar: '/player-look-75.jpg', rarity: 'epic' },
  { id: 'look_76', name: 'Player Card 76', avatar: '/player-look-76.jpg', rarity: 'epic' },
  { id: 'look_77', name: 'Player Card 77', avatar: '/player-look-77.jpg', rarity: 'epic' },
  { id: 'look_78', name: 'Player Card 78', avatar: '/player-look-78.jpg', rarity: 'epic' },
  { id: 'look_79', name: 'Player Card 79', avatar: '/player-look-79.jpg', rarity: 'epic' },
  { id: 'look_80', name: 'Player Card 80', avatar: '/player-look-80.jpg', rarity: 'epic' },
  { id: 'look_81', name: 'Player Card 81', avatar: '/player-look-81.jpg', rarity: 'epic' },
  { id: 'look_82', name: 'Player Card 82', avatar: '/player-look-82.jpg', rarity: 'epic' },
  { id: 'look_84', name: 'Player Card 84', avatar: '/player-look-84.jpg', rarity: 'epic' },
  { id: 'look_85', name: 'Player Card 85', avatar: '/player-look-85.jpg', rarity: 'epic' },
  { id: 'look_86', name: 'Player Card 86', avatar: '/player-look-86.jpg', rarity: 'epic' },
  { id: 'look_87', name: 'Player Card 87', avatar: '/player-look-87.jpg', rarity: 'epic' },
  { id: 'look_88', name: 'Player Card 88', avatar: '/player-look-88.jpg', rarity: 'epic' },
  { id: 'look_89', name: 'Player Card 89', avatar: '/player-look-89.jpg', rarity: 'epic' },
  { id: 'look_90', name: 'Player Card 90', avatar: '/player-look-90.jpg', rarity: 'epic' },
  { id: 'look_91', name: 'Player Card 91', avatar: '/player-look-91.jpg', rarity: 'epic' },
  { id: 'look_92', name: 'Player Card 92', avatar: '/player-look-92.jpg', rarity: 'epic' },
  { id: 'look_93', name: 'Player Card 93', avatar: '/player-look-93.jpg', rarity: 'epic' },
  { id: 'look_94', name: 'Player Card 94', avatar: '/player-look-94.jpg', rarity: 'epic' },
  { id: 'look_95', name: 'Player Card 95', avatar: '/player-look-95.jpg', rarity: 'epic' },
  { id: 'look_96', name: 'Player Card 96', avatar: '/player-look-96.jpg', rarity: 'epic' },
  { id: 'look_97', name: 'Player Card 97', avatar: '/player-look-97.jpg', rarity: 'epic' },
  { id: 'look_98', name: 'Player Card 98', avatar: '/player-look-98.jpg', rarity: 'epic' },
  { id: 'look_99', name: 'Player Card 99', avatar: '/player-look-99.jpg', rarity: 'epic' },
  { id: 'look_100', name: 'Player Card 100', avatar: '/player-look-100.jpg', rarity: 'epic' },
  { id: 'look_101', name: 'Player Card 101', avatar: '/player-look-101.jpg', rarity: 'epic' },
  { id: 'look_102', name: 'Player Card 102', avatar: '/player-look-102.jpg', rarity: 'epic' },
  { id: 'look_103', name: 'Player Card 103', avatar: '/player-look-103.jpg', rarity: 'epic' },
  { id: 'look_104', name: 'Player Card 104', avatar: '/player-look-104.jpg', rarity: 'epic' },
  { id: 'look_105', name: 'Player Card 105', avatar: '/player-look-105.jpg', rarity: 'epic' },
  { id: 'look_106', name: 'Player Card 106', avatar: '/player-look-106.jpg', rarity: 'epic' },
  { id: 'look_107', name: 'Player Card 107', avatar: '/player-look-107.jpg', rarity: 'epic' },
  { id: 'look_108', name: 'Player Card 108', avatar: '/player-look-108.jpg', rarity: 'epic' },
  { id: 'look_109', name: 'Player Card 109', avatar: '/player-look-109.jpg', rarity: 'epic' },
  { id: 'look_110', name: 'Player Card 110', avatar: '/player-look-110.jpg', rarity: 'epic' },
  { id: 'look_111', name: 'Player Card 111', avatar: '/player-look-111.jpg', rarity: 'epic' },
  { id: 'look_112', name: 'Player Card 112', avatar: '/player-look-112.jpg', rarity: 'epic' },
  { id: 'look_113', name: 'Player Card 113', avatar: '/player-look-113.jpg', rarity: 'epic' },
  { id: 'look_114', name: 'Player Card 114', avatar: '/player-look-114.jpg', rarity: 'epic' },
  { id: 'look_115', name: 'Player Card 115', avatar: '/player-look-115.jpg', rarity: 'epic' },
  { id: 'look_116', name: 'Player Card 116', avatar: '/player-look-116.jpg', rarity: 'epic' },
  { id: 'look_117', name: 'Player Card 117', avatar: '/player-look-117.jpg', rarity: 'epic' },
  { id: 'look_118', name: 'Player Card 118', avatar: '/player-look-118.jpg', rarity: 'epic' },
  { id: 'look_119', name: 'Player Card 119', avatar: '/player-look-119.jpg', rarity: 'epic' },
  { id: 'look_120', name: 'Player Card 120', avatar: '/player-look-120.jpg', rarity: 'epic' },
  { id: 'look_121', name: 'Player Card 121', avatar: '/player-look-121.jpg', rarity: 'epic' },
  { id: 'look_122', name: 'Player Card 122', avatar: '/player-look-122.jpg', rarity: 'epic' },
  { id: 'look_123', name: 'Player Card 123', avatar: '/player-look-123.jpg', rarity: 'epic' },
  { id: 'look_124', name: 'Player Card 124', avatar: '/player-look-124.jpg', rarity: 'epic' },
  { id: 'look_125', name: 'Player Card 125', avatar: '/player-look-125.jpg', rarity: 'epic' },
  { id: 'look_126', name: 'Player Card 126', avatar: '/player-look-126.jpg', rarity: 'epic' },
  { id: 'look_127', name: 'Player Card 127', avatar: '/player-look-127.jpg', rarity: 'epic' },
  { id: 'look_128', name: 'Player Card 128', avatar: '/player-look-128.jpg', rarity: 'epic' },
  { id: 'look_129', name: 'Player Card 129', avatar: '/player-look-129.jpg', rarity: 'epic' },
  { id: 'look_130', name: 'Player Card 130', avatar: '/player-look-130.jpg', rarity: 'epic' },
  { id: 'look_131', name: 'Player Card 131', avatar: '/player-look-131.jpg', rarity: 'epic' },
  { id: 'look_132', name: 'Player Card 132', avatar: '/player-look-132.jpg', rarity: 'epic' },
  { id: 'look_133', name: 'Player Card 133', avatar: '/player-look-133.jpg', rarity: 'epic' },
  { id: 'look_134', name: 'Player Card 134', avatar: '/player-look-134.jpg', rarity: 'epic' },
  { id: 'look_135', name: 'Player Card 135', avatar: '/player-look-135.jpg', rarity: 'epic' },
  { id: 'look_136', name: 'Player Card 136', avatar: '/player-look-136.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_137', name: 'Player Card 137', avatar: '/player-look-137.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_138', name: 'Player Card 138', avatar: '/player-look-138.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_139', name: 'Player Card 139', avatar: '/player-look-139.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_140', name: 'Player Card 140', avatar: '/player-look-140.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_141', name: 'Player Card 141', avatar: '/player-look-141.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_142', name: 'Player Card 142', avatar: '/player-look-142.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_143', name: 'Player Card 143', avatar: '/player-look-143.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_144', name: 'Player Card 144', avatar: '/player-look-144.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_145', name: 'Player Card 145', avatar: '/player-look-145.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_146', name: 'Player Card 146', avatar: '/player-look-146.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_147', name: 'Player Card 147', avatar: '/player-look-147.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_148', name: 'Player Card 148', avatar: '/player-look-148.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_149', name: 'Player Card 149', avatar: '/player-look-149.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_150', name: 'Player Card 150', avatar: '/player-look-150.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_151', name: 'Player Card 151', avatar: '/player-look-151.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_152', name: 'Player Card 152', avatar: '/player-look-152.jpg', rarity: 'epic', sex: 'women' },
  { id: 'look_153', name: 'Player Card 153', avatar: '/player-look-153.jpg', rarity: 'epic', sex: 'baddies' },
]
export const DEFAULT_LOOK_ID = 'look_1'

// ── Territory facilities (gang-war map control points) ───────────────
// Curated, NAMED prison facilities are the capturable nodes on the map —
// NOT every county (genre playbook: control points, not painted tiles).
// Each anchors to an existing city (cityId → county via map data) so it
// lands in the right place. Tier sets the prize + difficulty. Admin-curated:
// add map targets by appending here. See [[project-gang-territory-design]].
export const FACILITY_TIERS = {
  1: { label: 'County Jail',          hustlePerHr: 50,   steelPerHr: 20  },
  2: { label: 'State Prison',         hustlePerHr: 150,  steelPerHr: 60  },
  3: { label: 'Federal Penitentiary', hustlePerHr: 400,  steelPerHr: 160 },
  4: { label: 'Supermax',             hustlePerHr: 1000, steelPerHr: 400 },
}

export const FACILITIES = [
  { id: 'fac_huntsville',  name: 'Huntsville Unit',         cityId: 1,   tier: 2 }, // TX — player home
  { id: 'fac_dallas',      name: 'Dallas County Jail',      cityId: 2,   tier: 1 },
  { id: 'fac_travis',      name: 'Travis State Jail',       cityId: 3,   tier: 1 },
  { id: 'fac_rikers',      name: 'Rikers Island',           cityId: 10,  tier: 2 },
  { id: 'fac_attica',      name: 'Attica Correctional',     cityId: 11,  tier: 3 },
  { id: 'fac_eastern',     name: 'Eastern State Pen',       cityId: 17,  tier: 3 },
  { id: 'fac_western',     name: 'Western Penitentiary',    cityId: 18,  tier: 2 },
  { id: 'fac_usp_atlanta', name: 'USP Atlanta',             cityId: 41,  tier: 3 },
  { id: 'fac_dade',        name: 'Miami-Dade Correctional', cityId: 44,  tier: 2 },
  { id: 'fac_orleans',     name: 'Orleans Parish Prison',   cityId: 60,  tier: 1 },
  { id: 'fac_angola',      name: 'Angola State Pen',        cityId: 61,  tier: 4 },
  { id: 'fac_stateville',  name: 'Stateville Correctional', cityId: 70,  tier: 3 },
  { id: 'fac_detroit',     name: 'Detroit Detention',       cityId: 77,  tier: 1 },
  { id: 'fac_leavenworth', name: 'USP Leavenworth',         cityId: 86,  tier: 3 },
  { id: 'fac_adx',         name: 'ADX Florence',            cityId: 108, tier: 4 },
  { id: 'fac_lancaster',   name: 'CSP Los Angeles',         cityId: 125, tier: 2 },
  { id: 'fac_sanquentin',  name: 'San Quentin',             cityId: 126, tier: 3 },
  { id: 'fac_folsom',      name: 'Folsom State Prison',     cityId: 128, tier: 2 },
  { id: 'fac_phoenix',     name: 'ASPC Phoenix',            cityId: 131, tier: 2 },
]

export const PLAYER_HOME_FACILITY_ID = 'fac_huntsville'

// AI gangs that hold facilities until real players exist (single-player-first).
export const AI_GANGS = [
  'Block Crew', 'County Posse', 'Backyard Boys', 'Yardbirds', 'Cell House',
  'Shanktown', 'Trailer Mafia', 'Hill Boys', 'Iron Bench', 'Yard Dogs',
]

export const BATTLE_ENEMIES = [
  { id: 1,  name: 'Nervous Ned',     emoji: '😰', power: 45,  area: 1, reward_xp: 50,  reward_hustle: 10,  boss: false,
    bio: 'First fight of the morning. Shakes harder than the bunks. Easy meal.' },
  { id: 2,  name: 'Bully Brad',      emoji: '😤', power: 65,  area: 1, reward_xp: 75,  reward_hustle: 15,  boss: false,
    bio: 'Took your commissary on day one. Time to collect — with interest.' },
  { id: 3,  name: 'Tattoo Tommy',    emoji: '💀', power: 90,  area: 1, reward_xp: 100, reward_hustle: 20,  boss: false,
    bio: 'Inked half the block. Pays in skin and pain. Doesn\'t bleed easy.' },
  { id: 4,  name: 'Two-Timer Tim',   emoji: '🎭', power: 110, area: 1, reward_xp: 125, reward_hustle: 25,  boss: false,
    bio: 'Lied to two crews. Both want him gone. You\'ll do the honors.' },
  { id: 5,  name: 'Intake Ivan',     emoji: '🔱', power: 140, area: 1, reward_xp: 150, reward_hustle: 35,  boss: false,
    bio: 'Six feet of mistakes. Built like a fridge, fights like one too.' },
  { id: 11, name: 'Stoolie Eddie',   emoji: '🐀', avatar: '/stoolie-eddie.jpg', power: 80, area: 1, reward_xp: 110, reward_hustle: 22, boss: false,
    bio: 'Wears a wire under his uniform. Everyone knows. Nobody acts. Until you.' },
  { id: 6,  name: 'CO Johnson',      emoji: '👮', avatar: '/co-johnson.jpg', power: 200, area: 1, reward_xp: 500, reward_hustle: 100, boss: true,  boss_reward_card: true,
    bio: 'Bent, mean, built. Runs the Intake Block with his fists and a forgotten badge. Boss of the block.' },
  { id: 7,  name: 'Yard Dog Danny',  emoji: '🐕', power: 160, area: 2, reward_xp: 180, reward_hustle: 40,  boss: false,
    bio: 'Owns the yard\'s south fence. Bites first, growls later.' },
  { id: 8,  name: 'Weight Room Will',emoji: '🏋️', power: 190, area: 2, reward_xp: 210, reward_hustle: 50,  boss: false,
    bio: 'Bench presses 600. Doesn\'t know what books are. Doesn\'t care.' },
  { id: 9,  name: 'Chef Chaos',      emoji: '👨‍🍳', power: 280, area: 2, reward_xp: 600, reward_hustle: 150, boss: true,  boss_reward_card: true,
    bio: 'Runs the kitchen black market. His soup is poisoned. So is his right hook.' },
  { id: 10, name: 'Warden Wolf',     emoji: '🐺', power: 400, area: 3, reward_xp: 1000,reward_hustle: 300, boss: true,  boss_reward_card: true, final_boss: true,
    bio: 'Pulls every string. Final boss. You\'re not supposed to make it this far.' },
]

// US States — tile-grid coordinates (col 1-11, row 1-8) approximating geography.
// Each tile is rendered in a CSS grid on the US map overview.
export const US_STATES = [
  { abbr: 'ME', name: 'Maine',          col: 11, row: 1 },
  { abbr: 'VT', name: 'Vermont',        col: 10, row: 2 },
  { abbr: 'NH', name: 'New Hampshire',  col: 11, row: 2 },
  { abbr: 'WA', name: 'Washington',     col: 1,  row: 3 },
  { abbr: 'MT', name: 'Montana',        col: 4,  row: 3 },
  { abbr: 'ND', name: 'North Dakota',   col: 5,  row: 3 },
  { abbr: 'MN', name: 'Minnesota',      col: 6,  row: 3 },
  { abbr: 'WI', name: 'Wisconsin',      col: 7,  row: 3 },
  { abbr: 'MI', name: 'Michigan',       col: 8,  row: 3 },
  { abbr: 'NY', name: 'New York',       col: 10, row: 3 },
  { abbr: 'MA', name: 'Massachusetts',  col: 11, row: 3 },
  { abbr: 'OR', name: 'Oregon',         col: 1,  row: 4 },
  { abbr: 'ID', name: 'Idaho',          col: 2,  row: 4 },
  { abbr: 'WY', name: 'Wyoming',        col: 4,  row: 4 },
  { abbr: 'SD', name: 'South Dakota',   col: 5,  row: 4 },
  { abbr: 'IA', name: 'Iowa',           col: 6,  row: 4 },
  { abbr: 'IL', name: 'Illinois',       col: 7,  row: 4 },
  { abbr: 'IN', name: 'Indiana',        col: 8,  row: 4 },
  { abbr: 'OH', name: 'Ohio',           col: 9,  row: 4 },
  { abbr: 'PA', name: 'Pennsylvania',   col: 10, row: 4 },
  { abbr: 'CT', name: 'Connecticut',    col: 11, row: 4 },
  { abbr: 'NV', name: 'Nevada',         col: 2,  row: 5 },
  { abbr: 'UT', name: 'Utah',           col: 3,  row: 5 },
  { abbr: 'NE', name: 'Nebraska',       col: 5,  row: 5 },
  { abbr: 'MO', name: 'Missouri',       col: 6,  row: 5 },
  { abbr: 'KY', name: 'Kentucky',       col: 7,  row: 5 },
  { abbr: 'WV', name: 'West Virginia',  col: 8,  row: 5 },
  { abbr: 'VA', name: 'Virginia',       col: 9,  row: 5 },
  { abbr: 'NJ', name: 'New Jersey',     col: 10, row: 5 },
  { abbr: 'RI', name: 'Rhode Island',   col: 11, row: 5 },
  { abbr: 'CA', name: 'California',     col: 1,  row: 6 },
  { abbr: 'CO', name: 'Colorado',       col: 4,  row: 6 },
  { abbr: 'KS', name: 'Kansas',         col: 5,  row: 6 },
  { abbr: 'AR', name: 'Arkansas',       col: 6,  row: 6 },
  { abbr: 'TN', name: 'Tennessee',      col: 7,  row: 6 },
  { abbr: 'NC', name: 'North Carolina', col: 8,  row: 6 },
  { abbr: 'MD', name: 'Maryland',       col: 9,  row: 6 },
  { abbr: 'DE', name: 'Delaware',       col: 10, row: 6 },
  { abbr: 'AZ', name: 'Arizona',        col: 2,  row: 7 },
  { abbr: 'NM', name: 'New Mexico',     col: 4,  row: 7 },
  { abbr: 'OK', name: 'Oklahoma',       col: 5,  row: 7 },
  { abbr: 'MS', name: 'Mississippi',    col: 7,  row: 7 },
  { abbr: 'AL', name: 'Alabama',        col: 8,  row: 7 },
  { abbr: 'SC', name: 'South Carolina', col: 9,  row: 7 },
  { abbr: 'AK', name: 'Alaska',         col: 1,  row: 8 },
  { abbr: 'TX', name: 'Texas',          col: 5,  row: 8 },
  { abbr: 'LA', name: 'Louisiana',      col: 6,  row: 8 },
  { abbr: 'GA', name: 'Georgia',        col: 8,  row: 8 },
  { abbr: 'FL', name: 'Florida',        col: 9,  row: 8 },
  { abbr: 'HI', name: 'Hawaii',         col: 11, row: 8 },
]

export const GRID_COLS = 11
export const GRID_ROWS = 8

// Cities — top 2-4 per state. tier: 3=major, 2=mid, 1=small. owner: null=unclaimed, string=player handle.
export const ALL_CITIES = [
  // Texas — player owns Houston
  { id: 1,   name: 'Houston',         state: 'TX', tier: 3, lat: 29.7604, lng: -95.3698,  owner: 'SlickRico',     isYours: true  },
  { id: 2,   name: 'Dallas',          state: 'TX', tier: 3, lat: 32.7767, lng: -96.7970,  owner: 'YardBoss99',    isYours: false },
  { id: 3,   name: 'Austin',          state: 'TX', tier: 2, lat: 30.2672, lng: -97.7431,  owner: 'TexasCartel',   isYours: false },
  { id: 4,   name: 'San Antonio',     state: 'TX', tier: 2, lat: 29.4241, lng: -98.4936,  owner: null,            isYours: false },
  { id: 5,   name: 'El Paso',         state: 'TX', tier: 1, lat: 31.7619, lng: -106.4850, owner: 'HoustonKing',   isYours: false },
  { id: 6,   name: 'Fort Worth',      state: 'TX', tier: 2, lat: 32.7555, lng: -97.3308,  owner: 'YardBoss99',    isYours: false },

  // Northeast
  { id: 10,  name: 'New York City',   state: 'NY', tier: 3, lat: 40.7128, lng: -74.0060,  owner: 'EastSideKings', isYours: false },
  { id: 11,  name: 'Buffalo',         state: 'NY', tier: 2, lat: 42.8864, lng: -78.8784,  owner: null,            isYours: false },
  { id: 12,  name: 'Rochester',       state: 'NY', tier: 1, lat: 43.1566, lng: -77.6088,  owner: null,            isYours: false },
  { id: 13,  name: 'Boston',          state: 'MA', tier: 3, lat: 42.3601, lng: -71.0589,  owner: 'EastSideKings', isYours: false },
  { id: 14,  name: 'Worcester',       state: 'MA', tier: 1, lat: 42.2626, lng: -71.8023,  owner: null,            isYours: false },
  { id: 15,  name: 'Newark',          state: 'NJ', tier: 2, lat: 40.7357, lng: -74.1724,  owner: 'EastSideKings', isYours: false },
  { id: 16,  name: 'Jersey City',     state: 'NJ', tier: 2, lat: 40.7178, lng: -74.0431,  owner: null,            isYours: false },
  { id: 17,  name: 'Philadelphia',    state: 'PA', tier: 3, lat: 39.9526, lng: -75.1652,  owner: null,            isYours: false },
  { id: 18,  name: 'Pittsburgh',      state: 'PA', tier: 2, lat: 40.4406, lng: -79.9959,  owner: null,            isYours: false },
  { id: 19,  name: 'Hartford',        state: 'CT', tier: 1, lat: 41.7637, lng: -72.6851,  owner: null,            isYours: false },
  { id: 20,  name: 'Bridgeport',      state: 'CT', tier: 1, lat: 41.1672, lng: -73.2048,  owner: null,            isYours: false },
  { id: 21,  name: 'Providence',      state: 'RI', tier: 1, lat: 41.8240, lng: -71.4128,  owner: null,            isYours: false },
  { id: 22,  name: 'Manchester',      state: 'NH', tier: 1, lat: 42.9956, lng: -71.4548,  owner: null,            isYours: false },
  { id: 23,  name: 'Burlington',      state: 'VT', tier: 1, lat: 44.4759, lng: -73.2121,  owner: null,            isYours: false },
  { id: 24,  name: 'Portland',        state: 'ME', tier: 1, lat: 43.6591, lng: -70.2568,  owner: null,            isYours: false },

  // Mid-Atlantic & Southeast
  { id: 30,  name: 'Baltimore',       state: 'MD', tier: 2, lat: 39.2904, lng: -76.6122,  owner: null,            isYours: false },
  { id: 31,  name: 'Annapolis',       state: 'MD', tier: 1, lat: 38.9784, lng: -76.4922,  owner: null,            isYours: false },
  { id: 32,  name: 'Wilmington',      state: 'DE', tier: 1, lat: 39.7391, lng: -75.5398,  owner: null,            isYours: false },
  { id: 33,  name: 'Richmond',        state: 'VA', tier: 2, lat: 37.5407, lng: -77.4360,  owner: null,            isYours: false },
  { id: 34,  name: 'Virginia Beach',  state: 'VA', tier: 2, lat: 36.8529, lng: -75.9780,  owner: null,            isYours: false },
  { id: 35,  name: 'Charleston',      state: 'WV', tier: 1, lat: 38.3498, lng: -81.6326,  owner: null,            isYours: false },
  { id: 36,  name: 'Charlotte',       state: 'NC', tier: 3, lat: 35.2271, lng: -80.8431,  owner: 'CarolinaCrown', isYours: false },
  { id: 37,  name: 'Raleigh',         state: 'NC', tier: 2, lat: 35.7796, lng: -78.6382,  owner: null,            isYours: false },
  { id: 38,  name: 'Greensboro',      state: 'NC', tier: 1, lat: 36.0726, lng: -79.7920,  owner: null,            isYours: false },
  { id: 39,  name: 'Charleston',      state: 'SC', tier: 2, lat: 32.7765, lng: -79.9311,  owner: null,            isYours: false },
  { id: 40,  name: 'Columbia',        state: 'SC', tier: 1, lat: 34.0007, lng: -81.0348,  owner: 'CarolinaCrown', isYours: false },
  { id: 41,  name: 'Atlanta',         state: 'GA', tier: 3, lat: 33.7490, lng: -84.3880,  owner: 'PeachKingpin',  isYours: false },
  { id: 42,  name: 'Savannah',        state: 'GA', tier: 1, lat: 32.0809, lng: -81.0912,  owner: null,            isYours: false },
  { id: 43,  name: 'Augusta',         state: 'GA', tier: 1, lat: 33.4735, lng: -82.0105,  owner: null,            isYours: false },
  { id: 44,  name: 'Miami',           state: 'FL', tier: 3, lat: 25.7617, lng: -80.1918,  owner: 'MiamiPapi',     isYours: false },
  { id: 45,  name: 'Orlando',         state: 'FL', tier: 2, lat: 28.5383, lng: -81.3792,  owner: null,            isYours: false },
  { id: 46,  name: 'Tampa',           state: 'FL', tier: 2, lat: 27.9506, lng: -82.4572,  owner: 'MiamiPapi',     isYours: false },
  { id: 47,  name: 'Jacksonville',    state: 'FL', tier: 2, lat: 30.3322, lng: -81.6557,  owner: null,            isYours: false },

  // South Central / Gulf
  { id: 50,  name: 'Nashville',       state: 'TN', tier: 3, lat: 36.1627, lng: -86.7816,  owner: null,            isYours: false },
  { id: 51,  name: 'Memphis',         state: 'TN', tier: 2, lat: 35.1495, lng: -90.0490,  owner: null,            isYours: false },
  { id: 52,  name: 'Knoxville',       state: 'TN', tier: 1, lat: 35.9606, lng: -83.9207,  owner: null,            isYours: false },
  { id: 53,  name: 'Louisville',      state: 'KY', tier: 2, lat: 38.2527, lng: -85.7585,  owner: null,            isYours: false },
  { id: 54,  name: 'Lexington',       state: 'KY', tier: 1, lat: 38.0406, lng: -84.5037,  owner: null,            isYours: false },
  { id: 55,  name: 'Birmingham',      state: 'AL', tier: 2, lat: 33.5186, lng: -86.8104,  owner: null,            isYours: false },
  { id: 56,  name: 'Montgomery',      state: 'AL', tier: 1, lat: 32.3792, lng: -86.3077,  owner: null,            isYours: false },
  { id: 57,  name: 'Mobile',          state: 'AL', tier: 1, lat: 30.6954, lng: -88.0399,  owner: null,            isYours: false },
  { id: 58,  name: 'Jackson',         state: 'MS', tier: 1, lat: 32.2988, lng: -90.1848,  owner: null,            isYours: false },
  { id: 59,  name: 'Gulfport',        state: 'MS', tier: 1, lat: 30.3674, lng: -89.0928,  owner: null,            isYours: false },
  { id: 60,  name: 'New Orleans',     state: 'LA', tier: 3, lat: 29.9511, lng: -90.0715,  owner: 'BayouBoss',     isYours: false },
  { id: 61,  name: 'Baton Rouge',     state: 'LA', tier: 2, lat: 30.4515, lng: -91.1871,  owner: null,            isYours: false },
  { id: 62,  name: 'Shreveport',      state: 'LA', tier: 1, lat: 32.5252, lng: -93.7502,  owner: null,            isYours: false },
  { id: 63,  name: 'Little Rock',     state: 'AR', tier: 1, lat: 34.7465, lng: -92.2896,  owner: null,            isYours: false },
  { id: 64,  name: 'Fayetteville',    state: 'AR', tier: 1, lat: 36.0626, lng: -94.1574,  owner: null,            isYours: false },
  { id: 65,  name: 'Oklahoma City',   state: 'OK', tier: 2, lat: 35.4676, lng: -97.5164,  owner: null,            isYours: false },
  { id: 66,  name: 'Tulsa',           state: 'OK', tier: 2, lat: 36.1539, lng: -95.9928,  owner: null,            isYours: false },

  // Midwest
  { id: 70,  name: 'Chicago',         state: 'IL', tier: 3, lat: 41.8781, lng: -87.6298,  owner: 'ChiTownChino',  isYours: false },
  { id: 71,  name: 'Springfield',     state: 'IL', tier: 1, lat: 39.7817, lng: -89.6501,  owner: null,            isYours: false },
  { id: 72,  name: 'Indianapolis',    state: 'IN', tier: 2, lat: 39.7684, lng: -86.1581,  owner: null,            isYours: false },
  { id: 73,  name: 'Fort Wayne',      state: 'IN', tier: 1, lat: 41.0793, lng: -85.1394,  owner: null,            isYours: false },
  { id: 74,  name: 'Columbus',        state: 'OH', tier: 3, lat: 39.9612, lng: -82.9988,  owner: null,            isYours: false },
  { id: 75,  name: 'Cleveland',       state: 'OH', tier: 2, lat: 41.4993, lng: -81.6944,  owner: 'ChiTownChino',  isYours: false },
  { id: 76,  name: 'Cincinnati',      state: 'OH', tier: 2, lat: 39.1031, lng: -84.5120,  owner: null,            isYours: false },
  { id: 77,  name: 'Detroit',         state: 'MI', tier: 3, lat: 42.3314, lng: -83.0458,  owner: null,            isYours: false },
  { id: 78,  name: 'Grand Rapids',    state: 'MI', tier: 1, lat: 42.9634, lng: -85.6681,  owner: null,            isYours: false },
  { id: 79,  name: 'Milwaukee',       state: 'WI', tier: 2, lat: 43.0389, lng: -87.9065,  owner: null,            isYours: false },
  { id: 80,  name: 'Madison',         state: 'WI', tier: 1, lat: 43.0731, lng: -89.4012,  owner: null,            isYours: false },
  { id: 81,  name: 'Minneapolis',     state: 'MN', tier: 3, lat: 44.9778, lng: -93.2650,  owner: null,            isYours: false },
  { id: 82,  name: 'Saint Paul',      state: 'MN', tier: 2, lat: 44.9537, lng: -93.0900,  owner: null,            isYours: false },
  { id: 83,  name: 'Des Moines',      state: 'IA', tier: 1, lat: 41.5868, lng: -93.6250,  owner: null,            isYours: false },
  { id: 84,  name: 'Cedar Rapids',    state: 'IA', tier: 1, lat: 41.9779, lng: -91.6656,  owner: null,            isYours: false },
  { id: 85,  name: 'Saint Louis',     state: 'MO', tier: 2, lat: 38.6270, lng: -90.1994,  owner: null,            isYours: false },
  { id: 86,  name: 'Kansas City',     state: 'MO', tier: 2, lat: 39.0997, lng: -94.5786,  owner: null,            isYours: false },
  { id: 87,  name: 'Wichita',         state: 'KS', tier: 1, lat: 37.6872, lng: -97.3301,  owner: null,            isYours: false },
  { id: 88,  name: 'Topeka',          state: 'KS', tier: 1, lat: 39.0473, lng: -95.6752,  owner: null,            isYours: false },
  { id: 89,  name: 'Omaha',           state: 'NE', tier: 1, lat: 41.2565, lng: -95.9345,  owner: null,            isYours: false },
  { id: 90,  name: 'Lincoln',         state: 'NE', tier: 1, lat: 40.8136, lng: -96.7026,  owner: null,            isYours: false },

  // Plains & Mountain
  { id: 100, name: 'Fargo',           state: 'ND', tier: 1, lat: 46.8772, lng: -96.7898,  owner: null,            isYours: false },
  { id: 101, name: 'Bismarck',        state: 'ND', tier: 1, lat: 46.8083, lng: -100.7837, owner: null,            isYours: false },
  { id: 102, name: 'Sioux Falls',     state: 'SD', tier: 1, lat: 43.5446, lng: -96.7311,  owner: null,            isYours: false },
  { id: 103, name: 'Rapid City',      state: 'SD', tier: 1, lat: 44.0805, lng: -103.2310, owner: null,            isYours: false },
  { id: 104, name: 'Billings',        state: 'MT', tier: 1, lat: 45.7833, lng: -108.5007, owner: null,            isYours: false },
  { id: 105, name: 'Missoula',        state: 'MT', tier: 1, lat: 46.8721, lng: -113.9940, owner: null,            isYours: false },
  { id: 106, name: 'Cheyenne',        state: 'WY', tier: 1, lat: 41.1400, lng: -104.8202, owner: null,            isYours: false },
  { id: 107, name: 'Casper',          state: 'WY', tier: 1, lat: 42.8666, lng: -106.3131, owner: null,            isYours: false },
  { id: 108, name: 'Denver',          state: 'CO', tier: 3, lat: 39.7392, lng: -104.9903, owner: 'MileHighMack',  isYours: false },
  { id: 109, name: 'Colorado Springs',state: 'CO', tier: 2, lat: 38.8339, lng: -104.8214, owner: null,            isYours: false },
  { id: 110, name: 'Salt Lake City',  state: 'UT', tier: 2, lat: 40.7608, lng: -111.8910, owner: null,            isYours: false },
  { id: 111, name: 'Provo',           state: 'UT', tier: 1, lat: 40.2338, lng: -111.6585, owner: null,            isYours: false },
  { id: 112, name: 'Albuquerque',     state: 'NM', tier: 2, lat: 35.0844, lng: -106.6504, owner: null,            isYours: false },
  { id: 113, name: 'Santa Fe',        state: 'NM', tier: 1, lat: 35.6870, lng: -105.9378, owner: null,            isYours: false },
  { id: 114, name: 'Boise',           state: 'ID', tier: 1, lat: 43.6150, lng: -116.2023, owner: null,            isYours: false },
  { id: 115, name: 'Idaho Falls',     state: 'ID', tier: 1, lat: 43.4917, lng: -112.0339, owner: null,            isYours: false },

  // West Coast
  { id: 120, name: 'Seattle',         state: 'WA', tier: 3, lat: 47.6062, lng: -122.3321, owner: null,            isYours: false },
  { id: 121, name: 'Spokane',         state: 'WA', tier: 1, lat: 47.6587, lng: -117.4260, owner: null,            isYours: false },
  { id: 122, name: 'Tacoma',          state: 'WA', tier: 1, lat: 47.2529, lng: -122.4443, owner: null,            isYours: false },
  { id: 123, name: 'Portland',        state: 'OR', tier: 2, lat: 45.5152, lng: -122.6784, owner: null,            isYours: false },
  { id: 124, name: 'Eugene',          state: 'OR', tier: 1, lat: 44.0521, lng: -123.0868, owner: null,            isYours: false },
  { id: 125, name: 'Los Angeles',     state: 'CA', tier: 3, lat: 34.0522, lng: -118.2437, owner: 'LaCoyote',      isYours: false },
  { id: 126, name: 'San Francisco',   state: 'CA', tier: 3, lat: 37.7749, lng: -122.4194, owner: null,            isYours: false },
  { id: 127, name: 'San Diego',       state: 'CA', tier: 3, lat: 32.7157, lng: -117.1611, owner: 'LaCoyote',      isYours: false },
  { id: 128, name: 'Sacramento',      state: 'CA', tier: 2, lat: 38.5816, lng: -121.4944, owner: null,            isYours: false },
  { id: 129, name: 'Las Vegas',       state: 'NV', tier: 3, lat: 36.1699, lng: -115.1398, owner: 'VegasViper',    isYours: false },
  { id: 130, name: 'Reno',            state: 'NV', tier: 1, lat: 39.5296, lng: -119.8138, owner: null,            isYours: false },
  { id: 131, name: 'Phoenix',         state: 'AZ', tier: 3, lat: 33.4484, lng: -112.0740, owner: null,            isYours: false },
  { id: 132, name: 'Tucson',          state: 'AZ', tier: 2, lat: 32.2226, lng: -110.9747, owner: null,            isYours: false },

  // Non-contiguous
  { id: 140, name: 'Anchorage',       state: 'AK', tier: 2, lat: 61.2181, lng: -149.9003, owner: null,            isYours: false },
  { id: 141, name: 'Juneau',          state: 'AK', tier: 1, lat: 58.3019, lng: -134.4197, owner: null,            isYours: false },
  { id: 142, name: 'Honolulu',        state: 'HI', tier: 2, lat: 21.3069, lng: -157.8583, owner: null,            isYours: false },
  { id: 143, name: 'Hilo',            state: 'HI', tier: 1, lat: 19.7297, lng: -155.0900, owner: null,            isYours: false },
]

export const RARITY_COLORS = {
  common:    '#888888',
  uncommon:  '#2ecc71',
  rare:      '#4a9eff',
  epic:      '#a855f7',
  legendary: '#c9a84c',
  locked:    '#333333',
}

export const FACILITY_ORDER = ['County Jail', 'State Prison', 'Federal Penn', 'Supermax']

// Ranked players (Yard Kings + Hit List). Stats drive the Street Rep formula:
//   ((Takedowns − Defeats × 10) × 100) + ((Wins − Losses × 5) × 5) + Jobs
export const RANKED_PLAYERS = [
  // Tier 1 — top of overall Street Rep
  { id: 'p1',  name: 'IronMike_TX',      emoji: '👑',  facility: 'Supermax',     state: 'TX', level: 88, power: 892, wins: 312, losses: 8,   kos: 47, defeats: 2,  jobs: 1840,
    bio: 'ADX Florence\'s quietest inmate. Took Texas without leaving solitary. Cassette tapes, cigarette currency, and a network nobody can prove. Untouchable.' },
  { id: 'p2',  name: 'CarolinaCrown',    emoji: '🦅',  facility: 'Federal Penn', state: 'NC', level: 66, power: 488, wins: 142, losses: 9,   kos: 28, defeats: 1,  jobs: 1620,
    bio: 'Carolina\'s patient hand. Runs three states through his daughter\'s halfway house. Plays the long game and always wins it.' },
  { id: 'p3',  name: 'MiamiPapi',        emoji: '🌴',  facility: 'Federal Penn', state: 'FL', level: 71, power: 521, wins: 218, losses: 12,  kos: 22, defeats: 1,  jobs: 1340,
    bio: 'Built the original 305 cartel from inside FCI Miami. Survived two hits in his bunk. Still smiles. Watch his hands.' },
  { id: 'p4',  name: 'YardBoss99',       emoji: '🔥',  facility: 'Federal Penn', state: 'TX', level: 67, power: 541, wins: 198, losses: 17,  kos: 31, defeats: 2,  jobs: 1102,
    bio: 'Talks slow, hits harder. Built the Dallas crew bench-pressing his way into legend. Owns half of Texas because he asked.' },
  { id: 'p5',  name: 'ChiTownChino',     emoji: '🌃',  facility: 'Federal Penn', state: 'IL', level: 72, power: 612, wins: 145, losses: 26,  kos: 56, defeats: 4,  jobs: 720,
    bio: 'Federal Penn\'s worst nightmare. Bodied 56 men in the kitchen. A quiet day means somebody\'s in the infirmary.' },
  { id: 'p6',  name: 'BayouBoss',        emoji: '🐊',  facility: 'State Prison', state: 'LA', level: 56, power: 350, wins: 102, losses: 11,  kos: 18, defeats: 1,  jobs: 1180,
    bio: 'Louisiana State\'s oldest active player. Knows where every body\'s buried. Some literally. Don\'t owe him gumbo.' },
  { id: 'p7',  name: 'MileHighMack',     emoji: '🏔️', facility: 'Federal Penn', state: 'CO', level: 60, power: 425, wins: 88,  losses: 8,   kos: 15, defeats: 1,  jobs: 1410,
    bio: 'Worked his way up counting cards in the rec room. Now he counts everything — bodies, money, days. Mile-high empire.' },
  { id: 'p8',  name: 'PeachKingpin',     emoji: '🍑',  facility: 'Federal Penn', state: 'GA', level: 63, power: 470, wins: 134, losses: 14,  kos: 41, defeats: 3,  jobs: 580,
    bio: 'Atlanta\'s smoothest operator. Got pinched for a halfway house op that was too profitable. His smile means somebody\'s getting hurt.' },
  { id: 'p9',  name: 'EastSideKings',    emoji: '🗽',  facility: 'Federal Penn', state: 'NY', level: 70, power: 580, wins: 167, losses: 22,  kos: 24, defeats: 2,  jobs: 920,
    bio: 'Runs all five boroughs from a cell in Sing Sing. Hasn\'t taken the orange off since \'99. NYC answers to his commissary.' },
  { id: 'p10', name: 'TexasCartel',      emoji: '💎',  facility: 'Federal Penn', state: 'TX', level: 61, power: 398, wins: 174, losses: 19,  kos: 22, defeats: 2,  jobs: 980,
    bio: 'Crossed every border that matters. Doesn\'t say much. Signs death warrants in pictograms. Five-state operation, Texas branch.' },
  { id: 'p11', name: 'HoustonKing',      emoji: '🏙️', facility: 'State Prison', state: 'TX', level: 47, power: 201, wins: 64,  losses: 12,  kos: 11, defeats: 1,  jobs: 1245,
    bio: 'Wanted to be a rapper. Now runs Houston\'s east side from his cell. Still freestyles in the yard for street cred.' },
  { id: 'p12', name: 'VegasViper',       emoji: '🐍',  facility: 'Federal Penn', state: 'NV', level: 59, power: 405, wins: 188, losses: 67,  kos: 29, defeats: 11, jobs: 340,
    bio: 'Cleaned out three casinos in \'07. Doesn\'t lose at anything except dignity. The 188 wins / 67 losses is on-brand.' },
  { id: 'p13', name: 'LaCoyote',         emoji: '🌵',  facility: 'Federal Penn', state: 'CA', level: 64, power: 487, wins: 220, losses: 89,  kos: 18, defeats: 14, jobs: 410,
    bio: 'California\'s golden boy. Took LA county piece by piece. Aggressive even when he shouldn\'t be — see the 89 losses.' },
  // You
  { id: 'p_you', name: 'SlickRico',      emoji: '🤵',  avatar: '/slickrico.jpg', facility: 'Federal Penn', state: 'TX', level: 42, power: 284, wins: 47,  losses: 12,  kos: 6,  defeats: 2,  jobs: 320,  isYou: true,
    bio: 'That\'s you. Con artist by trade, kingpin by ambition. Working your way up from Federal Penn one mark at a time.' },
  // Wall of shame — tank the loss-/defeat-leaders
  { id: 'p14', name: '4ShitsAndGiggles', emoji: '😅',  facility: 'County Jail',  state: 'KY', level: 8,  power: 24,  wins: 3,   losses: 294, kos: 0,  defeats: 1,  jobs: 28,
    bio: 'Lost 294 fights and counting. Genuinely doesn\'t seem to care. Some say he picks fights for the infirmary meals.' },
  { id: 'p15', name: 'Bowser',           emoji: '🐢',  facility: 'County Jail',  state: 'OH', level: 14, power: 48,  wins: 12,  losses: 157, kos: 1,  defeats: 5,  jobs: 88,
    bio: 'Tries hard, loses harder. Heart of a lion, hands of a marshmallow.' },
  { id: 'p16', name: 'BurntToast',       emoji: '🍞',  facility: 'County Jail',  state: 'OR', level: 6,  power: 18,  wins: 1,   losses: 89,  kos: 0,  defeats: 8,  jobs: 12,
    bio: 'Inside for arson. Won\'t tell anyone why he fights. 1-89 record. Refuses to stop.' },
  { id: 'p17', name: 'Catcall77',        emoji: '🐱',  facility: 'County Jail',  state: 'WV', level: 22, power: 78,  wins: 24,  losses: 56,  kos: 2,  defeats: 21, jobs: 110,
    bio: 'Mouths off to anyone, anywhere. Knocked out 21 times. Doesn\'t learn. The consistency is admirable.' },
  { id: 'p18', name: 'MrMeowgi',         emoji: '😼',  facility: 'County Jail',  state: 'AZ', level: 11, power: 35,  wins: 8,   losses: 67,  kos: 0,  defeats: 4,  jobs: 56,
    bio: 'Channels ancient martial wisdom. Mostly just gets hit. The goatee is doing a lot of work.' },
  { id: 'p19', name: 'FreshFishFred',    emoji: '😰',  facility: 'County Jail',  state: 'IN', level: 4,  power: 14,  wins: 0,   losses: 47,  kos: 0,  defeats: 12, jobs: 8,
    bio: 'Brand new. Confused. Scared. 0 wins, 47 losses. Send help, send commissary, send anything.' },
].map(withCombat)

export function streetRep(p) {
  return ((p.kos - p.defeats * 10) * 100) + ((p.wins - p.losses * 5) * 5) + p.jobs
}

// SKILLS — equippable into dice slots 2-12. When a Battle Dice roll sums to a
// slot you have a skill equipped in, that skill fires for the round.
// Learn cost = baseLearnCost. Upgrade cost grows with level. You can upgrade
// at most one skill per player level (gated by PLAYER.lastSkillUpgradeLevel).
// New skill types unlock every 10 player levels.
//
// Intentionally EMPTY — the original skills were removed so a fresh set can be
// authored. Every consumer handles an empty list: players have no skills to
// learn/equip, and bosses get empty loadouts (opponentSkillLoadout returns {}).
// Add new skills here in the same shape as below:
//   { id, name, shortName, emoji, rarity, description, category, minLevel,
//     maxLevel, perLevelAttack, baseLearnCost: { knowledge, hustle },
//     upgradeCostFor }
export const SKILLS = [
  {
    id: 'skull_crusher',
    name: 'SKULL CRUSHER',
    shortName: 'Skull Crusher',
    emoji: '💀',
    avatar: '/skill-skull-crusher.jpg',
    rarity: 'epic',
    description: 'A bone-shattering overhand that caves the skull in. Big bonus damage when it lands.',
    category: 'Brawl',
    minLevel: 1,
    maxLevel: 100,
    perLevelAttack: 45,                           // +45 attack per skill level (heavy hitter)
    baseLearnCost:    { knowledge: 20, hustle: 3_000 },
    upgradeCostFor: (currentLevel) => ({
      knowledge: 20 + currentLevel * 5,
      hustle:    3_000 * (currentLevel + 1),
    }),
  },
]

// PLANTS — grow cards for the Trap House. Same collectible shape as SKILLS
// (stack to merge, upgrade one stat), but the upgradable stat is YIELD: the
// product (stash units) a plant produces per harvest. Higher rarity = bigger
// base yield; merging raises the card level; upgrades add perLevelYield on top.
// `baseCashValue` is the card's worth at Lvl 1 — it DOUBLES every card level
// (see plantCashValue). Add new strains here in the same shape:
//   { id, name, shortName, emoji, avatar, rarity, description, category,
//     minLevel, maxLevel, perLevelYield, baseCashValue }
export const PLANTS = [
  {
    id: 'plant_purple_haze',
    name: 'PURPLE HAZE',
    shortName: 'Purple Haze',
    emoji: '🌿',
    avatar: '/plant-purple-haze.webp',
    rarity: 'common',
    description: 'Deep purple buds with a psychedelic kick. Every hustler starts here — the strain that built the empire.',
    category: 'Strain',
    minLevel: 1,
    maxLevel: 100,
    perLevelYield: 1,                 // +1 stash unit per card level
    baseCashValue: 10,                // $ at Lvl 1; doubles every card level
    starter: true,                    // granted to every player (seed + backfill)
    jarColor: '#8e44ad',              // colour of this strain's packed jar (Trap House packing room)
    grow: '/plant.webp',              // the potted-plant art shown growing on the bench
    bud: '/bud.webp',                 // the nug art that flows down the grow-room belt
  },
  {
    id: 'plant_golden_mist',
    name: 'GOLDEN MIST',
    shortName: 'Golden Mist',
    emoji: '🌬️',
    avatar: '/plant-golden-mist.webp',
    rarity: 'common',
    description: 'A hazy golden sativa — bright, light, and easy money on the block.',
    category: 'Strain',
    minLevel: 1,
    maxLevel: 100,
    perLevelYield: 1,                 // same stats as PURPLE HAZE
    baseCashValue: 10,
    starter: true,
    jarColor: '#d9a528',              // amber/gold jar
    grow: '/plant-golden-mist.webp',
    bud: '/bud-golden-mist.webp',
  },
  {
    id: 'plant_red_dawn',
    name: 'RED DAWN',
    shortName: 'Red Dawn',
    emoji: '🌅',
    avatar: '/plant-red-dawn.webp',
    rarity: 'common',
    description: 'Crimson-haired indica that hits at sunrise — heavy, mellow, moves itself.',
    category: 'Strain',
    minLevel: 1,
    maxLevel: 100,
    perLevelYield: 1,                 // same stats as PURPLE HAZE
    baseCashValue: 10,
    starter: true,
    jarColor: '#c0392b',              // red jar
    grow: '/plant-red-dawn.webp',
    bud: '/bud-red-dawn.webp',
  },
]

// Cash value of a plant card at a given card level — starts at baseCashValue
// and DOUBLES each level (Lvl 1 = $10, Lvl 2 = $20, Lvl 3 = $40, …).
export function plantCashValue(plant, level = 1) {
  return (plant?.baseCashValue || 0) * Math.pow(2, Math.max(0, level - 1))
}

// PvP reward multiplier. Killing someone N levels above you = N× reward.
// Same level or lower = 1× (clamped). User-facing rule we surface in the UI.
export function pvpRewardMultiplier(yourLevel, opponentLevel) {
  return Math.max(1, opponentLevel - yourLevel)
}

// PvP visibility range — see players from your level up to +N above.
export const PVP_LEVEL_RANGE = 25

// Cost in stamina to roll the Battle Dice once.
export const PVP_FIGHT_COST = 3

// PROPERTIES — passive Hustle/hr income items, modeled on Cat Champions' Property
// page. Tier unlock levels: 1, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, then 100,
// 125, 150, 200, 250, 300, 400, 500, 750, 1k, 1.5k, 2k, 3k, 4k, 5k.
// Two items per tier. Income roughly doubles per tier; cost ≈ income × payback
// hours (escalating from ~100h early-game to ~1000h late-game).
// Costs/balance are intentionally rough — to be tuned with the economy pass.
export const PROPERTIES = [
  // Level 1 (starter — everyone sees these)
  { id: 'soup_cup',            name: 'Soup Cup',                       emoji: '🥣',  perHr: 5,             baseCost: 500,              minLevel: 1 },
  { id: 'soap_rope',           name: 'Soap on a Rope',                 emoji: '🧼',  perHr: 10,            baseCost: 1_000,            minLevel: 1 },

  // Level 5
  { id: 'bunk_stash',          name: "Bunkmate's Stash",               emoji: '🛏️',  perHr: 25,            baseCost: 5_000,            minLevel: 5 },
  { id: 'contraband_smokes',   name: 'Contraband Cigarettes',          emoji: '🚬',  perHr: 40,            baseCost: 10_000,           minLevel: 5 },

  // Level 10
  { id: 'burner_phone',        name: 'Burner Cell Phone',              emoji: '📱',  perHr: 80,            baseCost: 20_000,           minLevel: 10 },
  { id: 'hustle_notebook',     name: 'Hustle Notebook',                emoji: '📓',  perHr: 130,           baseCost: 40_000,           minLevel: 10 },

  // Level 15
  { id: 'workout_bench',       name: 'Yard Workout Bench',             emoji: '🏋️',  perHr: 200,           baseCost: 60_000,           minLevel: 15 },
  { id: 'tattoo_gun',          name: 'Tattoo Gun Setup',               emoji: '🖋️',  perHr: 320,           baseCost: 120_000,          minLevel: 15 },

  // Level 20
  { id: 'hooch_still',         name: 'Hooch Still (Pruno)',            emoji: '🍶',  perHr: 500,           baseCost: 180_000,          minLevel: 20 },
  { id: 'commissary_plug',     name: 'Commissary Connection',          emoji: '🛒',  perHr: 800,           baseCost: 360_000,          minLevel: 20 },

  // Level 30
  { id: 'laundry_racket',      name: 'Laundry Racket',                 emoji: '🧺',  perHr: 1_200,         baseCost: 480_000,          minLevel: 30 },
  { id: 'kitchen_hustle',      name: 'Kitchen Hustle',                 emoji: '🍳',  perHr: 2_000,         baseCost: 960_000,          minLevel: 30 },

  // Level 40
  { id: 'visitor_run',         name: 'Visitor Drop Run',               emoji: '🚪',  perHr: 2_800,         baseCost: 1_200_000,        minLevel: 40 },
  { id: 'phone_scalping',      name: 'Phone Time Scalping',            emoji: '☎️',  perHr: 4_500,         baseCost: 2_400_000,        minLevel: 40 },

  // Level 50
  { id: 'lookout_crew',        name: 'Cell Block Lookout Crew',        emoji: '👁️',  perHr: 6_500,         baseCost: 3_000_000,        minLevel: 50 },
  { id: 'mule_network',        name: 'Drug Mule Network',              emoji: '🐴',  perHr: 10_000,        baseCost: 6_000_000,        minLevel: 50 },

  // Level 60
  { id: 'smuggler_pipeline',   name: "Smuggler's Pipeline",            emoji: '🚛',  perHr: 15_000,        baseCost: 7_500_000,        minLevel: 60 },
  { id: 'black_market_store',  name: 'Black Market Storefront',        emoji: '🏪',  perHr: 24_000,        baseCost: 15_000_000,       minLevel: 60 },

  // Level 70
  { id: 'stash_house',         name: 'Hidden Stash House',             emoji: '🏚️',  perHr: 35_000,        baseCost: 19_000_000,       minLevel: 70 },
  { id: 'cartel_lieutenant',   name: 'Cartel Lieutenant Contract',     emoji: '🤝',  perHr: 55_000,        baseCost: 38_000_000,       minLevel: 70 },

  // Level 80
  { id: 'penn_wing',           name: 'Federal Penn Wing',              emoji: '🏛️',  perHr: 80_000,        baseCost: 45_000_000,       minLevel: 80 },
  { id: 'witness_intimidate',  name: 'Witness Intimidation Op',        emoji: '🤫',  perHr: 125_000,       baseCost: 90_000_000,       minLevel: 80 },

  // Level 100
  { id: 'crooked_co',          name: 'Crooked CO on Payroll',          emoji: '👮',  perHr: 200_000,       baseCost: 115_000_000,      minLevel: 100 },
  { id: 'bookkeeping_op',      name: 'Inmate Bookkeeping Op',          emoji: '📊',  perHr: 320_000,       baseCost: 230_000_000,      minLevel: 100 },

  // Level 125
  { id: 'halfway_network',     name: 'Halfway House Network',          emoji: '🏘️',  perHr: 480_000,       baseCost: 290_000_000,      minLevel: 125 },
  { id: 'fight_ring',          name: 'Underground Fight Ring',         emoji: '🥊',  perHr: 750_000,       baseCost: 570_000_000,      minLevel: 125 },

  // Level 150
  { id: 'commissary_monopoly', name: 'Commissary Monopoly',            emoji: '🏬',  perHr: 1_100_000,     baseCost: 700_000_000,      minLevel: 150 },
  { id: 'smuggling_empire',    name: 'Smuggling Empire',               emoji: '🚢',  perHr: 1_700_000,     baseCost: 1_400_000_000,    minLevel: 150 },

  // Level 200
  { id: 'statewide_dist',      name: 'Statewide Distribution',         emoji: '🗺️',  perHr: 2_500_000,     baseCost: 1_700_000_000,    minLevel: 200 },
  { id: 'multi_facility',      name: 'Multi-Facility Network',         emoji: '🏰',  perHr: 4_000_000,     baseCost: 3_400_000_000,    minLevel: 200 },

  // Level 250
  { id: 'federal_pipeline',    name: 'Federal Pipeline',               emoji: '🛢️',  perHr: 5_500_000,     baseCost: 3_900_000_000,    minLevel: 250 },
  { id: 'cross_border',        name: 'Cross-Border Operation',         emoji: '✈️',  perHr: 8_500_000,     baseCost: 7_700_000_000,    minLevel: 250 },

  // Level 300
  { id: 'cartel_partner',      name: 'Cartel Partnership',             emoji: '💎',  perHr: 12_000_000,    baseCost: 8_600_000_000,    minLevel: 300 },
  { id: 'money_laundering',    name: 'Money Laundering Front',         emoji: '💸',  perHr: 18_000_000,    baseCost: 17_000_000_000,   minLevel: 300 },

  // Level 400
  { id: 'offshore_acct',       name: 'Offshore Account Network',       emoji: '🏝️',  perHr: 25_000_000,    baseCost: 19_000_000_000,   minLevel: 400 },
  { id: 'crypto_launder',      name: 'Crypto Laundering Op',           emoji: '💻',  perHr: 38_000_000,    baseCost: 38_000_000_000,   minLevel: 400 },

  // Level 500
  { id: 'politician_payroll',  name: 'Politician on Payroll',          emoji: '🗳️',  perHr: 50_000_000,    baseCost: 40_000_000_000,   minLevel: 500 },
  { id: 'fed_judge',           name: 'Federal Judge in Pocket',        emoji: '⚖️',  perHr: 75_000_000,    baseCost: 80_000_000_000,   minLevel: 500 },

  // Level 750
  { id: 'state_senator',       name: 'State Senator Bought',           emoji: '🎖️',  perHr: 100_000_000,   baseCost: 85_000_000_000,   minLevel: 750 },
  { id: 'governor_conn',       name: "Governor's Mansion Connection",  emoji: '🎩',  perHr: 150_000_000,   baseCost: 170_000_000_000,  minLevel: 750 },

  // Level 1000
  { id: 'dea_mole',            name: 'DEA Mole',                       emoji: '🐀',  perHr: 200_000_000,   baseCost: 180_000_000_000,  minLevel: 1000 },
  { id: 'cabinet_bribed',      name: 'Cabinet Member Bribed',          emoji: '💼',  perHr: 300_000_000,   baseCost: 360_000_000_000,  minLevel: 1000 },

  // Level 1500
  { id: 'wall_street',         name: 'Wall Street Connection',         emoji: '📈',  perHr: 400_000_000,   baseCost: 380_000_000_000,  minLevel: 1500 },
  { id: 'fed_reserve',         name: 'Federal Reserve Insider',        emoji: '🏦',  perHr: 600_000_000,   baseCost: 760_000_000_000,  minLevel: 1500 },

  // Level 2000
  { id: 'crime_syndicate',     name: 'International Crime Syndicate',  emoji: '🌍',  perHr: 800_000_000,   baseCost: 800_000_000_000,  minLevel: 2000 },
  { id: 'un_diplomatic',       name: 'UN Diplomatic Cover',            emoji: '🌐',  perHr: 1_200_000_000, baseCost: 1_600_000_000_000, minLevel: 2000 },

  // Level 3000
  { id: 'black_site',          name: 'Black Site Ownership',           emoji: '🕳️',  perHr: 1_600_000_000, baseCost: 1_600_000_000_000, minLevel: 3000 },
  { id: 'private_military',    name: 'Private Military Contractor',    emoji: '🪖',  perHr: 2_400_000_000, baseCost: 3_200_000_000_000, minLevel: 3000 },

  // Level 4000
  { id: 'nation_sponsor',      name: 'Nation-State Sponsorship',       emoji: '🚀',  perHr: 3_200_000_000, baseCost: 3_400_000_000_000, minLevel: 4000 },
  { id: 'shadow_gov',          name: 'Shadow Government',              emoji: '👤',  perHr: 4_800_000_000, baseCost: 6_800_000_000_000, minLevel: 4000 },

  // Level 5000
  { id: 'cartel_emperor',      name: 'Cartel Emperor',                 emoji: '👑',  perHr: 6_400_000_000, baseCost: 7_000_000_000_000, minLevel: 5000 },
  { id: 'underworld_sovereign',name: 'Underworld Sovereign',           emoji: '☠️',  perHr: 9_600_000_000, baseCost: 14_000_000_000_000, minLevel: 5000 },
]

// Per-purchase cost growth (Cat Champions ≈ 2%). Cost(n) = base × COST_GROWTH^n.
export const PROPERTY_COST_GROWTH = 1.02

// (Hit List moved to the live hitListStore — see src/state/hitListStore.js)
