import React, { useState, useEffect, useMemo, useRef } from 'react'
import { SKILLS } from '../data/gameData'
import { getBattleSkillLoadout } from '../state/skillLoadoutStore'
import { SKILL_DMG_PER_LEVEL } from '../state/skillUpgradesStore'
import { effectInstancesFor, rollFizzle, addEffects, tickEffects, slotMutedFor, statDeltas, applyDiceNudge } from '../combat/skillEffects'
import { SkillCardPopup } from './SkillCardPopup'
import { CharacterDetailModal } from './CharacterDetailModal'
import { sfx } from '../sounds'
import { Avatar } from './Avatar'
import { usePlayerCard } from '../state/profileStore'
import { useVitals, openNurse, knockOut } from '../state/vitalsStore'
import { usePlayerCombat } from '../state/statsStore'

const GOLD   = '#c9a84c'
const BLUE   = '#4a9eff'
const ORANGE = '#f39c12'
const RED    = '#e74c3c'
const GREEN  = '#2ecc71'

// Ratio damage model: damage = ATK² / (ATK + DEF), min 1. Always does some
// damage (no 0-walls), scales smoothly across 2,000 levels, and small stat
// gaps no longer flip a fight between unwinnable and trivial.
function dmg(atk, def) {
  return Math.max(1, Math.round((atk * atk) / (atk + def)))
}

// Deterministic per-opponent skill loadout — same opponent always gets the same
// loadout so fights feel consistent. Procedurally generated from id/name + power.
// Exported so the detail card can preview a boss's loadout before the fight.
export function opponentSkillLoadout(opp) {
  if (!opp) return {}
  // Hand-authored loadout (bosses carry `skills`, even if empty) wins over the
  // procedural one — and an empty object means "no skills", not "roll some".
  if (opp.skills) return opp.skills
  if (!SKILLS.length) return {}   // no skills defined → empty loadout
  const seedStr = String(opp.id ?? opp.name ?? 'x')
  let s = 0
  for (let i = 0; i < seedStr.length; i++) s = (s * 31 + seedStr.charCodeAt(i)) >>> 0
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  const power     = opp.power || 100
  const numSkills = power >= 300 ? 4 : power >= 150 ? 3 : power >= 60 ? 2 : 1
  const out = {}
  let tries = 0
  while (Object.keys(out).length < numSkills && tries++ < numSkills * 4) {
    const slot = 2 + Math.floor(rng() * 11)
    if (out[slot]) continue
    const skill = SKILLS[Math.floor(rng() * SKILLS.length)]
    out[slot] = { skillId: skill.id, level: Math.max(1, Math.min(skill.maxLevel || 100, Math.floor(power / 80))) }
  }
  return out
}

