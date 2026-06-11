// Skill effect engine — Phase 2 of the Jailhouse Affix system (docs/skill-cards-spec.md).
//
// Pure logic, no React. Turns a skill's declarative `effect` block (see the
// SKILLS schema in gameData.js) into live, timed combat effects that BattleDice
// ticks each roll. Four primitives:
//
//   dot      — damage over the next N rolls (e.g. Shiv bleed)
//   disable  — mute a side's skill slots for N rolls (The Hole, Lights Out)
//   modifier — flat atk/def shift for N rolls or the whole fight (Shakedown, The Badge)
//   dice     — steer the shared roll toward the owner's slots (Loaded Dice)
//
// Payout (Contraband's 2× on a killing blow) is NOT a lasting effect — the caller
// checks it inline at KO time. fizzleChance gates whether an effect lands at all.
//
// An active effect instance:
//   { kind, appliesTo:'player'|'opp', owner:'player'|'opp', rollsLeft:number|Infinity,
//     source:skillId, label, ...payload }
//   dot:      { pctMaxHp, drained, refundOnExpire }
//   disable:  { slots:'even'|'odd'|'all'|[..] }
//   modifier: { atkDelta, defDelta }
//   dice:     { nudge }

// --- helpers --------------------------------------------------------

const foeOf = (owner) => (owner === 'player' ? 'opp' : 'player')

// Which side an effect's `target` lands on, relative to who cast it.
function sideOf(target, owner) {
  if (target === 'self') return owner
  if (target === 'opponent') return foeOf(owner)
  return null // 'both' is expanded by the caller
}

// Magnitude scaled by CARD level (merge) AND POTENCY (the Hustle upgrade, §1a):
//   base + perLevel×(level−1) + base×POTENCY_FRAC×potency
// `field` keys the scalePerLevel map (e.g. a Lvl 3 Shiv bleeds more). Potency
// boosts the BENEFIT only — self-costs stay flat (see instancesFromCost), so
// upgrading never increases the holder's downside.
export const POTENCY_FRAC = 0.04   // +4% of base per potency level (max 20 → +80%)
function scaled(base, scalePerLevel, field, level, potency = 0) {
  const per = scalePerLevel && scalePerLevel[field] ? scalePerLevel[field] : 0
  return base + per * (Math.max(1, level) - 1) + base * POTENCY_FRAC * (potency || 0)
}

// Flat atk/def deltas from a percentage modifier on `side`, off its base stats.
// base = { player:{atk,def}, opp:{atk,def} }.
function pctDeltas(stat, pct, side, base) {
  const b = base[side]
  if (stat === 'atk') return { atkDelta: Math.round((b.atk * pct) / 100), defDelta: 0 }
  if (stat === 'def') return { atkDelta: 0, defDelta: Math.round((b.def * pct) / 100) }
  return { atkDelta: 0, defDelta: 0 }
}

// A selfCost block → effect instances on the OWNER (the recoverable cost).
function instancesFromCost(cost, owner, base, skillDef, level) {
  if (!cost) return []
  const rolls = cost.duration === 'fight' ? Infinity : (cost.rolls || cost.duration || 1)
  if (cost.kind === 'dot') {
    return [{
      kind: 'dot', appliesTo: owner, owner, rollsLeft: cost.rolls || 1,
      pctMaxHp: cost.pctMaxHp || 0, drained: 0, refundOnExpire: !!cost.refundOnExpire,
      source: skillDef.id, label: `${skillDef.shortName} (self)`,
    }]
  }
  if (cost.kind === 'disable') {
    return [{
      kind: 'disable', appliesTo: owner, owner, rollsLeft: cost.rolls || 1,
      slots: cost.slots || 'all', source: skillDef.id, label: `${skillDef.shortName} (self)`,
    }]
  }
  // modifier cost (e.g. The Badge / Contraband −% atk while equipped)
  if (cost.stat) {
    const { atkDelta, defDelta } = pctDeltas(cost.stat, cost.pct || 0, owner, base)
    return [{
      kind: 'modifier', appliesTo: owner, owner, rollsLeft: rolls,
      atkDelta, defDelta, source: skillDef.id, label: `${skillDef.shortName} (cost)`,
    }]
  }
  return []
}

