import React, { useState, useEffect, useMemo, useRef } from 'react'
import { PLAYER, SKILLS } from '../data/gameData'
import { sfx } from '../sounds'
import { Avatar } from './Avatar'
import { usePlayerCard } from '../state/profileStore'
import { useVitals, STAMINA_MAX } from '../state/vitalsStore'

const GOLD   = '#c9a84c'
const BLUE   = '#4a9eff'
const ORANGE = '#f39c12'
const RED    = '#e74c3c'
const GREEN  = '#2ecc71'

// Deterministic per-opponent skill loadout — same opponent always gets
// the same loadout so fights feel consistent. Procedurally generated
// from opponent.id (or .name) and their power level.
//
// Returns: { [slot 2..12]: { skillId, level } }
function opponentSkillLoadout(opp) {
  if (!opp) return {}
  const seedStr = String(opp.id ?? opp.name ?? 'x')
  let s = 0
  for (let i = 0; i < seedStr.length; i++) s = (s * 31 + seedStr.charCodeAt(i)) >>> 0
  const rng = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  const power     = opp.power || 100
  const numSkills = power >= 300 ? 4 : power >= 150 ? 3 : power >= 60 ? 2 : 1
  const out = {}
  let tries = 0
  while (Object.keys(out).length < numSkills && tries++ < numSkills * 4) {
    const slot = 2 + Math.floor(rng() * 11)
    if (out[slot]) continue
    const skill = SKILLS[Math.floor(rng() * SKILLS.length)]
    out[slot] = {
      skillId: skill.id,
      level: Math.max(1, Math.min(skill.maxLevel || 100, Math.floor(power / 80))),
    }
  }
  return out
}

