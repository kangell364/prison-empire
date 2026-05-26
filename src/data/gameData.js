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
  card: {
    id: 'slick_rico',
    name: 'Slick Rico',
    emoji: '🤵',
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
  { rank: 4, name: 'SlickRico',     emoji: '🤵', facility: 'Federal Penn', state: 'Texas', power: 284, isYou: true  },
  { rank: 5, name: 'HoustonKing',   emoji: '🏙️', facility: 'State Prison', state: 'Texas', power: 201, isYou: false },
]

export const CARDS_COLLECTION = [
  { id: 1,  name: 'Slick Rico',      emoji: '🤵', rarity: 'epic',      hustle: 15, muscle: 6,  smarts: 14, cred: 12, owned: true,  special: 'Con Artist'     },
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
  { id: 6,  name: 'CO Johnson',      emoji: '👮', power: 200, area: 1, reward_xp: 500, reward_hustle: 100, boss: true,  boss_reward_card: true },
  { id: 7,  name: 'Yard Dog Danny',  emoji: '🐕', power: 160, area: 2, reward_xp: 180, reward_hustle: 40,  boss: false },
  { id: 8,  name: 'Weight Room Will',emoji: '🏋️', power: 190, area: 2, reward_xp: 210, reward_hustle: 50,  boss: false },
  { id: 9,  name: 'Chef Chaos',      emoji: '👨‍🍳', power: 280, area: 2, reward_xp: 600, reward_hustle: 150, boss: true,  boss_reward_card: true },
  { id: 10, name: 'Warden Wolf',     emoji: '🐺', power: 400, area: 3, reward_xp: 1000,reward_hustle: 300, boss: true,  boss_reward_card: true, final_boss: true },
]

export const MAP_CITIES = [
  { id: 1,  name: 'Houston',       state: 'TX', tier: 3, owner: 'SlickRico',  isYours: true,  x: 48, y: 72 },
  { id: 2,  name: 'Dallas',        state: 'TX', tier: 3, owner: 'YardBoss99', isYours: false, x: 52, y: 42 },
  { id: 3,  name: 'Austin',        state: 'TX', tier: 2, owner: 'TexasCartel',isYours: false, x: 42, y: 58 },
  { id: 4,  name: 'San Antonio',   state: 'TX', tier: 2, owner: null,         isYours: false, x: 38, y: 68 },
  { id: 5,  name: 'El Paso',       state: 'TX', tier: 1, owner: 'HoustonKing',isYours: false, x: 18, y: 52 },
  { id: 6,  name: 'Fort Worth',    state: 'TX', tier: 2, owner: 'YardBoss99', isYours: false, x: 49, y: 38 },
  { id: 7,  name: 'Lubbock',       state: 'TX', tier: 1, owner: null,         isYours: false, x: 28, y: 28 },
  { id: 8,  name: 'Amarillo',      state: 'TX', tier: 1, owner: null,         isYours: false, x: 28, y: 14 },
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