// Universal Battle Dice modal — two modes:
//   mode='duel'      (default, PvP) — a self-contained fight; HP resets each
//                    bout; ends win/lose when someone hits 0.
//   mode='attrition' (bosses)       — the boss NEVER heals. oppStartHp seeds
//                    from its persisted remaining HP; every roll chips it down
//                    for good (caller persists via onHit). The player fights on
//                    their real, regenerating health — if it bottoms out you
//                    RETREAT to heal (not a loss); the boss keeps its wounds.
//
// Props:
//   opponent   — { name, emoji, power, level, atk?, def?, hp? }  (atk/def/hp
//                used directly when present; else derived from power)
//   mode       — 'duel' | 'attrition'
//   oppStartHp — attrition: the boss's current remaining HP (defaults to max)
//   cost       — stamina per roll
//   rewards    — { xp, hustle, skillTokens, cardDrop?, multText? }
//   onClose    — close
//   onRoll     — fires on each ROLL (caller deducts stamina)
//   onHit      — attrition: fires per roll with { dealtToOpp, dealtToPlayer } so
//                the caller persists boss HP + spends real health
//   onWin      — fires when the opponent is KO'd
//   onResult   — duel: fires once on resolve with { result, damageTaken, maxHp }
export function BattleDiceModal({ opponent, mode = 'duel', oppStartHp, cost, rewards, attackXp, onClose, onRoll, onHit, onAttack, onWin, onResult }) {
  const me = usePlayerCard()
  const vitals = useVitals()
  const stamina = vitals.stamina
  const combat = usePlayerCombat()          // live player atk/def/hp/level from real traits
  const healthMax = vitals.healthMax        // Toughness-driven; == combat.hp (same source)
  const STAMINA_MAX = vitals.staminaMax     // Hustle-driven max for the stamina bar
  const attrition = mode === 'attrition'

  const [phase, setPhase]     = useState('idle')    // idle | rolling | resolved
  const [diceA, setDiceA]     = useState(1)
  const [diceB, setDiceB]     = useState(1)
  const [highlight, setHighlight] = useState(null)
  const [log, setLog]         = useState([])
  const [outcome, setOutcome] = useState(null)      // win | lose | wornout | draw
  const [cardView, setCardView] = useState(null)    // { character, skillLoadout } — tapped portrait
  const tickRef = useRef(null)
  const logSeqRef = useRef(0)                        // stable per-line ids (newest log on top)

  const oppLoadout = useMemo(() => opponentSkillLoadout(opponent), [opponent])
  const oppLearned = useMemo(() => {
    const m = {}; Object.values(oppLoadout).forEach(({ skillId, level }) => { m[skillId] = { level } }); return m
  }, [oppLoadout])
  const oppEquippedMap = useMemo(() => {
    const m = {}; Object.entries(oppLoadout).forEach(([slot, { skillId }]) => { m[slot] = skillId }); return m
  }, [oppLoadout])

  // Player's equipped skill cards (from the Skills loadout), resolved to their
  // per-fire bonus. Read once when the fight opens. Same shape as oppLoadout:
  // { [slot]: { skillId, level, bonus } } + derived equipped/learned maps for
  // the slot grid display.
  const playerLoadout = useMemo(() => getBattleSkillLoadout(), [])
  const playerLearned = useMemo(() => {
    const m = {}; Object.values(playerLoadout).forEach(({ skillId, level }) => { m[skillId] = { level } }); return m
  }, [playerLoadout])
  const playerEquippedMap = useMemo(() => {
    const m = {}; Object.entries(playerLoadout).forEach(([slot, { skillId }]) => { m[slot] = skillId }); return m
  }, [playerLoadout])

  // Per-fight base stats. Player atk/def come from the progression curve;
  // opponent uses explicit atk/def when provided (bosses), else power-derived.
  const stats = useMemo(() => ({
    playerBaseAttack:  combat.atk,
    playerBaseDefense: combat.def,
    oppBaseAttack:  opponent.atk != null ? opponent.atk : Math.floor(opponent.power * 0.55) + 10,
    oppBaseDefense: opponent.def != null ? opponent.def : Math.floor(opponent.power * 0.45) + 15,
  }), [combat.atk, combat.def, opponent])

  // Attrition (bosses): the player fights on their big, regenerating vitals
  // health so a boss is ground down across sessions. Duel (PvP): use the level
  // curve HP so a fight is a quick, fair ~15-round bout — not a 170-round slog
  // against the full vitals pool.
  // Both modes now fight on the player's REAL health pool — the fight bar IS the
  // card's Health, one source of truth. A duel used to use a separate small
  // combat-HP scale (200 at Lv1), which neither matched the card nor reflected
  // the real health it quietly drained. To keep a duel a snappy ~15-round bout
  // against a fair opponent, scale the opponent's HP and all damage by the same
  // factor the real pool is bigger than the level-curve combat HP the matchup
  // was tuned on — the ratio (and round count) is preserved; only the numbers,
  // and the real health spent, move onto the true scale. Attrition (bosses)
  // already fights on real health, so its scale stays 1×.
  const duelScale   = attrition ? 1 : (combat.hp > 0 ? healthMax / combat.hp : 1)
  const maxPlayerHp = healthMax
  const maxOppHp    = Math.round((opponent.hp != null ? opponent.hp : Math.floor(opponent.power * 6 + 800)) * duelScale)
  // Seed: the player always starts at their real, current health (carry wounds
  // in, spend them for real); the duel opponent starts full, a boss persists.
  const [playerHp, setPlayerHp] = useState(vitals.health)
  const [oppHp, setOppHp]       = useState(attrition ? (oppStartHp ?? maxOppHp) : maxOppHp)
  const [playerHit, setPlayerHit] = useState({ amount: 0, key: 0 })
  const [oppHit,    setOppHit]    = useState({ amount: 0, key: 0 })
  const [landedSlot, setLandedSlot] = useState(null)
  const [sessionXp, setSessionXp] = useState(0)   // running net XP this PvP fight
  const fxRef = useRef([])                         // active skill effects (source of truth, mutated in resolve)
  const [fxView, setFxView] = useState([])         // mirror of fxRef for status readouts
  const equippedSlots = useMemo(() => ({
    player: new Set(Object.keys(playerEquippedMap).map(Number)),
    opp:    new Set(Object.keys(oppEquippedMap).map(Number)),
  }), [playerEquippedMap, oppEquippedMap])

  // Worn out in either mode now: the player fights on real health, so hitting 0
  // means back off and heal (a duel loss is the same "out of health" state).
  const wornOut  = playerHp <= 0
  const canRoll  = stamina >= cost && !wornOut

  const roll = () => {
    if (phase === 'rolling') return
    if (!canRoll) { sfx.deny?.(); return }
    // No post-fight reset: a duel now runs on the player's real, continuous
    // health (like attrition). Once someone's down the fight is over — you don't
    // get a free fresh HP bar by rolling again.
    setPhase('rolling')
    setLandedSlot(null)
    if (onRoll) onRoll()
    sfx.tick()

    const start = Date.now()
    const duration = 1400
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - start
      setDiceA(1 + Math.floor(Math.random() * 6))
      setDiceB(1 + Math.floor(Math.random() * 6))
      setHighlight(2 + Math.floor(Math.random() * 11))
      if (elapsed > 0 && elapsed % 240 < 100) sfx.tick()
      if (elapsed >= duration) {
        clearInterval(tickRef.current)
        const finalA = 1 + Math.floor(Math.random() * 6)
        const finalB = 1 + Math.floor(Math.random() * 6)
        setDiceA(finalA); setDiceB(finalB)
        const rawSlot = finalA + finalB
        const slot = applyDiceNudge(fxRef.current, rawSlot, equippedSlots)   // Loaded Dice steers the roll
        setHighlight(slot); setLandedSlot(slot)
        resolve(slot, rawSlot)
      }
    }, 80)
  }

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current) }, [])

  const resolve = (slot, rawSlot = slot) => {
    const base = {
      player: { atk: stats.playerBaseAttack, def: stats.playerBaseDefense },
      opp:    { atk: stats.oppBaseAttack,    def: stats.oppBaseDefense },
    }
    const maxHp = { player: maxPlayerHp, opp: maxOppHp }
    const preFx = fxRef.current

    // Tick standing effects (DOT damage, durations, refunds) BEFORE this roll's
    // skills resolve — a freshly-cast effect first ticks next roll.
    const ticked = tickEffects(preFx, maxHp)

    // Skill firing — honor lockdown (disable) and fizzle (prison-gear misfire).
    const pSlot       = playerLoadout[slot]
    const pSkillDef   = pSlot ? SKILLS.find(s => s.id === pSlot.skillId) : null
    const pMuted      = pSkillDef ? slotMutedFor(preFx, 'player', slot) : false
    const pFizzle     = pSkillDef ? rollFizzle(pSkillDef) : false
    const pSkillFires = !!(pSkillDef && pSlot.bonus > 0 && !pMuted)
    const pSkillBonus = pSkillFires ? pSlot.bonus : 0

    const oSlot       = oppLoadout[slot]
    const oSkillDef   = oSlot ? SKILLS.find(s => s.id === oSlot.skillId) : null
    const oMuted      = oSkillDef ? slotMutedFor(preFx, 'opp', slot) : false
    const oFizzle     = oSkillDef ? rollFizzle(oSkillDef) : false
    const oSkillFires = !!(oSkillDef && !oMuted)
    // Include any authored DMG upgrades so a boss's "+N DMG" actually counts.
    const oSkillBonus = oSkillFires
      ? oSlot.level * (oSkillDef.perLevelAttack + (oSlot.dmgUpgrade || 0) * SKILL_DMG_PER_LEVEL)
      : 0

    // Effects cast by skills that fired (fizzle gates the effect, not the swing).
    // A player skill fires its SIGNATURE plus any rolled BONUS affixes (Phase 3);
    // bonus affixes don't fizzle (only the prison-gear signature can misfire).
    let newFx = []
    if (pSkillFires) {
      const lvl = pSlot.level || 1, pot = pSlot.potency || 0
      if (pSkillDef.effect) newFx = newFx.concat(effectInstancesFor(pSkillDef, lvl, 'player', base, pFizzle, pot))
      for (const af of (pSlot.affixes || [])) {
        newFx = newFx.concat(effectInstancesFor({ id: af.id, shortName: af.name, effect: af.effect }, lvl, 'player', base, false, pot))
      }
    }
    if (oSkillFires && oSkillDef.effect) newFx = newFx.concat(effectInstancesFor(oSkillDef, oSlot.level || 1, 'opp', base, oFizzle, oSlot.dmgUpgrade || 0))

    // Standing modifiers shift atk/def this roll (fight buffs cast now take hold
    // next roll — they're committed below).
    const pMod = statDeltas(preFx, 'player')
    const oMod = statDeltas(preFx, 'opp')
    const playerAttack  = Math.max(1, stats.playerBaseAttack  + pSkillBonus + pMod.atkDelta)
    const playerDefense = Math.max(1, stats.playerBaseDefense + pMod.defDelta)
    const oppAttack     = Math.max(1, stats.oppBaseAttack     + oSkillBonus + oMod.atkDelta)
    const oppDefense    = Math.max(1, stats.oppBaseDefense    + oMod.defDelta)

    // Scale damage onto the real-health pool (see duelScale). Uniform on both
    // sides, so the per-turn win/lose comparison and round count are unchanged.
    const youDealt = Math.max(1, Math.round(dmg(playerAttack, oppDefense) * duelScale))
    const oppDealt = Math.max(1, Math.round(dmg(oppAttack, playerDefense) * duelScale))

    // Net HP change = combat hit + this roll's DOT − any refund (The Hole).
    const oppLoss    = youDealt + ticked.dmg.opp    - ticked.heal.opp
    const playerLoss = oppDealt + ticked.dmg.player - ticked.heal.player
    const newOppHp    = Math.max(0, oppHp - oppLoss)
    const newPlayerHp = Math.max(0, playerHp - playerLoss)
    setOppHp(newOppHp); setPlayerHp(newPlayerHp)
    if (youDealt > 0) setOppHit(h    => ({ amount: youDealt, key: h.key + 1 }))
    if (oppDealt > 0) setPlayerHit(h => ({ amount: oppDealt, key: h.key + 1 }))

    // Persist this hit immediately, both modes: attrition drops boss HP for good;
    // a duel spends real health. DOT counts as dealt; refunds reduce the spend.
    if (onHit) onHit({ dealtToOpp: Math.max(0, oppLoss), dealtToPlayer: Math.max(0, playerLoss) })

    // Commit the effect runtime: ticked survivors + newly cast.
    const nextFx = addEffects(ticked.effects, newFx)
    fxRef.current = nextFx
    setFxView(nextFx)

    // Contraband: 2× payout when THIS slot lands the KO. (Actual reward doubling
    // is caller-side — Phase 2b; surfaced in the log for now.)
    const payoutHit = pSkillFires && !pFizzle && pSkillDef.effect &&
      pSkillDef.effect.kind === 'modifier' && pSkillDef.effect.stat === 'payout' && newOppHp <= 0

    // PvP (duel) per-turn XP: whoever deals more damage WINS the turn. Win = +xp,
    // lose = −xp, even = nothing. Applied live so picking a bad matchup bleeds XP.
    let attackLine = null
    if (!attrition && attackXp) {
      if (youDealt > oppDealt) {
        setSessionXp(x => x + attackXp.win)
        if (onAttack) onAttack({ won: true, tie: false })
        attackLine = { side: 'result', text: `You win the turn! +${attackXp.win} XP`, color: GREEN }
      } else if (youDealt < oppDealt) {
        setSessionXp(x => x - attackXp.lose)
        if (onAttack) onAttack({ won: false, tie: false })
        attackLine = { side: 'result', text: `${opponent.name} wins the turn. −${attackXp.lose} XP → ${opponent.name}`, color: RED }
      } else {
        if (onAttack) onAttack({ won: false, tie: true })
        attackLine = { side: 'result', text: `Even exchange — no XP`, color: '#888' }
      }
    }

    const roundLog = []
    roundLog.push({ side: 'round', text: `— Round (slot ${slot}) —`, color: '#666' })
    if (rawSlot !== slot) roundLog.push({ side: 'you', text: `🎲 Loaded Dice nudged the roll ${rawSlot} → ${slot}`, color: GOLD })
    for (const l of ticked.logs) roundLog.push({ side: l.side, text: l.text, color: l.kind === 'refund' ? GREEN : l.kind === 'expire' ? '#888' : RED })
    roundLog.push(
      pMuted ? { side: 'you', text: `Your slot-${slot} skill is LOCKED DOWN`, color: '#888' }
      : pSkillFires ? { side: 'you', text: `You use ${pSkillDef.shortName}!${pFizzle ? ' …but it misfired' : ''} +${pSkillBonus} atk`, color: pFizzle ? '#888' : GOLD }
      : { side: 'you', text: `You don't use a skill (slot ${slot} empty)`, color: '#888' })
    roundLog.push(
      oMuted ? { side: 'opp', text: `${opponent.name}'s slot-${slot} skill is LOCKED DOWN`, color: '#888' }
      : oSkillFires ? { side: 'opp', text: `${opponent.name} uses ${oSkillDef.shortName}!${oFizzle ? ' …but it misfired' : ''} +${oSkillBonus} atk`, color: oFizzle ? '#888' : ORANGE }
      : { side: 'opp', text: `${opponent.name} doesn't use a skill`, color: '#888' })
    roundLog.push({ side: 'you', text: `You hit ${opponent.name} for ${youDealt} (HP ${newOppHp.toLocaleString()})`, color: BLUE })
    roundLog.push({ side: 'opp', text: `${opponent.name} hits you for ${oppDealt} (HP ${newPlayerHp.toLocaleString()})`, color: RED })
    if (attackLine) roundLog.push(attackLine)
    if (payoutHit) roundLog.push({ side: 'result', text: `📦 CONTRABAND — knockout payday! (2× reward)`, color: GOLD })

    let result = null
    if (newOppHp <= 0 && newPlayerHp <= 0) result = attrition ? 'win' : 'draw'  // attrition: boss down = you win
    else if (newOppHp <= 0)                result = 'win'
    else if (newPlayerHp <= 0)             result = attrition ? 'wornout' : 'lose'

    if (result === 'win') {
      const parts = []
      if (rewards?.xp)         parts.push(`+${rewards.xp.toLocaleString()} XP`)
      if (rewards?.hustle)     parts.push(`+${rewards.hustle.toLocaleString()} Hustle`)
      if (rewards?.skillTokens)parts.push(`+${rewards.skillTokens} skill token${rewards.skillTokens === 1 ? '' : 's'}`)
      if (rewards?.revenge)    parts.push(`+${rewards.revenge} REVENGE XP`)
      if (rewards?.bountyText) parts.push(`+${rewards.bountyText} Hustle BOUNTY`)
      if (rewards?.reclaim)    parts.push(`reclaimed ${rewards.reclaim} XP`)
      if (rewards?.cardDrop)   parts.push(`+1 card drop`)
      roundLog.push({ side: 'result', text: `★ ${opponent.name} is DOWN! ${parts.join(' · ') || 'Victory!'}`, color: GREEN })
      sfx.win()
      if (onWin) onWin(opponent)
    } else if (result === 'wornout') {
      roundLog.push({ side: 'result', text: `You're knocked out — see the nurse. ${opponent.name}'s wounds stay.`, color: ORANGE })
      sfx.lose()
    } else if (result === 'lose') {
      roundLog.push({ side: 'result', text: `${opponent.name} defeats you.`, color: RED })
      sfx.lose()
    } else if (result === 'draw') {
      roundLog.push({ side: 'result', text: `Mutual KO — both fighters down.`, color: '#888' })
      sfx.clash()
    } else {
      sfx.clash()
    }

    // Out of health in any fight = knocked out → the 24h recovery clock starts
    // and the player must see the nurse. Covers PvP loss/mutual-KO and the boss
    // "worn out" state alike. Idempotent (no-op if already KO'd).
    if (result === 'lose' || result === 'draw' || result === 'wornout') knockOut(opponent.name)

    // Duel reports damage so the caller can spend shared health on resolve.
    if (!attrition && result && onResult) onResult({ result, damageTaken: maxPlayerHp - newPlayerHp, maxHp: maxPlayerHp })

    // Newest round on top. Stamp each line with a stable id (so prepending
    // doesn't re-key/re-animate the older lines below) and an in-round stagger
    // delay (so a round still fades in top-to-bottom in reading order).
    const startId = logSeqRef.current
    const stamped = roundLog.map((line, idx) => ({ ...line, id: startId + idx, delay: idx * 0.12 }))
    logSeqRef.current = startId + roundLog.length
    setLog(prev => [...stamped, ...prev])
    setOutcome(result)
    setPhase(result ? 'resolved' : 'idle')
  }

  // Terminal states: someone's down (win/lose/draw) or the player is worn out in
  // a boss fight (now a KO → see the nurse, no longer a free retreat-and-heal).
  const fightOver = phase === 'resolved' && (outcome === 'win' || outcome === 'lose' || outcome === 'draw' || outcome === 'wornout')

  return (
    <div className="app-overlay" style={{ position: 'fixed', inset: 0, background: '#13131f', display: 'flex', alignItems: 'stretch', justifyContent: 'center', zIndex: 220 }}>
      <div style={{ padding: '20px 16px 100px', width: '100%', maxWidth: 390, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 16px' }} />

        {(rewards?.multText || opponent.boss) && (
          <div style={{ textAlign: 'center', marginBottom: 8, color: opponent.boss ? GOLD : ORANGE, fontSize: 10, fontWeight: 700, letterSpacing: 1.5 }}>
            {opponent.boss ? '★ BOSS ENCOUNTER ★' : rewards.multText}
          </div>
        )}
        {attackXp && (
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{ color: '#888', fontSize: 9, letterSpacing: 1, fontWeight: 700 }}>
              WIN THE TURN <span style={{ color: GREEN }}>+{attackXp.win} XP</span> · LOSE IT <span style={{ color: RED }}>−{attackXp.lose} XP</span>
            </div>
            <div style={{ color: sessionXp >= 0 ? GREEN : RED, fontSize: 15, fontWeight: 800, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
              {sessionXp >= 0 ? '+' : ''}{sessionXp} XP this fight
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <FighterBlock name={me.name} emoji={me.emoji} avatar={me.avatar} level={combat.level}
            attack={stats.playerBaseAttack} defense={stats.playerBaseDefense}
            hp={playerHp} maxHp={maxPlayerHp} color={BLUE} hit={playerHit}
            onClick={() => setCardView({ character: { ...me, isYou: true }, skillLoadout: playerLoadout })}
            outcome={outcome === 'win' ? 'winner' : (outcome === 'lose' || outcome === 'wornout') ? 'loser' : null} />

          <div style={{ background: '#0d0d15', border: `1.5px solid ${phase === 'rolling' ? GOLD : '#2a2a3a'}`, borderRadius: 14, padding: 10, flexShrink: 0, transition: 'border-color 0.2s' }}>
            <div style={{ color: '#888', fontSize: 9, letterSpacing: 1.5, textAlign: 'center', marginBottom: 6, fontWeight: 700 }}>BATTLE DICE</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              <Die value={diceA} color={BLUE} rolling={phase === 'rolling'} />
              <Die value={diceB} color={ORANGE} rolling={phase === 'rolling'} />
            </div>
            {highlight != null && (
              <div style={{ textAlign: 'center', marginTop: 6, color: phase === 'rolling' ? GOLD : '#fff', fontSize: 12, fontWeight: 700 }}>Slot {highlight}</div>
            )}
          </div>

          <FighterBlock name={opponent.name} emoji={opponent.emoji} avatar={opponent.avatar} level={opponent.level}
            attack={stats.oppBaseAttack} defense={stats.oppBaseDefense}
            hp={oppHp} maxHp={maxOppHp} color={RED} hit={oppHit}
            onClick={() => setCardView({ character: opponent, skillLoadout: oppLoadout })}
            outcome={outcome === 'win' ? 'loser' : (outcome === 'lose' || outcome === 'wornout') ? 'winner' : null} />
        </div>

        <EffectBar effects={fxView} oppName={opponent.name} />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          <SlotGrid side="you" equipped={playerEquippedMap} learned={playerLearned} loadout={playerLoadout} highlight={highlight} landed={landedSlot} color={BLUE} />
          <SlotGrid side="opp" equipped={oppEquippedMap} learned={oppLearned} loadout={oppLoadout} highlight={highlight} landed={landedSlot} color={ORANGE} />
        </div>

        {/* Duel (PvP) result button — sits directly under SKILLS and above the
            fight log so the outcome reads with the board: win = green VICTORY,
            player KO = red DEFEATED, mutual KO = DRAW. Tapping it banks and closes.
            Bosses (attrition) keep their bottom-of-modal RETREAT/DONE layout. */}
        {!attrition && fightOver && (
          <button
            onClick={outcome === 'win' ? onClose : () => { onClose(); openNurse() }}
            style={{
              marginTop: 14, width: '100%',
              background: outcome === 'win' ? GREEN : outcome === 'lose' ? RED : '#2a2a3a',
              color: outcome === 'win' ? '#0a0a0f' : '#fff',
              border: 'none', borderRadius: 10, padding: 14,
              fontSize: 14, fontWeight: 800, letterSpacing: 1.5, cursor: 'pointer',
              boxShadow: outcome === 'win' ? `0 0 20px ${GREEN}55` : outcome === 'lose' ? `0 0 20px ${RED}55` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <i className={`ti ${outcome === 'win' ? 'ti-trophy' : outcome === 'lose' ? 'ti-skull' : 'ti-minus'}`} style={{ fontSize: 15 }} />
            {outcome === 'win' ? 'VICTORY' : outcome === 'lose' ? 'DEFEATED — SEE NURSE' : 'DRAW — SEE NURSE'}
          </button>
        )}

        {!fightOver && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888', fontSize: 11 }}>
                <i className="ti ti-bolt" style={{ color: canRoll ? GOLD : RED, fontSize: 12, marginRight: 4 }} />Stamina
              </span>
              <span style={{ color: canRoll ? GOLD : RED, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {stamina} / {STAMINA_MAX} · {cost} per roll
              </span>
            </div>
            <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(stamina / STAMINA_MAX * 100)}%`, background: canRoll ? `linear-gradient(90deg, ${GOLD}, #f0d080)` : RED, borderRadius: 2, transition: 'width 0.4s' }} />
            </div>
          </div>
        )}

        {!fightOver && (
          <button onClick={roll} disabled={phase === 'rolling' || !canRoll}
            style={{
              marginTop: 10, width: '100%',
              background: (phase === 'rolling' || !canRoll) ? '#1e1e2a' : GOLD,
              color: (phase === 'rolling' || !canRoll) ? '#555' : '#0a0a0f',
              border: 'none', borderRadius: 12, padding: '16px 12px',
              fontSize: 16, fontWeight: 800, letterSpacing: 1.5,
              cursor: phase === 'rolling' ? 'wait' : !canRoll ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: (phase === 'rolling' || !canRoll) ? 'none' : `0 0 20px ${GOLD}44`,
              animation: (phase === 'idle' && canRoll) ? 'pulse 2s ease-in-out infinite' : 'none',
            }}>
            <i className={`ti ${canRoll ? 'ti-dice' : wornOut ? 'ti-heart-broken' : 'ti-bolt-off'}`} style={{ fontSize: 18 }} />
            {phase === 'rolling' ? 'ROLLING…' : wornOut ? 'WORN OUT — HEAL UP' : !canRoll ? 'NOT ENOUGH STAMINA' : `ROLL THE DICE  ·  ${cost} STAMINA`}
          </button>
        )}

        {(log.length > 0 || phase !== 'idle') && (
          <div style={{ background: '#0d0d15', borderRadius: 12, padding: 12, minHeight: log.length > 0 ? 90 : 0, marginTop: 14 }}>
            {log.length === 0 && phase === 'rolling' && (
              <div style={{ color: '#888', fontSize: 12, textAlign: 'center', paddingTop: 18, animation: 'pulse 0.8s infinite' }}>Rolling…</div>
            )}
            {log.map((line) => (
              <div key={line.id} style={{ color: line.color, fontSize: 12, marginBottom: 4, opacity: 0, animation: `logLineIn 0.3s ease ${line.delay}s forwards`, fontWeight: line.side === 'result' ? 700 : 400 }}>{line.text}</div>
            ))}
          </div>
        )}

        {/* Boss (attrition) win — a single green VICTORY button. No "roll again"
            after a win: the boss is down, so the only move is to bank it and head
            back. Duel wins are shown by the result button under SKILLS above. */}
        {attrition && fightOver && outcome === 'win' && (
          <button onClick={onClose} style={{ marginTop: 14, width: '100%', background: GREEN, color: '#0a0a0f', border: 'none', borderRadius: 10, padding: 14, fontSize: 14, fontWeight: 800, letterSpacing: 1.5, cursor: 'pointer', boxShadow: `0 0 20px ${GREEN}55` }}>
            <i className="ti ti-trophy" style={{ fontSize: 15, marginRight: 6 }} />VICTORY
          </button>
        )}
        {/* Boss worn out = a KO now: health bottomed out → 24h recovery, see the
            nurse. (Boss not-yet-down, with health to spare, still shows RETREAT
            below.) Duel outcomes are handled by the result button above. */}
        {attrition && fightOver && outcome === 'wornout' && (
          <button onClick={() => { onClose(); openNurse() }}
            style={{ marginTop: 14, width: '100%', background: RED, color: '#fff', border: 'none', borderRadius: 10, padding: 14, fontSize: 14, fontWeight: 800, letterSpacing: 1.5, cursor: 'pointer', boxShadow: `0 0 20px ${RED}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <i className="ti ti-skull" style={{ fontSize: 15 }} />DEFEATED — SEE NURSE
          </button>
        )}
        {/* Bail out between rolls. Attrition keeps the boss's wounds (progress
            saved); a duel just leaves — either way the player's real health that
            was already spent stays spent. */}
        {!fightOver && phase !== 'rolling' && (
          <button onClick={onClose} style={{ marginTop: 8, width: '100%', background: '#1e1e2a', color: '#888', border: '0.5px solid #2a2a3a', borderRadius: 10, padding: 12, fontSize: 12, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>
            {attrition ? 'RETREAT (progress saved)' : 'LEAVE FIGHT'}
          </button>
        )}

      </div>

      {/* Tapping a fighter's portrait opens its full card (boss shows its skill
          board). Renders above the dice modal (same z, later in the tree). */}
      {cardView && (
        <CharacterDetailModal
          character={cardView.character}
          skillLoadout={cardView.skillLoadout}
          onClose={() => setCardView(null)}
        />
      )}
    </div>
  )
}

function FighterBlock({ name, emoji, avatar, level, attack, defense, hp, maxHp, color, hit, outcome, onClick }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0
  const hpColor = pct > 60 ? GREEN : pct > 25 ? ORANGE : RED
  const dead = hp <= 0   // out of HP → show the KO stamp, even in a mutual KO
  const outerAnim = outcome === 'winner' ? 'winnerGlow 1.8s ease-in-out infinite' : outcome === 'loser' ? 'loserDim 0.7s ease forwards' : 'none'
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center', opacity: dead ? 0.45 : 1, transition: 'opacity 0.4s', animation: outerAnim, borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
        <div key={hit ? hit.key : 'avatar'} onClick={onClick}
          style={{ animation: hit && hit.key > 0 ? 'hitShake 0.32s ease' : 'none', cursor: onClick ? 'pointer' : 'default' }}>
          <Avatar src={avatar} emoji={emoji} size={84} radius={12} ko={dead} />
        </div>
        {hit && hit.key > 0 && (
          <span key={`dmg-${hit.key}`} style={{ position: 'absolute', top: -2, left: '50%', color, fontSize: 16, fontWeight: 800, textShadow: '0 0 6px #0a0a0f, 0 1px 2px #0a0a0f', pointerEvents: 'none', animation: 'damageFloat 0.9s ease-out forwards' }}>-{hit.amount}</span>
        )}
      </div>
      <div style={{ color, fontSize: 11, fontWeight: 600, marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name}</div>
      {level != null && <div style={{ color: '#888', fontSize: 9, marginTop: 1 }}>Lv {level}</div>}
      <div style={{ color: '#666', fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>ATK {attack} · DEF {defense}</div>
      <div style={{ marginTop: 5 }}>
        <div style={{ color: hpColor, fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginBottom: 2 }}>
          {dead ? 'KO' : `${hp.toLocaleString()} / ${maxHp.toLocaleString()}`}
        </div>
        <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: hpColor, borderRadius: 2, transition: 'width 0.5s ease, background 0.3s' }} />
        </div>
      </div>
    </div>
  )
}

function SlotGrid({ side, equipped, learned, loadout = {}, highlight, landed, color }) {
  const slots = Array.from({ length: 11 }, (_, i) => i + 2)
  const [popup, setPopup] = useState(null)   // { skill, level, dmg } when a skull is tapped

  // Effective per-fire DMG for a slot's skill, reflecting the equipped card's
  // level + upgrades: player entries carry `bonus` (= level × perHit), boss
  // entries carry `dmgUpgrade`. Falls back to the skill's base per-level DMG.
  const perHitDmg = (slot, skill) => {
    const e = loadout[slot]
    if (e && e.bonus != null && e.level) return Math.round(e.bonus / e.level)
    if (e) return skill.perLevelAttack + (e.dmgUpgrade || 0) * SKILL_DMG_PER_LEVEL
    return skill.perLevelAttack
  }
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textAlign: side === 'you' ? 'left' : 'right', marginBottom: 4 }}>SKILLS</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {slots.map(slot => {
          const isHl     = highlight === slot
          const isLanded = landed === slot
          const skillId = equipped[slot]
          const learnedSkill = skillId ? learned[skillId] : null
          const skill = skillId ? SKILLS.find(s => s.id === skillId) : null
          return (
            <div key={isLanded ? `landed-${landed}` : slot}
              onClick={skill ? () => setPopup({ skill, level: learnedSkill?.level, dmg: perHitDmg(slot, skill) }) : undefined}
              style={{
                aspectRatio: '1', background: isHl ? `${color}33` : '#0d0d15',
                border: `${isHl ? 2 : 0.5}px solid ${isHl ? color : '#2a2a3a'}`, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                transition: 'border-color 0.12s, background 0.12s', boxShadow: isHl ? `0 0 8px ${color}66` : 'none',
                animation: isLanded ? 'slotActivate 0.5s ease' : 'none', '--flash-color': color,
                cursor: skill ? 'pointer' : 'default',
              }}>
              {/* Dice view keeps the emoji (the "skull"); tap it to pop the card. */}
              {skill && <span style={{ fontSize: 14, filter: learnedSkill ? 'none' : 'grayscale(1) brightness(0.5)' }}>{skill.emoji}</span>}
              <span style={{ position: 'absolute', bottom: 1, right: 2, color: isHl ? color : '#444', fontSize: 7, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{slot}</span>
            </div>
          )
        })}
      </div>
      {popup && (
        <SkillCardPopup skill={popup.skill} level={popup.level} dmgPerLevel={popup.dmg} onClose={() => setPopup(null)} />
      )}
    </div>
  )
}

// Active-effect readout: one chip per live effect, tinted by who cast it (your
// skills BLUE, opponent's ORANGE) with an icon, who it hits, and rolls left.
function EffectBar({ effects, oppName }) {
  if (!effects || effects.length === 0) return null
  const icon = (e) =>
    e.kind === 'dot' ? '🩸'
    : e.kind === 'disable' ? '🔒'
    : e.kind === 'dice' ? '🎲'
    : ((e.atkDelta || 0) + (e.defDelta || 0) >= 0 ? '🛡️' : '🔻')   // modifier: net buff vs debuff
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10, justifyContent: 'center' }}>
      {effects.map((e, i) => {
        const mine = e.owner === 'player'
        const col  = mine ? BLUE : ORANGE
        const tgt  = e.appliesTo === 'player' ? 'you' : 'opp'
        const dur  = e.rollsLeft === Infinity ? '∞' : e.rollsLeft
        return (
          <span key={i} style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#0d0d15', border: `0.5px solid ${col}66`, color: col, whiteSpace: 'nowrap' }}>
            {icon(e)} {e.label} →{tgt} ·{dur}
          </span>
        )
      })}
    </div>
  )
}

function Die({ value, color, rolling }) {
  const layouts = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
  const active = new Set(layouts[value] || [])
  return (
    <div style={{ width: 52, height: 52, borderRadius: 10, background: '#0a0a0f', border: `1.5px solid ${color}`, padding: 6, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', boxShadow: rolling ? `0 0 8px ${color}66` : 'none', transition: 'box-shadow 0.15s' }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: active.has(i) ? color : 'transparent', placeSelf: 'center' }} />
      ))}
    </div>
  )
}
