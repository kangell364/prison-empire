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
  // Texas — preserved + extended (player owns Houston)
  { id: 1,   name: 'Houston',         state: 'TX', tier: 3, owner: 'SlickRico',     isYours: true  },
  { id: 2,   name: 'Dallas',          state: 'TX', tier: 3, owner: 'YardBoss99',    isYours: false },
  { id: 3,   name: 'Austin',          state: 'TX', tier: 2, owner: 'TexasCartel',   isYours: false },
  { id: 4,   name: 'San Antonio',     state: 'TX', tier: 2, owner: null,            isYours: false },
  { id: 5,   name: 'El Paso',         state: 'TX', tier: 1, owner: 'HoustonKing',   isYours: false },
  { id: 6,   name: 'Fort Worth',      state: 'TX', tier: 2, owner: 'YardBoss99',    isYours: false },

  // Northeast
  { id: 10,  name: 'New York City',   state: 'NY', tier: 3, owner: 'EastSideKings', isYours: false },
  { id: 11,  name: 'Buffalo',         state: 'NY', tier: 2, owner: null,            isYours: false },
  { id: 12,  name: 'Rochester',       state: 'NY', tier: 1, owner: null,            isYours: false },
  { id: 13,  name: 'Boston',          state: 'MA', tier: 3, owner: 'EastSideKings', isYours: false },
  { id: 14,  name: 'Worcester',       state: 'MA', tier: 1, owner: null,            isYours: false },
  { id: 15,  name: 'Newark',          state: 'NJ', tier: 2, owner: 'EastSideKings', isYours: false },
  { id: 16,  name: 'Jersey City',     state: 'NJ', tier: 2, owner: null,            isYours: false },
  { id: 17,  name: 'Philadelphia',    state: 'PA', tier: 3, owner: null,            isYours: false },
  { id: 18,  name: 'Pittsburgh',      state: 'PA', tier: 2, owner: null,            isYours: false },
  { id: 19,  name: 'Hartford',        state: 'CT', tier: 1, owner: null,            isYours: false },
  { id: 20,  name: 'Bridgeport',      state: 'CT', tier: 1, owner: null,            isYours: false },
  { id: 21,  name: 'Providence',      state: 'RI', tier: 1, owner: null,            isYours: false },
  { id: 22,  name: 'Manchester',      state: 'NH', tier: 1, owner: null,            isYours: false },
  { id: 23,  name: 'Burlington',      state: 'VT', tier: 1, owner: null,            isYours: false },
  { id: 24,  name: 'Portland',        state: 'ME', tier: 1, owner: null,            isYours: false },

  // Mid-Atlantic & Southeast
  { id: 30,  name: 'Baltimore',       state: 'MD', tier: 2, owner: null,            isYours: false },
  { id: 31,  name: 'Annapolis',       state: 'MD', tier: 1, owner: null,            isYours: false },
  { id: 32,  name: 'Wilmington',      state: 'DE', tier: 1, owner: null,            isYours: false },
  { id: 33,  name: 'Richmond',        state: 'VA', tier: 2, owner: null,            isYours: false },
  { id: 34,  name: 'Virginia Beach',  state: 'VA', tier: 2, owner: null,            isYours: false },
  { id: 35,  name: 'Charleston',      state: 'WV', tier: 1, owner: null,            isYours: false },
  { id: 36,  name: 'Charlotte',       state: 'NC', tier: 3, owner: 'CarolinaCrown', isYours: false },
  { id: 37,  name: 'Raleigh',         state: 'NC', tier: 2, owner: null,            isYours: false },
  { id: 38,  name: 'Greensboro',      state: 'NC', tier: 1, owner: null,            isYours: false },
  { id: 39,  name: 'Charleston',      state: 'SC', tier: 2, owner: null,            isYours: false },
  { id: 40,  name: 'Columbia',        state: 'SC', tier: 1, owner: 'CarolinaCrown', isYours: false },
  { id: 41,  name: 'Atlanta',         state: 'GA', tier: 3, owner: 'PeachKingpin',  isYours: false },
  { id: 42,  name: 'Savannah',        state: 'GA', tier: 1, owner: null,            isYours: false },
  { id: 43,  name: 'Augusta',         state: 'GA', tier: 1, owner: null,            isYours: false },
  { id: 44,  name: 'Miami',           state: 'FL', tier: 3, owner: 'MiamiPapi',     isYours: false },
  { id: 45,  name: 'Orlando',         state: 'FL', tier: 2, owner: null,            isYours: false },
  { id: 46,  name: 'Tampa',           state: 'FL', tier: 2, owner: 'MiamiPapi',     isYours: false },
  { id: 47,  name: 'Jacksonville',    state: 'FL', tier: 2, owner: null,            isYours: false },

  // South Central / Gulf
  { id: 50,  name: 'Nashville',       state: 'TN', tier: 3, owner: null,            isYours: false },
  { id: 51,  name: 'Memphis',         state: 'TN', tier: 2, owner: null,            isYours: false },
  { id: 52,  name: 'Knoxville',       state: 'TN', tier: 1, owner: null,            isYours: false },
  { id: 53,  name: 'Louisville',      state: 'KY', tier: 2, owner: null,            isYours: false },
  { id: 54,  name: 'Lexington',       state: 'KY', tier: 1, owner: null,            isYours: false },
  { id: 55,  name: 'Birmingham',      state: 'AL', tier: 2, owner: null,            isYours: false },
  { id: 56,  name: 'Montgomery',      state: 'AL', tier: 1, owner: null,            isYours: false },
  { id: 57,  name: 'Mobile',          state: 'AL', tier: 1, owner: null,            isYours: false },
  { id: 58,  name: 'Jackson',         state: 'MS', tier: 1, owner: null,            isYours: false },
  { id: 59,  name: 'Gulfport',        state: 'MS', tier: 1, owner: null,            isYours: false },
  { id: 60,  name: 'New Orleans',     state: 'LA', tier: 3, owner: 'BayouBoss',     isYours: false },
  { id: 61,  name: 'Baton Rouge',     state: 'LA', tier: 2, owner: null,            isYours: false },
  { id: 62,  name: 'Shreveport',      state: 'LA', tier: 1, owner: null,            isYours: false },
  { id: 63,  name: 'Little Rock',     state: 'AR', tier: 1, owner: null,            isYours: false },
  { id: 64,  name: 'Fayetteville',    state: 'AR', tier: 1, owner: null,            isYours: false },
  { id: 65,  name: 'Oklahoma City',   state: 'OK', tier: 2, owner: null,            isYours: false },
  { id: 66,  name: 'Tulsa',           state: 'OK', tier: 2, owner: null,            isYours: false },

  // Midwest
  { id: 70,  name: 'Chicago',         state: 'IL', tier: 3, owner: 'ChiTownChino',  isYours: false },
  { id: 71,  name: 'Springfield',     state: 'IL', tier: 1, owner: null,            isYours: false },
  { id: 72,  name: 'Indianapolis',    state: 'IN', tier: 2, owner: null,            isYours: false },
  { id: 73,  name: 'Fort Wayne',      state: 'IN', tier: 1, owner: null,            isYours: false },
  { id: 74,  name: 'Columbus',        state: 'OH', tier: 3, owner: null,            isYours: false },
  { id: 75,  name: 'Cleveland',       state: 'OH', tier: 2, owner: 'ChiTownChino',  isYours: false },
  { id: 76,  name: 'Cincinnati',      state: 'OH', tier: 2, owner: null,            isYours: false },
  { id: 77,  name: 'Detroit',         state: 'MI', tier: 3, owner: null,            isYours: false },
  { id: 78,  name: 'Grand Rapids',    state: 'MI', tier: 1, owner: null,            isYours: false },
  { id: 79,  name: 'Milwaukee',       state: 'WI', tier: 2, owner: null,            isYours: false },
  { id: 80,  name: 'Madison',         state: 'WI', tier: 1, owner: null,            isYours: false },
  { id: 81,  name: 'Minneapolis',     state: 'MN', tier: 3, owner: null,            isYours: false },
  { id: 82,  name: 'Saint Paul',      state: 'MN', tier: 2, owner: null,            isYours: false },
  { id: 83,  name: 'Des Moines',      state: 'IA', tier: 1, owner: null,            isYours: false },
  { id: 84,  name: 'Cedar Rapids',    state: 'IA', tier: 1, owner: null,            isYours: false },
  { id: 85,  name: 'Saint Louis',     state: 'MO', tier: 2, owner: null,            isYours: false },
  { id: 86,  name: 'Kansas City',     state: 'MO', tier: 2, owner: null,            isYours: false },
  { id: 87,  name: 'Wichita',         state: 'KS', tier: 1, owner: null,            isYours: false },
  { id: 88,  name: 'Topeka',          state: 'KS', tier: 1, owner: null,            isYours: false },
  { id: 89,  name: 'Omaha',           state: 'NE', tier: 1, owner: null,            isYours: false },
  { id: 90,  name: 'Lincoln',         state: 'NE', tier: 1, owner: null,            isYours: false },

  // Plains & Mountain
  { id: 100, name: 'Fargo',           state: 'ND', tier: 1, owner: null,            isYours: false },
  { id: 101, name: 'Bismarck',        state: 'ND', tier: 1, owner: null,            isYours: false },
  { id: 102, name: 'Sioux Falls',     state: 'SD', tier: 1, owner: null,            isYours: false },
  { id: 103, name: 'Rapid City',      state: 'SD', tier: 1, owner: null,            isYours: false },
  { id: 104, name: 'Billings',        state: 'MT', tier: 1, owner: null,            isYours: false },
  { id: 105, name: 'Missoula',        state: 'MT', tier: 1, owner: null,            isYours: false },
  { id: 106, name: 'Cheyenne',        state: 'WY', tier: 1, owner: null,            isYours: false },
  { id: 107, name: 'Casper',          state: 'WY', tier: 1, owner: null,            isYours: false },
  { id: 108, name: 'Denver',          state: 'CO', tier: 3, owner: 'MileHighMack',  isYours: false },
  { id: 109, name: 'Colorado Springs',state: 'CO', tier: 2, owner: null,            isYours: false },
  { id: 110, name: 'Salt Lake City',  state: 'UT', tier: 2, owner: null,            isYours: false },
  { id: 111, name: 'Provo',           state: 'UT', tier: 1, owner: null,            isYours: false },
  { id: 112, name: 'Albuquerque',     state: 'NM', tier: 2, owner: null,            isYours: false },
  { id: 113, name: 'Santa Fe',        state: 'NM', tier: 1, owner: null,            isYours: false },
  { id: 114, name: 'Boise',           state: 'ID', tier: 1, owner: null,            isYours: false },
  { id: 115, name: 'Idaho Falls',     state: 'ID', tier: 1, owner: null,            isYours: false },

  // West Coast
  { id: 120, name: 'Seattle',         state: 'WA', tier: 3, owner: null,            isYours: false },
  { id: 121, name: 'Spokane',         state: 'WA', tier: 1, owner: null,            isYours: false },
  { id: 122, name: 'Tacoma',          state: 'WA', tier: 1, owner: null,            isYours: false },
  { id: 123, name: 'Portland',        state: 'OR', tier: 2, owner: null,            isYours: false },
  { id: 124, name: 'Eugene',          state: 'OR', tier: 1, owner: null,            isYours: false },
  { id: 125, name: 'Los Angeles',     state: 'CA', tier: 3, owner: 'LaCoyote',      isYours: false },
  { id: 126, name: 'San Francisco',   state: 'CA', tier: 3, owner: null,            isYours: false },
  { id: 127, name: 'San Diego',       state: 'CA', tier: 3, owner: 'LaCoyote',      isYours: false },
  { id: 128, name: 'Sacramento',      state: 'CA', tier: 2, owner: null,            isYours: false },
  { id: 129, name: 'Las Vegas',       state: 'NV', tier: 3, owner: 'VegasViper',    isYours: false },
  { id: 130, name: 'Reno',            state: 'NV', tier: 1, owner: null,            isYours: false },
  { id: 131, name: 'Phoenix',         state: 'AZ', tier: 3, owner: null,            isYours: false },
  { id: 132, name: 'Tucson',          state: 'AZ', tier: 2, owner: null,            isYours: false },

  // Non-contiguous
  { id: 140, name: 'Anchorage',       state: 'AK', tier: 2, owner: null,            isYours: false },
  { id: 141, name: 'Juneau',          state: 'AK', tier: 1, owner: null,            isYours: false },
  { id: 142, name: 'Honolulu',        state: 'HI', tier: 2, owner: null,            isYours: false },
  { id: 143, name: 'Hilo',            state: 'HI', tier: 1, owner: null,            isYours: false },
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
