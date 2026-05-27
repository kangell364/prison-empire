// Game Data — Prison Empire

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
  // Seeded for the demo so Battle Dice fires a skill when the roll hits slot 7.
  // Real persistence comes with the Supabase pass.
  learnedSkills:   { soup_cup: { level: 1 } },
  equippedSkills:  { 7: 'soup_cup' },
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
    perPoint: 25, poolMax: 'health',
    description: 'Each Toughness point increases max Health by 25.',
    detail: 'Higher toughness means you absorb beatings without going down.' },
  { id: 'smarts',    label: 'Smarts',    icon: 'ti-brain',    color: '#4a9eff',
    perPoint: 5,  poolMax: 'knowledge',
    description: 'Each Smarts point increases max Knowledge by 5.',
    detail: 'Knowledge unlocks better skills, schemes, and yard influence.' },
  { id: 'muscle',    label: 'Muscle',    icon: 'ti-barbell',  color: '#f0d080',
    perPoint: 10, poolMax: null,
    description: 'Each Muscle point increases attack damage by 10.',
    detail: 'Muscle cuts through enemy defense — harder than gear-based bonuses.' },
  { id: 'cred',      label: 'Cred',      icon: 'ti-star',     color: '#a855f7',
    perPoint: 10, poolMax: null,
    description: 'Each Cred point increases defense by 10.',
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

export const LEADERBOARD = [
  { rank: 1, name: 'IronMike_TX',   emoji: '👑', facility: 'Supermax',     state: 'Texas', power: 892, isYou: false },
  { rank: 2, name: 'YardBoss99',    emoji: '🔥', facility: 'Federal Penn', state: 'Texas', power: 541, isYou: false },
  { rank: 3, name: 'TexasCartel',   emoji: '💎', facility: 'Federal Penn', state: 'Texas', power: 398, isYou: false },
  { rank: 4, name: 'SlickRico',     emoji: '🤵', avatar: '/slickrico.jpg', facility: 'Federal Penn', state: 'Texas', power: 284, isYou: true  },
  { rank: 5, name: 'HoustonKing',   emoji: '🏙️', facility: 'State Prison', state: 'Texas', power: 201, isYou: false },
]

export const CARDS_COLLECTION = [
  { id: 1,  name: 'Slick Rico',      emoji: '🤵', avatar: '/slickrico.jpg', rarity: 'epic',      hustle: 15, muscle: 6,  smarts: 14, cred: 12, owned: true,  special: 'Con Artist'     },
  { id: 2,  name: 'Big T',           emoji: '💪', rarity: 'rare',      hustle: 4,  muscle: 18, smarts: 3,  cred: 9,  owned: true,  special: 'Intimidation'   },
  { id: 3,  name: 'The Professor',   emoji: '🧠', rarity: 'uncommon',  hustle: 6,  muscle: 2,  smarts: 15, cred: 3,  owned: true,  special: 'Legal Eagle'    },
  { id: 4,  name: 'OG Marcus',       emoji: '👴', rarity: 'uncommon',  hustle: 5,  muscle: 7,  smarts: 8,  cred: 12, owned: true,  special: 'Respect'        },
  { id: 5,  name: 'Tiny',            emoji: '🤏', rarity: 'common',    hustle: 7,  muscle: 6,  smarts: 7,  cred: 6,  owned: true,  special: 'Underestimated' },
  { id: 6,  name: 'Fresh Fish Fred', emoji: '😰', rarity: 'common',    hustle: 8,  muscle: 4,  smarts: 6,  cred: 2,  owned: true,  special: 'First Timer'    },
  { id: 7,  name: 'Contraband Carl', emoji: '📦', rarity: 'rare',      hustle: 12, muscle: 5,  smarts: 10, cred: 8,  owned: false, special: 'Black Market'   },
  { id: 8,  name: 'Yard King',       emoji: '👑', rarity: 'legendary', hustle: 18, muscle: 16, smarts: 14, cred: 18, owned: false, special: 'Yard Advantage' },
]

export const BATTLE_ENEMIES = [
  { id: 1,  name: 'Nervous Ned',     emoji: '😰', power: 45,  area: 1, reward_xp: 50,  reward_hustle: 10,  boss: false },
  { id: 2,  name: 'Bully Brad',      emoji: '😤', power: 65,  area: 1, reward_xp: 75,  reward_hustle: 15,  boss: false },
  { id: 3,  name: 'Tattoo Tommy',    emoji: '💀', power: 90,  area: 1, reward_xp: 100, reward_hustle: 20,  boss: false },
  { id: 4,  name: 'Two-Timer Tim',   emoji: '🎭', power: 110, area: 1, reward_xp: 125, reward_hustle: 25,  boss: false },
  { id: 5,  name: 'Intake Ivan',     emoji: '🔱', power: 140, area: 1, reward_xp: 150, reward_hustle: 35,  boss: false },
  { id: 11, name: 'Stoolie Eddie',   emoji: '🐀', avatar: '/stoolie-eddie.jpg', power: 80, area: 1, reward_xp: 110, reward_hustle: 22, boss: false },
  { id: 6,  name: 'CO Johnson',      emoji: '👮', avatar: '/co-johnson.jpg', power: 200, area: 1, reward_xp: 500, reward_hustle: 100, boss: true,  boss_reward_card: true },
  { id: 7,  name: 'Yard Dog Danny',  emoji: '🐕', power: 160, area: 2, reward_xp: 180, reward_hustle: 40,  boss: false },
  { id: 8,  name: 'Weight Room Will',emoji: '🏋️', power: 190, area: 2, reward_xp: 210, reward_hustle: 50,  boss: false },
  { id: 9,  name: 'Chef Chaos',      emoji: '👨‍🍳', power: 280, area: 2, reward_xp: 600, reward_hustle: 150, boss: true,  boss_reward_card: true },
  { id: 10, name: 'Warden Wolf',     emoji: '🐺', power: 400, area: 3, reward_xp: 1000,reward_hustle: 300, boss: true,  boss_reward_card: true, final_boss: true },
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
  { id: 'p1',  name: 'IronMike_TX',      emoji: '👑',  facility: 'Supermax',     state: 'TX', level: 88, power: 892, wins: 312, losses: 8,   kos: 47, defeats: 2,  jobs: 1840 },
  { id: 'p2',  name: 'CarolinaCrown',    emoji: '🦅',  facility: 'Federal Penn', state: 'NC', level: 66, power: 488, wins: 142, losses: 9,   kos: 28, defeats: 1,  jobs: 1620 },
  { id: 'p3',  name: 'MiamiPapi',        emoji: '🌴',  facility: 'Federal Penn', state: 'FL', level: 71, power: 521, wins: 218, losses: 12,  kos: 22, defeats: 1,  jobs: 1340 },
  { id: 'p4',  name: 'YardBoss99',       emoji: '🔥',  facility: 'Federal Penn', state: 'TX', level: 67, power: 541, wins: 198, losses: 17,  kos: 31, defeats: 2,  jobs: 1102 },
  { id: 'p5',  name: 'ChiTownChino',     emoji: '🌃',  facility: 'Federal Penn', state: 'IL', level: 72, power: 612, wins: 145, losses: 26,  kos: 56, defeats: 4,  jobs: 720  },
  { id: 'p6',  name: 'BayouBoss',        emoji: '🐊',  facility: 'State Prison', state: 'LA', level: 56, power: 350, wins: 102, losses: 11,  kos: 18, defeats: 1,  jobs: 1180 },
  { id: 'p7',  name: 'MileHighMack',     emoji: '🏔️', facility: 'Federal Penn', state: 'CO', level: 60, power: 425, wins: 88,  losses: 8,   kos: 15, defeats: 1,  jobs: 1410 },
  { id: 'p8',  name: 'PeachKingpin',     emoji: '🍑',  facility: 'Federal Penn', state: 'GA', level: 63, power: 470, wins: 134, losses: 14,  kos: 41, defeats: 3,  jobs: 580  },
  { id: 'p9',  name: 'EastSideKings',    emoji: '🗽',  facility: 'Federal Penn', state: 'NY', level: 70, power: 580, wins: 167, losses: 22,  kos: 24, defeats: 2,  jobs: 920  },
  { id: 'p10', name: 'TexasCartel',      emoji: '💎',  facility: 'Federal Penn', state: 'TX', level: 61, power: 398, wins: 174, losses: 19,  kos: 22, defeats: 2,  jobs: 980  },
  { id: 'p11', name: 'HoustonKing',      emoji: '🏙️', facility: 'State Prison', state: 'TX', level: 47, power: 201, wins: 64,  losses: 12,  kos: 11, defeats: 1,  jobs: 1245 },
  { id: 'p12', name: 'VegasViper',       emoji: '🐍',  facility: 'Federal Penn', state: 'NV', level: 59, power: 405, wins: 188, losses: 67,  kos: 29, defeats: 11, jobs: 340  },
  { id: 'p13', name: 'LaCoyote',         emoji: '🌵',  facility: 'Federal Penn', state: 'CA', level: 64, power: 487, wins: 220, losses: 89,  kos: 18, defeats: 14, jobs: 410  },
  // You
  { id: 'p_you', name: 'SlickRico',      emoji: '🤵',  avatar: '/slickrico.jpg', facility: 'Federal Penn', state: 'TX', level: 42, power: 284, wins: 47,  losses: 12,  kos: 6,  defeats: 2,  jobs: 320,  isYou: true },
  // Wall of shame — tank the loss-/defeat-leaders
  { id: 'p14', name: '4ShitsAndGiggles', emoji: '😅',  facility: 'County Jail',  state: 'KY', level: 8,  power: 24,  wins: 3,   losses: 294, kos: 0,  defeats: 1,  jobs: 28   },
  { id: 'p15', name: 'Bowser',           emoji: '🐢',  facility: 'County Jail',  state: 'OH', level: 14, power: 48,  wins: 12,  losses: 157, kos: 1,  defeats: 5,  jobs: 88   },
  { id: 'p16', name: 'BurntToast',       emoji: '🍞',  facility: 'County Jail',  state: 'OR', level: 6,  power: 18,  wins: 1,   losses: 89,  kos: 0,  defeats: 8,  jobs: 12   },
  { id: 'p17', name: 'Catcall77',        emoji: '🐱',  facility: 'County Jail',  state: 'WV', level: 22, power: 78,  wins: 24,  losses: 56,  kos: 2,  defeats: 21, jobs: 110  },
  { id: 'p18', name: 'MrMeowgi',         emoji: '😼',  facility: 'County Jail',  state: 'AZ', level: 11, power: 35,  wins: 8,   losses: 67,  kos: 0,  defeats: 4,  jobs: 56   },
  { id: 'p19', name: 'FreshFishFred',    emoji: '😰',  facility: 'County Jail',  state: 'IN', level: 4,  power: 14,  wins: 0,   losses: 47,  kos: 0,  defeats: 12, jobs: 8    },
]

export function streetRep(p) {
  return ((p.kos - p.defeats * 10) * 100) + ((p.wins - p.losses * 5) * 5) + p.jobs
}

// SKILLS — equippable into dice slots 2-12. When a Battle Dice roll sums to a
// slot you have a skill equipped in, that skill fires for the round.
// Learn cost = baseLearnCost. Upgrade cost grows with level. You can upgrade
// at most one skill per player level (gated by PLAYER.lastSkillUpgradeLevel).
// New skill types unlock every 10 player levels.
export const SKILLS = [
  {
    id: 'soup_cup',
    name: 'Steaming Hot Cup of Soup',
    shortName: 'Hot Soup',
    emoji: '🍜',
    description: 'Hurl a scalding cup of soup at your opponent\'s face. Deals additional attack damage and stuns briefly.',
    category: 'Specialty',
    minLevel: 1,
    maxLevel: 100,
    perLevelAttack: 35,                           // +35 attack damage per skill level
    baseLearnCost:    { knowledge: 16, hustle: 2_400 },
    upgradeCostFor: (currentLevel) => ({
      knowledge: 16 + currentLevel * 4,
      hustle:    2_400 * (currentLevel + 1),
    }),
  },
  // Future skills (level 10, 20, ...) get added here as more tiers unlock.
]

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

// Active Hit List — community-funded bounties. Targets reference RANKED_PLAYERS.id.
export const HIT_LIST = [
  { id: 1, targetId: 'p4',  bountyHustle: 2_400_000, contributors: 12, openedDaysAgo: 3, openedHoursAgo: 4  },
  { id: 2, targetId: 'p13', bountyHustle: 1_850_000, contributors: 9,  openedDaysAgo: 6, openedHoursAgo: 2  },
  { id: 3, targetId: 'p9',  bountyHustle:   890_000, contributors: 5,  openedDaysAgo: 1, openedHoursAgo: 11 },
  { id: 4, targetId: 'p8',  bountyHustle:   670_000, contributors: 4,  openedDaysAgo: 2, openedHoursAgo: 0  },
  { id: 5, targetId: 'p12', bountyHustle:   145_000, contributors: 2,  openedDaysAgo: 0, openedHoursAgo: 8  },
]
