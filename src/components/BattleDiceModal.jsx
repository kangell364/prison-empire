import React, { useState, useEffect, useMemo, useRef } from 'react'
import { PLAYER, SKILLS } from '../data/gameData'
import { sfx } from '../sounds'
import { Avatar } from './Avatar'
import { usePlayerCard } from '../state/profileStore'
import { useVitals, STAMINA_MAX, HEALTH_MAX } from '../state/vitalsStore'
import { usePlayerCombat } from '../state/progressionStore'

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
function opponentSkillLoadout(opp) {
  if (!opp) return {}
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
  const combat = usePlayerCombat()          // live player atk/def/level from progression
  const healthMax = HEALTH_MAX
  const attrition = mode === 'attrition'

  const [phase, setPhase]     = useState('idle')    // idle | rolling | resolved
  const [diceA, setDiceA]     = useState(1)
  const [diceB, setDiceB]     = useState(1)
  const [highlight, setHighlight] = useState(null)
  const [log, setLog]         = useState([])
  const [outcome, setOutcome] = useState(null)      // win | lose | wornout | draw
  const tickRef = useRef(null)

  const oppLoadout = useMemo(() => opponentSkillLoadout(opponent), [opponent])
  const oppLearned = useMemo(() => {
    const m = {}; Object.values(oppLoadout).forEach(({ skillId, level }) => { m[skillId] = { level } }); return m
  }, [oppLoadout])
  const oppEquippedMap = useMemo(() => {
    const m = {}; Object.entries(oppLoadout).forEach(([slot, { skillId }]) => { m[slot] = skillId }); return m
  }, [oppLoadout])

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
  const maxPlayerHp = attrition ? healthMax : combat.hp
  const maxOppHp    = opponent.hp != null ? opponent.hp : Math.floor(opponent.power * 6 + 800)
  // Seed: attrition keeps real, persistent HP; duel starts both full.
  const [playerHp, setPlayerHp] = useState(attrition ? vitals.health : maxPlayerHp)
  const [oppHp, setOppHp]       = useState(attrition ? (oppStartHp ?? maxOppHp) : maxOppHp)
  const [playerHit, setPlayerHit] = useState({ amount: 0, key: 0 })
  const [oppHit,    setOppHit]    = useState({ amount: 0, key: 0 })
  const [landedSlot, setLandedSlot] = useState(null)
  const [sessionXp, setSessionXp] = useState(0)   // running net XP this PvP fight

  const wornOut  = attrition && playerHp <= 0
  const canRoll  = stamina >= cost && !wornOut

  const roll = () => {
    if (phase === 'rolling') return
    if (!canRoll) { sfx.deny?.(); return }
    // Duel resets for a fresh bout after a resolved fight. Attrition never resets.
    if (phase === 'resolved' && !attrition) {
      setPlayerHp(maxPlayerHp); setOppHp(maxOppHp); setLog([]); setOutcome(null); setSessionXp(0)
    }
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
        const slot = finalA + finalB
        setHighlight(slot); setLandedSlot(slot)
        resolve(slot)
      }
    }, 80)
  }

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current) }, [])

  const resolve = (slot) => {
    const pEquippedId = PLAYER.equippedSkills[slot]
    const pSkillDef   = pEquippedId ? SKILLS.find(s => s.id === pEquippedId) : null
    const pLearned    = pSkillDef ? PLAYER.learnedSkills[pSkillDef.id] : null
    const pSkillFires = !!(pSkillDef && pLearned && pLearned.level > 0)
    const pSkillBonus = pSkillFires ? pLearned.level * pSkillDef.perLevelAttack : 0

    const oSlot      = oppLoadout[slot]
    const oSkillDef  = oSlot ? SKILLS.find(s => s.id === oSlot.skillId) : null
    const oSkillFires = !!oSkillDef
    const oSkillBonus = oSkillFires ? oSlot.level * oSkillDef.perLevelAttack : 0

    const playerAttack  = stats.playerBaseAttack + pSkillBonus
    const oppAttack     = stats.oppBaseAttack + oSkillBonus
    const youDealt = dmg(playerAttack, stats.oppBaseDefense)
    const oppDealt = dmg(oppAttack, stats.playerBaseDefense)

    const newOppHp    = Math.max(0, oppHp - youDealt)
    const newPlayerHp = Math.max(0, playerHp - oppDealt)
    setOppHp(newOppHp); setPlayerHp(newPlayerHp)
    if (youDealt > 0) setOppHit(h    => ({ amount: youDealt, key: h.key + 1 }))
    if (oppDealt > 0) setPlayerHit(h => ({ amount: oppDealt, key: h.key + 1 }))

    // Attrition: persist this hit immediately (boss HP down for good + real health spent).
    if (attrition && onHit) onHit({ dealtToOpp: youDealt, dealtToPlayer: oppDealt })

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
    roundLog.push(pSkillFires
      ? { side: 'you', text: `You use ${pSkillDef.shortName}! +${pSkillBonus} attack`, color: GOLD }
      : { side: 'you', text: `You don't use a skill (slot ${slot} empty)`, color: '#888' })
    roundLog.push(oSkillFires
      ? { side: 'opp', text: `${opponent.name} uses ${oSkillDef.shortName}! +${oSkillBonus} attack`, color: ORANGE }
      : { side: 'opp', text: `${opponent.name} doesn't use a skill`, color: '#888' })
    roundLog.push({ side: 'you', text: `You hit ${opponent.name} for ${youDealt} (HP ${newOppHp.toLocaleString()})`, color: BLUE })
    roundLog.push({ side: 'opp', text: `${opponent.name} hits you for ${oppDealt} (HP ${newPlayerHp.toLocaleString()})`, color: RED })
    if (attackLine) roundLog.push(attackLine)

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
      roundLog.push({ side: 'result', text: `You're worn out — back off and heal. ${opponent.name}'s wounds stay.`, color: ORANGE })
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

    // Duel reports damage so the caller can spend shared health on resolve.
    if (!attrition && result && onResult) onResult({ result, damageTaken: maxPlayerHp - newPlayerHp, maxHp: maxPlayerHp })

    setLog(prev => [...prev, ...roundLog])
    setOutcome(result)
    setPhase(result ? 'resolved' : 'idle')
  }

  const fightOver = phase === 'resolved' && (outcome === 'win' || outcome === 'lose' || outcome === 'draw' || (attrition && outcome === 'win'))

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#13131f', display: 'flex', alignItems: 'stretch', justifyContent: 'center', zIndex: 220 }}>
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
            outcome={outcome === 'win' ? 'loser' : (outcome === 'lose' || outcome === 'wornout') ? 'winner' : null} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          <SlotGrid side="you" equipped={PLAYER.equippedSkills} learned={PLAYER.learnedSkills} highlight={highlight} landed={landedSlot} color={BLUE} />
          <SlotGrid side="opp" equipped={oppEquippedMap} learned={oppLearned} highlight={highlight} landed={landedSlot} color={ORANGE} />
        </div>

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
            {log.map((line, i) => (
              <div key={i} style={{ color: line.color, fontSize: 12, marginBottom: 4, opacity: 0, animation: `logLineIn 0.3s ease ${i * 0.12}s forwards`, fontWeight: line.side === 'result' ? 700 : 400 }}>{line.text}</div>
            ))}
          </div>
        )}

        {fightOver && (
          <button onClick={onClose} style={{ marginTop: 14, width: '100%', background: GOLD, color: '#0a0a0f', border: 'none', borderRadius: 10, padding: 14, fontSize: 13, fontWeight: 800, letterSpacing: 1, cursor: 'pointer' }}>
            <i className="ti ti-check" style={{ fontSize: 14, marginRight: 4 }} />DONE
          </button>
        )}
        {/* Attrition: you can bail out any time between rolls — the boss keeps
            its wounds, so progress is never lost. Essential when you run dry on
            stamina mid-grind. */}
        {!fightOver && attrition && phase !== 'rolling' && (
          <button onClick={onClose} style={{ marginTop: 8, width: '100%', background: '#1e1e2a', color: '#888', border: '0.5px solid #2a2a3a', borderRadius: 10, padding: 12, fontSize: 12, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>
            RETREAT (progress saved)
          </button>
        )}
        {/* Duel post-fight: roll again / close */}
        {!attrition && phase === 'resolved' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={roll} disabled={!canRoll}
              style={{ flex: 1, background: canRoll ? GOLD : '#1e1e2a', color: canRoll ? '#0a0a0f' : '#555', border: 'none', borderRadius: 10, padding: 14, fontSize: 12, fontWeight: 800, letterSpacing: 1, cursor: canRoll ? 'pointer' : 'not-allowed' }}>
              <i className={`ti ${canRoll ? 'ti-refresh' : 'ti-bolt-off'}`} style={{ fontSize: 13, marginRight: 4 }} />{canRoll ? 'ROLL AGAIN' : 'NO STAMINA'}
            </button>
            <button onClick={onClose} style={{ flex: 1, background: '#1e1e2a', color: '#888', border: '0.5px solid #2a2a3a', borderRadius: 10, padding: 14, fontSize: 12, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>CLOSE</button>
          </div>
        )}

        {outcome && (
          <div style={{ marginTop: 10, textAlign: 'center', color: outcome === 'win' ? GREEN : outcome === 'wornout' ? ORANGE : outcome === 'lose' ? RED : '#888', fontSize: 12, fontWeight: 700, letterSpacing: 1.5 }}>
            {outcome === 'win' ? '★ VICTORY ★' : outcome === 'wornout' ? 'WORN OUT' : outcome === 'lose' ? 'DEFEATED' : 'DRAW'}
          </div>
        )}
      </div>
    </div>
  )
}

function FighterBlock({ name, emoji, avatar, level, attack, defense, hp, maxHp, color, hit, outcome }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0
  const hpColor = pct > 60 ? GREEN : pct > 25 ? ORANGE : RED
  const dead = hp <= 0
  const outerAnim = outcome === 'winner' ? 'winnerGlow 1.8s ease-in-out infinite' : outcome === 'loser' ? 'loserDim 0.7s ease forwards' : 'none'
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center', opacity: dead ? 0.45 : 1, transition: 'opacity 0.4s', animation: outerAnim, borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
        <div key={hit ? hit.key : 'avatar'} style={{ filter: dead ? 'grayscale(1)' : 'none', animation: hit && hit.key > 0 ? 'hitShake 0.32s ease' : 'none' }}>
          <Avatar src={avatar} emoji={emoji} size={56} radius={10} />
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

function SlotGrid({ side, equipped, learned, highlight, landed, color }) {
  const slots = Array.from({ length: 11 }, (_, i) => i + 2)
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textAlign: side === 'you' ? 'left' : 'right', marginBottom: 4 }}>SKILLS</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {slots.map(slot => {
          const isHl     = highlight === slot
          const isLanded = landed === slot
          const skillId = equipped[slot]
          const learnedSkill = skillId ? learned[skillId] : null
          const emoji = skillId ? (SKILLS.find(s => s.id === skillId)?.emoji || '') : ''
          return (
            <div key={isLanded ? `landed-${landed}` : slot}
              style={{
                aspectRatio: '1', background: isHl ? `${color}33` : '#0d0d15',
                border: `${isHl ? 2 : 0.5}px solid ${isHl ? color : '#2a2a3a'}`, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                transition: 'border-color 0.12s, background 0.12s', boxShadow: isHl ? `0 0 8px ${color}66` : 'none',
                animation: isLanded ? 'slotActivate 0.5s ease' : 'none', '--flash-color': color,
              }}>
              {emoji && <span style={{ fontSize: 14, filter: learnedSkill ? 'none' : 'grayscale(1) brightness(0.5)' }}>{emoji}</span>}
              <span style={{ position: 'absolute', bottom: 1, right: 2, color: isHl ? color : '#444', fontSize: 7, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{slot}</span>
            </div>
          )
        })}
      </div>
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
