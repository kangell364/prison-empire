import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from './Avatar'
import { sfx } from '../sounds'
import { atkOf, crewTotals } from '../state/crewStore'
import { RARITY_COLORS } from '../data/gameData'

const GOLD   = '#c9a84c'
const BLUE   = '#4a9eff'
const ORANGE = '#f39c12'
const RED    = '#e74c3c'
const GREEN  = '#2ecc71'

// Damage formula:
//   roundAttack = slotCardATK × 2 + crewTotalATK × 0.3
//   roundDefense = defenderTotalDEF × 0.5
//   damage = max(1, roundAttack - roundDefense)
//
// Empty slots resolve to 1 damage — strong incentive to fill all 12.
// HP = totalDef × 3 + 200. Tuned for ~5-10 rolls per fight.
const SLOT_ATK_MULT       = 2
const TEAM_ATK_CONTRIB    = 0.3
const TEAM_DEF_REDUCTION  = 0.5
const HP_FROM_DEF         = 3
const HP_BASELINE         = 200

// ---------------------------------------------------------------------
// CrewBattleModal
// Props:
//   playerCrew = { leader: card, members: [card|null × 11], upgrades, name? }
//   opponent   = { name, leader: card, members: [card|null × 11], upgrades? }
//   onClose    — close modal
//   onWin      — called with opponent payload when the player KOs them
//   onLose     — called when the player goes down
// ---------------------------------------------------------------------
export function CrewBattleModal({ playerCrew, opponent, onClose, onWin, onLose }) {
  const playerLeader  = playerCrew.leader
  const playerMembers = playerCrew.members
  const playerSlots   = useMemo(() => [playerLeader, ...playerMembers], [playerLeader, playerMembers])
  const oppLeader     = opponent.leader
  const oppMembers    = opponent.members
  const oppSlots      = useMemo(() => [oppLeader, ...oppMembers], [oppLeader, oppMembers])

  // Totals + HP
  const playerTotals = useMemo(
    () => crewTotals(playerSlots, playerCrew.upgrades || {}),
    [playerSlots, playerCrew.upgrades]
  )
  const oppTotals = useMemo(
    () => crewTotals(oppSlots, opponent.upgrades || {}),
    [oppSlots, opponent.upgrades]
  )
  const maxPlayerHp = playerTotals.def * HP_FROM_DEF + HP_BASELINE
  const maxOppHp    = oppTotals.def    * HP_FROM_DEF + HP_BASELINE

  // phase progression — single roll resolves both sides:
  //   idle → rolling → resolved (or back to idle for the next auto-roll)
  const [phase, setPhase]       = useState('idle')
  const [diceA, setDiceA]       = useState(1)
  const [diceB, setDiceB]       = useState(1)
  const [highlight, setHighlight] = useState(null)
  const [log, setLog]           = useState([])
  const [outcome, setOutcome]   = useState(null)
  const [playerHp, setPlayerHp] = useState(maxPlayerHp)
  const [oppHp, setOppHp]       = useState(maxOppHp)
  const [roundNum, setRoundNum] = useState(0)
  const [autoRolling, setAutoRolling] = useState(false)
  const tickRef    = useRef(null)
  const chainRef   = useRef(null)   // setTimeout that schedules the next roll

  // Refs for values that the auto-chained resolve() needs to read fresh on
  // every round. State setters alone won't work — the resolve closure is
  // captured by setInterval, so it always sees the values from the render
  // when the interval was created (the "stale closure" trap).
  const playerHpRef = useRef(maxPlayerHp)
  const oppHpRef    = useRef(maxOppHp)
  const roundRef    = useRef(0)

  // Clear pending timers on unmount. setState in a still-running interval
  // callback that fires after unmount is harmless (React no-ops it).
  useEffect(() => () => {
    if (tickRef.current)  clearInterval(tickRef.current)
    if (chainRef.current) clearTimeout(chainRef.current)
  }, [])

  // Single 3-second roll: dice spin, lands on slot 2-12, both sides activate.
  const doRoll = () => {
    setPhase('rolling')
    setHighlight(null)
    sfx.tick()

    const start = Date.now()
    const duration = 3000
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - start
      setDiceA(1 + Math.floor(Math.random() * 6))
      setDiceB(1 + Math.floor(Math.random() * 6))
      // Rolling highlight stays in the member range (2..12); leader never picked.
      setHighlight(2 + Math.floor(Math.random() * 11))
      if (elapsed > 0 && elapsed % 240 < 90) sfx.tick()
      if (elapsed >= duration) {
        clearInterval(tickRef.current)
        const finalA = 1 + Math.floor(Math.random() * 6)
        const finalB = 1 + Math.floor(Math.random() * 6)
        setDiceA(finalA); setDiceB(finalB)
        // Sum (2..12) is the slot number — directly maps to one of the 11
        // numbered crew members. The Leader is never dice-activated; they
        // contribute passively via the crew totals.
        const slot = finalA + finalB
        setHighlight(slot)
        resolve(slot, finalA, finalB)
      }
    }, 70)
  }

  // Start the auto-chain. Resets state if we're rolling a rematch.
  const startFight = () => {
    if (phase === 'rolling') return
    if (phase === 'resolved') {
      playerHpRef.current = maxPlayerHp
      oppHpRef.current    = maxOppHp
      roundRef.current    = 0
      setPlayerHp(maxPlayerHp)
      setOppHp(maxOppHp)
      setLog([])
      setOutcome(null)
      setRoundNum(0)
    }
    setAutoRolling(true)
    doRoll()
  }

  // Dice sum 2..12 → member index 0..10. Leader (slots[0]) is never the
  // dice target and is intentionally absent from this lookup.
  function cardAtSlot(slots, slot) {
    const memberIndex = slot - 2
    return slots[1 + memberIndex] || null
  }

  const resolve = (slot, dA, dB) => {
    const pCard = cardAtSlot(playerSlots, slot)
    const oCard = cardAtSlot(oppSlots,    slot)

    const pSlotAtk = pCard ? atkOf(pCard, playerCrew.upgrades || {}) : 0
    const oSlotAtk = oCard ? atkOf(oCard, opponent.upgrades || {})  : 0

    const pRoundAtk = pSlotAtk * SLOT_ATK_MULT + playerTotals.atk * TEAM_ATK_CONTRIB
    const oRoundAtk = oSlotAtk * SLOT_ATK_MULT + oppTotals.atk    * TEAM_ATK_CONTRIB

    const pDefRed = playerTotals.def * TEAM_DEF_REDUCTION
    const oDefRed = oppTotals.def    * TEAM_DEF_REDUCTION

    const youDealt = Math.max(1, Math.round(pRoundAtk - oDefRed))
    const oppDealt = Math.max(1, Math.round(oRoundAtk - pDefRed))

    // Read current HP from refs (state in this closure is stale because
    // setInterval captured it from an earlier render).
    const newOppHp    = Math.max(0, oppHpRef.current    - youDealt)
    const newPlayerHp = Math.max(0, playerHpRef.current - oppDealt)
    oppHpRef.current    = newOppHp
    playerHpRef.current = newPlayerHp
    setOppHp(newOppHp)
    setPlayerHp(newPlayerHp)

    roundRef.current += 1
    const currentRound = roundRef.current
    setRoundNum(currentRound)

    const next = []
    next.push({
      kind: 'round',
      text: `— Round ${currentRound} · dice ${dA}+${dB}=${slot} —`,
      color: '#666',
    })
    next.push({
      kind: 'you',
      text: pCard
        ? `${pCard.name} activates for your crew (+${pSlotAtk} ATK)`
        : `Empty slot on your side`,
      color: pCard ? GOLD : '#888',
    })
    next.push({
      kind: 'opp',
      text: oCard
        ? `${oCard.name} activates for ${opponent.name} (+${oSlotAtk} ATK)`
        : `Empty slot on their side`,
      color: oCard ? ORANGE : '#888',
    })
    next.push({ kind: 'you', text: `Your crew hits for ${youDealt}  (enemy HP ${newOppHp.toLocaleString()})`, color: BLUE })
    next.push({ kind: 'opp', text: `Their crew hits for ${oppDealt}  (your HP ${newPlayerHp.toLocaleString()})`, color: RED })

    let result = null
    if (newOppHp <= 0 && newPlayerHp <= 0) result = 'draw'
    else if (newOppHp <= 0)                result = 'win'
    else if (newPlayerHp <= 0)             result = 'lose'

    if (result === 'win') {
      next.push({ kind: 'result', text: `★ ${opponent.name} crew KO'd ★`, color: GREEN })
      sfx.win()
      if (onWin) onWin(opponent)
    } else if (result === 'lose') {
      next.push({ kind: 'result', text: `${opponent.name} crew breaks you.`, color: RED })
      sfx.lose()
      if (onLose) onLose(opponent)
    } else if (result === 'draw') {
      next.push({ kind: 'result', text: `Both crews down — bloody draw.`, color: '#888' })
      sfx.tick()
    } else {
      sfx.tick()
    }

    setLog(prev => [...prev, ...next])
    setOutcome(result)
    if (result) {
      setPhase('resolved')
      setAutoRolling(false)
    } else {
      // Auto-roll the next round after a short beat so the player can read
      // the log entry before the dice start spinning again.
      setPhase('between')
      chainRef.current = setTimeout(doRoll, 700)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0a0a0f',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      zIndex: 240,
    }}>
      <div style={{
        padding: '20px 12px 80px',
        width: '100%', maxWidth: 420,
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 12px' }} />

        <div style={{
          textAlign: 'center', marginBottom: 8,
          color: GOLD, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
        }}>
          ★ CREW vs CREW ★
        </div>

        {/* Crew header — leader avatar + totals + HP */}
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', gap: 6 }}>
          <CrewHeader
            label={playerCrew.name || 'Your Crew'}
            leader={playerLeader}
            totals={playerTotals}
            hp={playerHp} maxHp={maxPlayerHp}
            color={BLUE}
          />

          <DiceBox phase={phase} diceA={diceA} diceB={diceB} highlight={highlight} />

          <CrewHeader
            label={opponent.name}
            leader={oppLeader}
            totals={oppTotals}
            hp={oppHp} maxHp={maxOppHp}
            color={RED}
            mirrored
          />
        </div>

        {/* 11-member slot grids — face-off layout */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 12 }}>
          <CrewSlotGrid
            members={playerMembers}
            upgrades={playerCrew.upgrades || {}}
            highlight={highlight}
            color={BLUE}
          />
          <CrewSlotGrid
            members={oppMembers}
            upgrades={opponent.upgrades || {}}
            highlight={highlight}
            color={RED}
          />
        </div>

        {/* Start button — single press kicks off the auto-chain until KO */}
        {phase !== 'resolved' && (() => {
          const busy = phase === 'rolling' || phase === 'between' || autoRolling
          const label =
            phase === 'rolling' ? `ROLLING…  ROUND ${roundNum + 1}` :
            phase === 'between' ? `ROUND ${roundNum + 1} INCOMING…` :
            'START FIGHT'
          return (
            <button
              onClick={startFight}
              disabled={busy}
              style={{
                marginTop: 16, width: '100%',
                background: busy ? '#1e1e2a' : GOLD,
                color: busy ? '#888' : '#0a0a0f',
                border: 'none', borderRadius: 12,
                padding: '16px 12px',
                fontSize: 14, fontWeight: 800, letterSpacing: 1.5,
                cursor: busy ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: busy ? 'none' : `0 0 20px ${GOLD}44`,
                animation: phase === 'idle' && !autoRolling ? 'pulse 2s ease-in-out infinite' : 'none',
              }}
            >
              <i className="ti ti-dice" style={{ fontSize: 18 }} />
              {label}
            </button>
          )
        })()}

        {/* Log */}
        {(log.length > 0 || phase !== 'idle') && (
          <div style={{
            background: '#13131f', borderRadius: 12, padding: 10,
            marginTop: 14, maxHeight: 220, overflowY: 'auto',
          }}>
            {log.length === 0 && phase === 'rolling' && (
              <div style={{ color: '#888', fontSize: 12, textAlign: 'center', paddingTop: 18, animation: 'pulse 0.8s infinite' }}>
                Rolling…
              </div>
            )}
            {log.map((line, i) => (
              <div key={i} style={{
                color: line.color, fontSize: 11.5, marginBottom: 3,
                opacity: 0, animation: `logLineIn 0.3s ease ${Math.min(i, 8) * 0.06}s forwards`,
                fontWeight: line.kind === 'result' ? 700 : 400,
              }}>{line.text}</div>
            ))}
          </div>
        )}

        {phase === 'resolved' && (
          <>
            <div style={{
              marginTop: 14, textAlign: 'center',
              color: outcome === 'win' ? GREEN : outcome === 'lose' ? RED : '#888',
              fontSize: 13, fontWeight: 800, letterSpacing: 2,
            }}>
              {outcome === 'win' ? '★ CREW VICTORY ★' : outcome === 'lose' ? 'CREW DEFEATED' : 'DRAW'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={startFight}
                style={{
                  flex: 1, background: GOLD, color: '#0a0a0f',
                  border: 'none', borderRadius: 10, padding: 14,
                  fontSize: 12, fontWeight: 800, letterSpacing: 1, cursor: 'pointer',
                }}
              >
                <i className="ti ti-refresh" style={{ fontSize: 13, marginRight: 4 }} />
                REMATCH
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
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------

function CrewHeader({ label, leader, totals, hp, maxHp, color, mirrored }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0
  const hpColor = pct > 60 ? GREEN : pct > 25 ? ORANGE : RED
  const dead = hp <= 0
  const ringColor = leader ? RARITY_COLORS[leader.rarity] : color

  return (
    <div style={{
      flex: 1, minWidth: 0, textAlign: 'center',
      opacity: dead ? 0.45 : 1, transition: 'opacity 0.4s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
        <div style={{
          padding: 2,
          borderRadius: 12,
          filter: dead ? 'grayscale(1)' : 'none',
        }}>
          <Avatar src={leader?.avatar} emoji={leader?.emoji || '👤'} size={56} radius={10} />
        </div>
        <div style={{
          position: 'absolute', top: -4,
          [mirrored ? 'left' : 'right']: -4,
          background: ringColor, color: '#0a0a0f',
          fontSize: 7, fontWeight: 800, letterSpacing: 0.5,
          padding: '2px 5px', borderRadius: 4,
        }}>LDR</div>
      </div>
      <div style={{
        color: '#fff', fontSize: 11, fontWeight: 600, marginTop: 4,
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>{label}</div>
      <div style={{
        color: '#888', fontSize: 9, marginTop: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        ATK {totals.atk} · DEF {totals.def}
      </div>
      <div style={{ marginTop: 5 }}>
        <div style={{
          color: hpColor, fontSize: 9, fontWeight: 600,
          fontVariantNumeric: 'tabular-nums', marginBottom: 2,
        }}>
          {dead ? 'KO' : `${hp.toLocaleString()} / ${maxHp.toLocaleString()}`}
        </div>
        <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`, background: hpColor,
            borderRadius: 2, transition: 'width 0.5s ease, background 0.3s',
          }} />
        </div>
      </div>
    </div>
  )
}

function DiceBox({ phase, diceA, diceB, highlight }) {
  const rolling = phase === 'rolling'
  return (
    <div style={{
      background: '#0d0d15',
      border: `1.5px solid ${rolling ? GOLD : '#2a2a3a'}`,
      borderRadius: 14, padding: 8,
      flexShrink: 0, transition: 'border-color 0.2s',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minWidth: 96,
    }}>
      <div style={{ color: '#888', fontSize: 8, letterSpacing: 1.5, marginBottom: 4, fontWeight: 700 }}>BATTLE DICE</div>
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
        <Die value={diceA} color={BLUE}   rolling={rolling} />
        <Die value={diceB} color={ORANGE} rolling={rolling} />
      </div>
      {highlight != null && (
        <div style={{
          textAlign: 'center', marginTop: 5,
          color: rolling ? GOLD : '#fff',
          fontSize: 10, fontWeight: 700, letterSpacing: 1,
        }}>
          {`SLOT ${highlight}`}
        </div>
      )}
    </div>
  )
}

function CrewSlotGrid({ members, upgrades, highlight, color }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3,
      }}>
        {members.map((c, i) => {
          const slot = i + 2  // member slot 0 → dice slot 2
          const isHl = highlight === slot
          const ringColor = c ? RARITY_COLORS[c.rarity] : '#2a2a3a'
          return (
            <div key={i} style={{
              aspectRatio: '1',
              background: isHl ? `${color}33` : '#0d0d15',
              border: `${isHl ? 2 : 0.5}px solid ${isHl ? color : ringColor + '66'}`,
              borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', overflow: 'hidden',
              transition: 'border-color 0.12s, background 0.12s, box-shadow 0.12s',
              boxShadow: isHl ? `0 0 6px ${color}66` : 'none',
            }}>
              {c ? (
                <Avatar src={c.avatar} emoji={c.emoji} size={28} radius={4} />
              ) : (
                <i className="ti ti-question-mark" style={{ color: '#333', fontSize: 12 }} />
              )}
              <span style={{
                position: 'absolute', bottom: 0, right: 2,
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
      width: 44, height: 44, borderRadius: 8,
      background: '#0a0a0f',
      border: `1.5px solid ${color}`,
      padding: 5,
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridTemplateRows: 'repeat(3, 1fr)',
      boxShadow: rolling ? `0 0 6px ${color}66` : 'none',
      transition: 'box-shadow 0.15s',
    }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: active.has(i) ? color : 'transparent',
          placeSelf: 'center',
        }} />
      ))}
    </div>
  )
}