// --- public: build effects from a fired skill -----------------------

// Returns the lasting effect instances a freshly-fired skill creates. `owner` is
// who fired it. `base` = { player:{atk,def}, opp:{atk,def} } constants.
// Returns [] for a pure nuke (no effect block) or a fizzle.
export function effectInstancesFor(skillDef, level, owner, base, didFizzle, potency = 0) {
  const eff = skillDef.effect
  if (!eff) return []
  // A fizzle skips the MAIN effect (and its self-cost) — the swing still landed
  // (base attack bonus is applied by the caller), the gear just failed.
  if (didFizzle) return []

  const out = []
  const sp = eff.scalePerLevel

  if (eff.kind === 'dot') {
    const side = sideOf(eff.target, owner) || foeOf(owner)
    out.push({
      kind: 'dot', appliesTo: side, owner,
      rollsLeft: Math.round(scaled(eff.rolls || 1, sp, 'rolls', level, potency)),
      pctMaxHp: scaled(eff.pctMaxHp || 0, sp, 'pctMaxHp', level, potency),
      drained: 0, refundOnExpire: false,
      source: skillDef.id, label: skillDef.shortName,
    })
  } else if (eff.kind === 'disable') {
    const side = sideOf(eff.target, owner) || foeOf(owner)
    out.push({
      kind: 'disable', appliesTo: side, owner,
      rollsLeft: Math.round(scaled(eff.rolls || 1, sp, 'rolls', level, potency)),
      slots: eff.slots || 'all', source: skillDef.id, label: skillDef.shortName,
    })
  } else if (eff.kind === 'dice') {
    out.push({
      kind: 'dice', appliesTo: owner, owner,
      rollsLeft: Math.round(scaled(eff.rolls || 1, sp, 'rolls', level, potency)),
      nudge: eff.nudge || 1, source: skillDef.id, label: skillDef.shortName,
    })
  } else if (eff.kind === 'modifier') {
    const rolls = eff.duration === 'fight' ? Infinity : (eff.rolls || eff.duration || 1)
    const pct = scaled(eff.pct || 0, sp, 'pct', level, potency)
    if (eff.stat === 'payout') {
      // Payout is resolved inline at KO time — no lasting stat effect here.
    } else if (eff.target === 'both') {
      // e.g. Shakedown: both lose def; the stripped def is converted onto the
      // OWNER's attack. Compute flat deltas off each side's base.
      const ownerD = pctDeltas(eff.stat, pct, owner, base)
      const foeD   = pctDeltas(eff.stat, pct, foeOf(owner), base)
      out.push({ kind: 'modifier', appliesTo: foeOf(owner), owner, rollsLeft: rolls,
        atkDelta: foeD.atkDelta, defDelta: foeD.defDelta, source: skillDef.id, label: skillDef.shortName })
      let ownerMod = { atkDelta: ownerD.atkDelta, defDelta: ownerD.defDelta }
      if (eff.convertTo === 'atk') {
        // gain = everything stripped from both sides (deltas are negative)
        ownerMod.atkDelta += -(ownerD.defDelta + foeD.defDelta)
      }
      out.push({ kind: 'modifier', appliesTo: owner, owner, rollsLeft: rolls,
        ...ownerMod, source: skillDef.id, label: skillDef.shortName })
    } else {
      const side = sideOf(eff.target, owner) || owner
      const { atkDelta, defDelta } = pctDeltas(eff.stat, pct, side, base)
      out.push({ kind: 'modifier', appliesTo: side, owner, rollsLeft: rolls,
        atkDelta, defDelta, source: skillDef.id, label: skillDef.shortName })
    }
  }

  // The holder's recoverable cost (Design Law: holder's downside is conditional).
  out.push(...instancesFromCost(eff.selfCost, owner, base, skillDef, level))
  return out
}

// True if this skill should fizzle this fire (prison-made gear misfires).
export function rollFizzle(skillDef, rng = Math.random) {
  const c = skillDef.effect && skillDef.effect.fizzleChance
  return c ? rng() < c : false
}

