// Bonus-affix pool — Phase 3 of the Jailhouse Affix system (docs/skill-cards-spec.md).
//
// These are the RANDOM bonus skills a card rolls when you merge it (Model A: the
// Lvl 1 signature is fixed to the card's art; merging rolls a bonus from this
// pool, up to a cap of 3 total). Affixes are EFFECT-ONLY — they ride on a card
// that already has art, so the pool can grow without new art (this is the
// append-only retention lever in spec §6).
//
// Each affix reuses the Phase 2 effect schema (see SKILLS in gameData.js and the
// engine in src/combat/skillEffects.js). `target` is relative to the card's owner
// in combat. Rolls are rarity-weighted by AFFIX_ROLL_WEIGHTS below.

export const SKILL_AFFIXES = [
  // ---- common (~40%): small reliable trims --------------------------
  { id: 'nick',       name: 'Nick',        icon: '🩸', rarity: 'common',
    effect: { kind: 'dot', target: 'opponent', pctMaxHp: 1, rolls: 2 } },
  { id: 'jab',        name: 'Jab',         icon: '🥊', rarity: 'common',
    effect: { kind: 'modifier', target: 'self', stat: 'atk', pct: 6, duration: 'fight' } },
  { id: 'guard',      name: 'Guard',       icon: '🛡️', rarity: 'common',
    effect: { kind: 'modifier', target: 'self', stat: 'def', pct: 8, duration: 'fight' } },
  { id: 'quick_hands',name: 'Quick Hands', icon: '🎲', rarity: 'common',
    effect: { kind: 'dice', target: 'self', nudge: 1, rolls: 1 } },

  // ---- uncommon (~30%) ----------------------------------------------
  { id: 'gash',       name: 'Gash',        icon: '🩸', rarity: 'uncommon',
    effect: { kind: 'dot', target: 'opponent', pctMaxHp: 2, rolls: 3 } },
  { id: 'brace',      name: 'Brace',       icon: '🛡️', rarity: 'uncommon',
    effect: { kind: 'modifier', target: 'self', stat: 'def', pct: 12, duration: 'fight' } },
  { id: 'rattle',     name: 'Rattle',      icon: '🔻', rarity: 'uncommon',
    effect: { kind: 'modifier', target: 'opponent', stat: 'atk', pct: -8, duration: 'fight' } },

  // ---- rare (~20%) --------------------------------------------------
  { id: 'lockup',     name: 'Lockup',      icon: '🔒', rarity: 'rare',
    effect: { kind: 'disable', target: 'opponent', slots: 'odd', rolls: 2 } },
  { id: 'adrenaline', name: 'Adrenaline',  icon: '⚡', rarity: 'rare',
    effect: { kind: 'modifier', target: 'self', stat: 'atk', pct: 15, duration: 'fight' } },

  // ---- epic (~8%) ---------------------------------------------------
  { id: 'haymaker',   name: 'Haymaker',    icon: '💥', rarity: 'epic',
    effect: { kind: 'modifier', target: 'self', stat: 'atk', pct: 22, duration: 'fight' } },
  { id: 'blackout',   name: 'Blackout',    icon: '🕳️', rarity: 'epic',
    effect: { kind: 'disable', target: 'opponent', slots: 'all', rolls: 1 } },

  // ---- legendary (~2%): build-defining ------------------------------
  { id: 'riot',       name: 'Riot',        icon: '🔥', rarity: 'legendary',
    effect: { kind: 'dot', target: 'opponent', pctMaxHp: 4, rolls: 3 } },
]

// Relative roll weights by rarity (spec §6: 40/30/20/8/2). The roller picks a
// rarity by weight, then a uniform affix within it — so adding more commons keeps
// commons common without re-tuning every weight.
export const AFFIX_ROLL_WEIGHTS = { common: 40, uncommon: 30, rare: 20, epic: 8, legendary: 2 }

export const AFFIX_BY_ID = Object.fromEntries(SKILL_AFFIXES.map(a => [a.id, a]))

export function affixById(id) { return AFFIX_BY_ID[id] || null }