// Universal Battle Dice modal — works for PvP, Boss, or any opponent.
//
// Props:
//   opponent  — character object with at minimum { name, emoji, power, level }
//               optional: avatar, archetype, facility, etc.
//   cost      — stamina cost per roll (shown on the FIGHT button)
//   rewards   — { xp, hustle, skillTokens, cardDrop?, multText? }
//   onClose   — close the modal
//   onRoll    — fires each time the player clicks ROLL (caller deducts stamina)
//   onWin     — fires when the player KOs the opponent (caller does side-effects
//               like incrementing daily-kill counters, granting card drops, etc.)
//   onResult  — fires once when the fight resolves (win | lose | draw) with
//               { result, damageTaken, maxHp }. damageTaken is on the same scale
//               as global vitals health, so the caller can spendHealth(damageTaken)
//               to make a fight cost real, shared health.
export function BattleDiceModal({ opponent, cost, rewards, onClose, onRoll, onWin, onResult }) {
  const me = usePlayerCard()   // live player card (look + name), synced everywhere
  const stamina = useVitals().stamina       // live shared stamina
  const canAfford = stamina >= cost          // each roll costs `cost` stamina
  const [phase, setPhase]     = useState('idle')    // idle | rolling | resolved
  const [diceA, setDiceA]     = useState(1)
  const [diceB, setDiceB]     = useState(1)
  const [highlight, setHighlight] = useState(null)
  const [log, setLog]         = useState([])
  const [outcome, setOutcome] = useState(null)
  const tickRef = useRef(null)

  // Procedural opponent loadout — same opponent => same loadout
  const oppLoadout = useMemo(() => opponentSkillLoadout(opponent), [opponent])
  // We'll also flag "learned" entries for the opponent so the slot grid renders
  // their equipped skills as active (not greyed out).
  const oppLearned = useMemo(() => {
    const m = {}
    Object.values(oppLoadout).forEach(({ skillId, level }) => { m[skillId] = { level } })
    return m
  }, [oppLoadout])
  const oppEquippedMap = useMemo(() => {
    const m = {}
    Object.entries(oppLoadout).forEach(([slot, { skillId }]) => { m[slot] = skillId })
    return m
  }, [oppLoadout])

  // Per-fight base stats
  const stats = useMemo(() => {
    const playerBaseAttack  = PLAYER.traits.muscle * 5 + 15
    const playerBaseDefense = PLAYER.traits.cred * 5 + 10
    const oppBaseAttack  = Math.floor(opponent.power * 0.55) + 10
    const oppBaseDefense = Math.floor(opponent.power * 0.45) + 15
    return { playerBaseAttack, playerBaseDefense, oppBaseAttack, oppBaseDefense }
  }, [opponent])

  const maxPlayerHp = PLAYER.traits.toughness * 25
  const maxOppHp    = Math.floor(opponent.power * 6 + 800)
  const [playerHp, setPlayerHp] = useState(maxPlayerHp)
  const [oppHp, setOppHp]       = useState(maxOppHp)
  // Floating-damage triggers: bumping .key remounts the damage label so its CSS
  // animation re-fires on every hit. `amount` drives the displayed number.
  const [playerHit, setPlayerHit] = useState({ amount: 0, key: 0 })
  const [oppHit,    setOppHit]    = useState({ amount: 0, key: 0 })
  // Slot that the dice LANDED on (not the spinning highlight) — drives the
  // slot-activate pulse. Reset when a new roll begins.
  const [landedSlot, setLandedSlot] = useState(null)

  const roll = () => {
    if (phase === 'rolling') return
    if (stamina < cost) { sfx.deny?.(); return }   // not enough stamina to fight
    if (phase === 'resolved') {
      setPlayerHp(maxPlayerHp)
      setOppHp(maxOppHp)
      setLog([])
      setOutcome(null)
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
        setHighlight(slot)
        setLandedSlot(slot)   // triggers the slot-activate flash
        resolve(slot)
      }
    }, 80)
  }

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current) }, [])

  const resolve = (slot) => {
    // Player skill at this slot
    const pEquippedId = PLAYER.equippedSkills[slot]
    const pSkillDef   = pEquippedId ? SKILLS.find(s => s.id === pEquippedId) : null
    const pLearned    = pSkillDef ? PLAYER.learnedSkills[pSkillDef.id] : null
    const pSkillFires = !!(pSkillDef && pLearned && pLearned.level > 0)
    const pSkillBonus = pSkillFires ? pLearned.level * pSkillDef.perLevelAttack : 0

    // Opponent skill at this slot
    const oSlot      = oppLoadout[slot]
    const oSkillDef  = oSlot ? SKILLS.find(s => s.id === oSlot.skillId) : null
    const oSkillFires = !!oSkillDef
    const oSkillBonus = oSkillFires ? oSlot.level * oSkillDef.perLevelAttack : 0

    const playerAttack  = stats.playerBaseAttack + pSkillBonus
    const playerDefense = stats.playerBaseDefense
    const oppAttack     = stats.oppBaseAttack + oSkillBonus
    const oppDefense    = stats.oppBaseDefense

    const youDealt = Math.max(0, playerAttack - oppDefense)
    const oppDealt = Math.max(0, oppAttack - playerDefense)

    const newOppHp    = Math.max(0, oppHp - youDealt)
    const newPlayerHp = Math.max(0, playerHp - oppDealt)
    setOppHp(newOppHp)
    setPlayerHp(newPlayerHp)
    // Trigger floating damage + hit shake on each fighter
    if (youDealt > 0) setOppHit(h    => ({ amount: youDealt, key: h.key + 1 }))
    if (oppDealt > 0) setPlayerHit(h => ({ amount: oppDealt, key: h.key + 1 }))

    const roundLog = []
    roundLog.push({ side: 'round', text: `— Round (slot ${slot}) —`, color: '#666' })
    if (pSkillFires) {
      roundLog.push({ side: 'you', text: `You use ${pSkillDef.shortName}! +${pSkillBonus} attack`, color: GOLD })
    } else {
      roundLog.push({ side: 'you', text: `You don't use a skill (slot ${slot} empty)`, color: '#888' })
    }
    if (oSkillFires) {
      roundLog.push({ side: 'opp', text: `${opponent.name} uses ${oSkillDef.shortName}! +${oSkillBonus} attack`, color: ORANGE })
    } else {
      roundLog.push({ side: 'opp', text: `${opponent.name} doesn't use a skill`, color: '#888' })
    }
    roundLog.push({ side: 'you', text: `You hit ${opponent.name} for ${youDealt} (HP ${newOppHp.toLocaleString()})`, color: BLUE })
    roundLog.push({ side: 'opp', text: `${opponent.name} hits you for ${oppDealt} (HP ${newPlayerHp.toLocaleString()})`, color: RED })

    let result = null
    if (newOppHp <= 0 && newPlayerHp <= 0) result = 'draw'
    else if (newOppHp <= 0)                result = 'win'
    else if (newPlayerHp <= 0)             result = 'lose'

    if (result === 'win') {
      const parts = []
      if (rewards?.xp)         parts.push(`+${rewards.xp.toLocaleString()} XP`)
      if (rewards?.hustle)     parts.push(`+${rewards.hustle.toLocaleString()} Hustle`)
      if (rewards?.skillTokens)parts.push(`+${rewards.skillTokens} skill token${rewards.skillTokens === 1 ? '' : 's'}`)
      if (rewards?.cardDrop)   parts.push(`+1 card drop`)
      const summary = parts.length ? parts.join(' · ') : 'Victory!'
      roundLog.push({ side: 'result', text: `★ Victory! ${summary}`, color: GREEN })
      sfx.win()
      if (onWin) onWin(opponent)
    } else if (result === 'lose') {
      roundLog.push({ side: 'result', text: `${opponent.name} defeats you.`, color: RED })
      sfx.lose()
    } else if (result === 'draw') {
      roundLog.push({ side: 'result', text: `Mutual KO — both fighters down.`, color: '#888' })
      sfx.clash()
    } else {
      sfx.clash()
    }

    // Report the resolved fight so the caller can apply real, shared health loss
    // (damageTaken is on the global vitals-health scale: toughness × 25).
    if (result && onResult) onResult({ result, damageTaken: maxPlayerHp - newPlayerHp, maxHp: maxPlayerHp })

    setLog(prev => [...prev, ...roundLog])
    setOutcome(result)
    setPhase(result ? 'resolved' : 'idle')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#13131f',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      zIndex: 220,
    }}>
      <div style={{
        padding: '20px 16px 100px',
        width: '100%',
        maxWidth: 390,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 16px' }} />

        {/* Reward badge (e.g. "5× REWARD" for PvP, "BOSS" for bosses) */}
        {(rewards?.multText || opponent.boss) && (
          <div style={{
            textAlign: 'center', marginBottom: 8,
            color: opponent.boss ? GOLD : ORANGE,
            fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
          }}>
            {opponent.boss ? '★ BOSS ENCOUNTER ★' : rewards.multText}
          </div>
        )}

        {/* VS row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <FighterBlock name={me.name} emoji={me.emoji} avatar={me.avatar} level={PLAYER.level}
            attack={stats.playerBaseAttack} defense={stats.playerBaseDefense}
            hp={playerHp} maxHp={maxPlayerHp} color={BLUE}
            hit={playerHit}
            outcome={outcome === 'win' ? 'winner' : outcome === 'lose' ? 'loser' : null} />

          <div style={{
            background: '#0d0d15',
            border: `1.5px solid ${phase === 'rolling' ? GOLD : '#2a2a3a'}`,
            borderRadius: 14, padding: 10,
            flexShrink: 0, transition: 'border-color 0.2s',
          }}>
            <div style={{ color: '#888', fontSize: 9, letterSpacing: 1.5, textAlign: 'center', marginBottom: 6, fontWeight: 700 }}>BATTLE DICE</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              <Die value={diceA} color={BLUE} rolling={phase === 'rolling'} />
              <Die value={diceB} color={ORANGE} rolling={phase === 'rolling'} />
            </div>
            {highlight != null && (
              <div style={{ textAlign: 'center', marginTop: 6, color: phase === 'rolling' ? GOLD : '#fff', fontSize: 12, fontWeight: 700 }}>
                Slot {highlight}
              </div>
            )}
          </div>

          <FighterBlock name={opponent.name} emoji={opponent.emoji} avatar={opponent.avatar} level={opponent.level}
            attack={stats.oppBaseAttack} defense={stats.oppBaseDefense}
            hp={oppHp} maxHp={maxOppHp} color={RED}
            hit={oppHit}
            outcome={outcome === 'win' ? 'loser' : outcome === 'lose' ? 'winner' : null} />
        </div>

        {/* Skill slot grids — both player and opponent loadouts visible */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          <SlotGrid side="you" equipped={PLAYER.equippedSkills} learned={PLAYER.learnedSkills} highlight={highlight} landed={landedSlot} color={BLUE} />
          <SlotGrid side="opp" equipped={oppEquippedMap} learned={oppLearned} highlight={highlight} landed={landedSlot} color={ORANGE} />
        </div>

        {/* Stamina readout — so you always know what you've got to fight with. */}
        {phase !== 'resolved' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888', fontSize: 11 }}>
                <i className="ti ti-bolt" style={{ color: canAfford ? GOLD : RED, fontSize: 12, marginRight: 4 }} />
                Stamina
              </span>
              <span style={{ color: canAfford ? GOLD : RED, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {stamina} / {STAMINA_MAX} · {cost} per roll
              </span>
            </div>
            <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(stamina / STAMINA_MAX * 100)}%`, background: canAfford ? `linear-gradient(90deg, ${GOLD}, #f0d080)` : RED, borderRadius: 2, transition: 'width 0.4s' }} />
            </div>
          </div>
        )}

        {/* Primary CTA — dark + disabled when you can't afford the roll. */}
        {phase !== 'resolved' && (
          <button
            onClick={roll}
            disabled={phase === 'rolling' || !canAfford}
            style={{
              marginTop: 10, width: '100%',
              background: (phase === 'rolling' || !canAfford) ? '#1e1e2a' : GOLD,
              color: (phase === 'rolling' || !canAfford) ? '#555' : '#0a0a0f',
              border: 'none', borderRadius: 12,
              padding: '16px 12px',
              fontSize: 16, fontWeight: 800, letterSpacing: 1.5,
              cursor: phase === 'rolling' ? 'wait' : !canAfford ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: (phase === 'rolling' || !canAfford) ? 'none' : `0 0 20px ${GOLD}44`,
              animation: (phase === 'idle' && canAfford) ? 'pulse 2s ease-in-out infinite' : 'none',
            }}
          >
            <i className={`ti ${canAfford ? 'ti-dice' : 'ti-bolt-off'}`} style={{ fontSize: 18 }} />
            {phase === 'rolling' ? 'ROLLING…' : !canAfford ? 'NOT ENOUGH STAMINA' : `ROLL THE DICE  ·  ${cost} STAMINA`}
          </button>
        )}

        {/* Combat log */}
        {(log.length > 0 || phase !== 'idle') && (
          <div style={{
            background: '#0d0d15', borderRadius: 12, padding: 12,
            minHeight: log.length > 0 ? 90 : 0, marginTop: 14,
          }}>
            {log.length === 0 && phase === 'rolling' && (
              <div style={{ color: '#888', fontSize: 12, textAlign: 'center', paddingTop: 18, animation: 'pulse 0.8s infinite' }}>
                Rolling…
              </div>
            )}
            {log.map((line, i) => (
              <div key={i} style={{
                color: line.color, fontSize: 12, marginBottom: 4,
                opacity: 0, animation: `logLineIn 0.3s ease ${i * 0.12}s forwards`,
                fontWeight: line.side === 'result' ? 700 : 400,
              }}>{line.text}</div>
            ))}
          </div>
        )}

        {phase === 'resolved' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={roll}
              disabled={!canAfford}
              style={{
                flex: 1, background: canAfford ? GOLD : '#1e1e2a', color: canAfford ? '#0a0a0f' : '#555',
                border: 'none', borderRadius: 10, padding: 14,
                fontSize: 12, fontWeight: 800, letterSpacing: 1, cursor: canAfford ? 'pointer' : 'not-allowed',
              }}
            >
              <i className={`ti ${canAfford ? 'ti-refresh' : 'ti-bolt-off'}`} style={{ fontSize: 13, marginRight: 4 }} />
              {canAfford ? 'ROLL AGAIN' : 'NO STAMINA'}
            </button>
            <button
              onClick={onClose}
              style={{
                flex: 1, background: '#1e1e2a', color: '#888',
                border: '0.5px solid #2a2a3a', borderRadius: 10, padding: 14,
                fontSize: 12, fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
              }}
            >
              CLOSE
            </button>
          </div>
        )}
        {outcome && (
          <div style={{
            marginTop: 10, textAlign: 'center',
            color: outcome === 'win' ? GREEN : outcome === 'lose' ? RED : '#888',
            fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
          }}>
            {outcome === 'win' ? '★ VICTORY ★' : outcome === 'lose' ? 'DEFEATED' : 'DRAW'}
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
  // outcome: 'winner' | 'loser' | null
  const outerAnim = outcome === 'winner'
    ? 'winnerGlow 1.8s ease-in-out infinite'
    : outcome === 'loser'
      ? 'loserDim 0.7s ease forwards'
      : 'none'
  return (
    <div style={{
      flex: 1, minWidth: 0, textAlign: 'center',
      opacity: dead ? 0.45 : 1, transition: 'opacity 0.4s',
      animation: outerAnim, borderRadius: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
        <div
          key={hit ? hit.key : 'avatar'}
          style={{
            filter: dead ? 'grayscale(1)' : 'none',
            animation: hit && hit.key > 0 ? 'hitShake 0.32s ease' : 'none',
          }}
        >
          <Avatar src={avatar} emoji={emoji} size={56} radius={10} />
        </div>
        {hit && hit.key > 0 && (
          <span
            key={`dmg-${hit.key}`}
            style={{
              position: 'absolute', top: -2, left: '50%',
              color, fontSize: 16, fontWeight: 800,
              textShadow: '0 0 6px #0a0a0f, 0 1px 2px #0a0a0f',
              pointerEvents: 'none',
              animation: 'damageFloat 0.9s ease-out forwards',
            }}
          >-{hit.amount}</span>
        )}
      </div>
      <div style={{ color, fontSize: 11, fontWeight: 600, marginTop: 2,
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name}</div>
      <div style={{ color: '#888', fontSize: 9, marginTop: 1 }}>Lv {level}</div>
      <div style={{ color: '#666', fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
        ATK {attack} · DEF {defense}
      </div>
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
      <div style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textAlign: side === 'you' ? 'left' : 'right', marginBottom: 4 }}>
        SKILLS
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {slots.map(slot => {
          const isHl     = highlight === slot
          const isLanded = landed === slot
          const skillId = equipped[slot]
          const learnedSkill = skillId ? learned[skillId] : null
          const emoji = skillId ? (SKILLS.find(s => s.id === skillId)?.emoji || '') : ''
          return (
            <div
              // Remount on each land so the slotActivate keyframe re-fires.
              key={isLanded ? `landed-${landed}` : slot}
              style={{
                aspectRatio: '1',
                background: isHl ? `${color}33` : '#0d0d15',
                border: `${isHl ? 2 : 0.5}px solid ${isHl ? color : '#2a2a3a'}`,
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
                transition: 'border-color 0.12s, background 0.12s',
                boxShadow: isHl ? `0 0 8px ${color}66` : 'none',
                animation: isLanded ? 'slotActivate 0.5s ease' : 'none',
                '--flash-color': color,
              }}>
              {emoji && (
                <span style={{
                  fontSize: 14,
                  filter: learnedSkill ? 'none' : 'grayscale(1) brightness(0.5)',
                }}>{emoji}</span>
              )}
              <span style={{
                position: 'absolute', bottom: 1, right: 2,
                color: isHl ? color : '#444',
                fontSize: 7, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}>{slot}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Die({ value, color, rolling }) {
  const layouts = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  }
  const active = new Set(layouts[value] || [])
  return (
    <div style={{
      width: 52, height: 52, borderRadius: 10,
      background: '#0a0a0f',
      border: `1.5px solid ${color}`,
      padding: 6,
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridTemplateRows: 'repeat(3, 1fr)',
      boxShadow: rolling ? `0 0 8px ${color}66` : 'none',
      transition: 'box-shadow 0.15s',
    }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <React.Fragment key={i}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: active.has(i) ? color : 'transparent',
            placeSelf: 'center',
          }} />
        </React.Fragment>
      ))}
    </div>
  )
}