// --- public: merge new effects in, de-duping fight-long modifiers ---

// Fight-duration (Infinity) modifiers from the same source+side REFRESH rather
// than stack, so re-firing Shakedown/The Badge can't spiral atk/def.
export function addEffects(active, incoming) {
  const next = active.slice()
  for (const e of incoming) {
    if (e.rollsLeft === Infinity && e.kind === 'modifier') {
      const dup = next.findIndex(x => x.kind === 'modifier' && x.source === e.source && x.appliesTo === e.appliesTo && x.rollsLeft === Infinity)
      if (dup >= 0) { next[dup] = e; continue }
    }
    next.push(e)
  }
  return next
}

// --- public: per-roll tick ------------------------------------------

// Start-of-roll tick: apply DOT damage, decrement finite durations, and on expiry
// refund any drained HP (refundOnExpire). Returns the next effect array plus the
// HP deltas and log lines to surface. maxHp = { player, opp }.
export function tickEffects(active, maxHp) {
  const dmg  = { player: 0, opp: 0 }
  const heal = { player: 0, opp: 0 }
  const logs = []
  const next = []

  for (const e of active) {
    let eff = e
    // DOT ticks BEFORE its duration is spent this roll.
    if (eff.kind === 'dot' && eff.rollsLeft > 0) {
      const tick = Math.max(1, Math.round((maxHp[eff.appliesTo] * eff.pctMaxHp) / 100))
      dmg[eff.appliesTo] += tick
      eff = { ...eff, drained: eff.drained + tick }
      logs.push({ side: eff.appliesTo === 'opp' ? 'you' : 'opp', text: `${eff.label}: −${tick} (bleed)`, kind: 'dot' })
    }

    if (eff.rollsLeft === Infinity) { next.push(eff); continue }
    const left = eff.rollsLeft - 1
    if (left > 0) { next.push({ ...eff, rollsLeft: left }); continue }

    // expired this roll
    if (eff.kind === 'dot' && eff.refundOnExpire && eff.drained > 0) {
      heal[eff.appliesTo] += eff.drained
      logs.push({ side: eff.appliesTo === 'player' ? 'you' : 'opp', text: `${eff.label}: +${eff.drained} HP returned`, kind: 'refund' })
    } else if (eff.kind === 'disable') {
      logs.push({ side: eff.appliesTo === 'player' ? 'you' : 'opp', text: `${eff.label}: lockdown lifts`, kind: 'expire' })
    }
  }
  return { effects: next, dmg, heal, logs }
}

// --- public: queries -------------------------------------------------

const slotMatches = (slots, slot) =>
  slots === 'all' ? true
    : slots === 'even' ? slot % 2 === 0
    : slots === 'odd' ? slot % 2 === 1
    : Array.isArray(slots) ? slots.includes(slot)
    : false

// Is `side`'s skill in `slot` muted by an active disable?
export function slotMutedFor(active, side, slot) {
  return active.some(e => e.kind === 'disable' && e.appliesTo === side && slotMatches(e.slots, slot))
}

// Cumulative atk/def deltas on `side` from active modifiers.
export function statDeltas(active, side) {
  let atkDelta = 0, defDelta = 0
  for (const e of active) {
    if (e.kind === 'modifier' && e.appliesTo === side) { atkDelta += e.atkDelta || 0; defDelta += e.defDelta || 0 }
  }
  return { atkDelta, defDelta }
}

// Steer the shared roll toward the owner's equipped slots using active dice
// effects. Tries the smallest nudge (within range, in 2..12) that lands on one
// of the owner's slots; otherwise leaves it. equipped = { player:Set, opp:Set }.
export function applyDiceNudge(active, rawSlot, equipped) {
  let slot = rawSlot
  for (const e of active) {
    if (e.kind !== 'dice') continue
    const want = equipped[e.appliesTo]
    if (!want || want.size === 0) continue
    for (let d = 1; d <= e.nudge; d++) {
      if (want.has(slot + d) && slot + d <= 12) { slot = slot + d; break }
      if (want.has(slot - d) && slot - d >= 2) { slot = slot - d; break }
    }
  }
  return slot
}
