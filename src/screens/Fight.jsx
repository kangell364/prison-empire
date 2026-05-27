import React, { useState, useEffect, useMemo, useRef } from 'react'
import { PLAYER, SKILLS, RANKED_PLAYERS, PVP_LEVEL_RANGE, PVP_FIGHT_COST, pvpRewardMultiplier } from '../data/gameData'
import { sfx } from '../sounds'
import { Avatar } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import Battle from './Battle'

const GOLD   = '#c9a84c'
const BLUE   = '#4a9eff'
const ORANGE = '#f39c12'
const RED    = '#e74c3c'
const GREEN  = '#2ecc71'
const DIM    = '#555'

export default function Fight() {
  const [tab, setTab] = useState('players')

  return (
    <>
      {/* Sub-tab bar (lives ABOVE the scrollable region so it stays put) */}
      <div style={{
        padding: '10px 16px',
        background: '#0d0d15',
        borderBottom: '0.5px solid #1e1e2a',
        display: 'flex', gap: 6,
        flexShrink: 0,
      }}>
        <SubTab active={tab === 'players'} onClick={() => setTab('players')}>
          <i className="ti ti-users" style={{ marginRight: 5, fontSize: 13 }} />
          Players
        </SubTab>
        <SubTab active={tab === 'bosses'} onClick={() => setTab('bosses')}>
          <i className="ti ti-skull" style={{ marginRight: 5, fontSize: 13 }} />
          Bosses
        </SubTab>
      </div>

      {tab === 'players' ? <PlayersScreen /> : <Battle />}
    </>
  )
}

function SubTab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1,
      background: active ? `${GOLD}18` : '#13131f',
      border: `0.5px solid ${active ? `${GOLD}44` : '#2a2a3a'}`,
      borderRadius: 10,
      padding: '9px 0',
      color: active ? GOLD : '#888',
      fontSize: 13, fontWeight: 500, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  )
}

// =====================================================================
// PvP — Players list + Battle Dice modal
// =====================================================================

function PlayersScreen() {
  const [dailyKills, setDailyKills] = useState(PLAYER.dailyKills)
  const [stamina, setStamina]       = useState(78)
  const [target, setTarget]         = useState(null)
  const [detailPlayer, setDetailPlayer] = useState(null)
  // Track last fight reward to display on the list
  const [lastReward, setLastReward] = useState(null)

  const targets = useMemo(() => (
    RANKED_PLAYERS
      .filter(p => !p.isYou && p.level >= PLAYER.level && p.level <= PLAYER.level + PVP_LEVEL_RANGE)
      .sort((a, b) => a.level - b.level)
  ), [])

  const onFightOpened = (opp) => {
    if (stamina < PVP_FIGHT_COST) return
    setTarget(opp)
  }

  const onWin = (opp) => {
    const mult = pvpRewardMultiplier(PLAYER.level, opp.level)
    const reward = { xp: 50 * mult, hustle: 100 * mult, knowledge: 1 * mult, mult }
    setDailyKills(k => k + 1)
    setLastReward({ opp: opp.name, ...reward })
  }

  const onDiceRoll = () => {
    setStamina(s => Math.max(0, s - PVP_FIGHT_COST))
  }

  return (
    <div className="scroll-area animate-in">
      {/* Header card with daily kills + stamina + reward rule */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          background: 'linear-gradient(135deg, #15110a 0%, #13131f 100%)',
          border: `1px solid ${GOLD}44`,
          borderRadius: 16, padding: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Player vs Player</div>
              <div style={{ color: '#888', fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>
                See inmates from your level up to +{PVP_LEVEL_RANGE} above.
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ color: RED, fontSize: 18, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {dailyKills}
              </div>
              <div style={{ color: '#888', fontSize: 9, marginTop: 2, letterSpacing: 1 }}>DAILY KILLS</div>
            </div>
          </div>

          {/* Stamina mini-bar */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ color: '#888', fontSize: 10 }}>
                <i className="ti ti-bolt" style={{ color: GOLD, fontSize: 11, marginRight: 4 }} />
                Stamina
              </span>
              <span style={{ color: GOLD, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{stamina} / 100</span>
            </div>
            <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${stamina}%`, background: `linear-gradient(90deg, ${GOLD}, #f0d080)`, borderRadius: 2, transition: 'width 0.4s' }} />
            </div>
            <div style={{ color: DIM, fontSize: 10, marginTop: 6 }}>Each fight costs {PVP_FIGHT_COST} stamina.</div>
          </div>
        </div>
      </div>

      {/* Reward rule explainer */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{
          background: '#0d0d15',
          border: `0.5px solid ${BLUE}33`,
          borderRadius: 12, padding: 12,
          color: '#888', fontSize: 11, lineHeight: 1.5,
        }}>
          <div style={{ color: BLUE, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>HOW REWARDS WORK</div>
          Each kill pays out scaled to the level gap.{' '}
          <span style={{ color: '#fff' }}>Same level = 1×.</span>{' '}
          <span style={{ color: GOLD }}>+2 levels above = 2×.</span>{' '}
          <span style={{ color: ORANGE }}>+4 levels above = 4×.</span>{' '}
          Every defeated player also drops one skill-unlock token.
        </div>
      </div>

      {/* Last reward flash */}
      {lastReward && (
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{
            background: '#0e1a0e',
            border: `0.5px solid ${GREEN}55`,
            borderRadius: 12, padding: 10,
            color: GREEN, fontSize: 11, lineHeight: 1.5,
          }}>
            ✓ Defeated {lastReward.opp} ({lastReward.mult}× reward) — +{lastReward.xp} XP · +{lastReward.hustle.toLocaleString()} Hustle · +{lastReward.knowledge} skill token
          </div>
        </div>
      )}

      {/* Player list */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Available Targets ({targets.length})</div>
        {targets.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: 'center', color: DIM, fontSize: 12 }}>
            No targets in range. Level up to see more inmates.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {targets.map(opp => (
              <TargetCard
                key={opp.id}
                opp={opp}
                disabled={stamina < PVP_FIGHT_COST}
                onFight={() => onFightOpened(opp)}
                onShowDetail={() => setDetailPlayer(opp)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Battle Dice modal */}
      {target && (
        <BattleDiceModal
          opponent={target}
          onClose={() => setTarget(null)}
          onRoll={onDiceRoll}
          onWin={onWin}
        />
      )}

      {/* Player detail preview */}
      {detailPlayer && (
        <CharacterDetailModal
          character={detailPlayer}
          onClose={() => setDetailPlayer(null)}
          actions={stamina >= PVP_FIGHT_COST ? [
            { label: `FIGHT — ${PVP_FIGHT_COST} STAMINA`, icon: 'ti-sword', onClick: () => onFightOpened(detailPlayer) },
          ] : [
            { label: 'NOT ENOUGH STAMINA', icon: 'ti-bolt-off', onClick: () => {}, kind: 'secondary' },
          ]}
        />
      )}
    </div>
  )
}

function TargetCard({ opp, disabled, onFight, onShowDetail }) {
  const mult     = pvpRewardMultiplier(PLAYER.level, opp.level)
  const levelGap = opp.level - PLAYER.level
  const multColor = mult >= 4 ? ORANGE : mult >= 2 ? GOLD : '#888'

  return (
    <div className="card card-pad"
      onClick={onShowDetail}
      style={{
        padding: 14, display: 'flex', alignItems: 'center', gap: 12,
        borderColor: '#2a2a3a',
        cursor: 'pointer',
      }}>
      <Avatar src={opp.avatar} emoji={opp.emoji} size={52} radius={12}
        style={{ background: '#1e1e2a' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{opp.name}</div>
        <div style={{ color: '#888', fontSize: 11, marginTop: 1 }}>
          Lv {opp.level} · {opp.facility} · {opp.state}
        </div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            background: `${multColor}18`,
            border: `0.5px solid ${multColor}66`,
            color: multColor,
            fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            padding: '2px 6px',
            borderRadius: 6,
          }}>
            {mult}× REWARD
          </span>
          <span style={{ color: DIM, fontSize: 10 }}>
            {levelGap > 0 ? `+${levelGap} levels above` : 'same level'}
          </span>
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onFight() }}
        disabled={disabled}
        style={{
          background: disabled ? '#1e1e2a' : GOLD,
          color: disabled ? '#555' : '#0a0a0f',
          border: 'none', borderRadius: 8,
          padding: '10px 14px',
          fontSize: 12, fontWeight: 700, letterSpacing: 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <i className="ti ti-sword" style={{ fontSize: 13 }} />
        FIGHT
      </button>
    </div>
  )
}

// =====================================================================
// Battle Dice
// =====================================================================

function BattleDiceModal({ opponent, onClose, onRoll, onWin }) {
  const [phase, setPhase]     = useState('idle')      // idle | rolling | resolved
  const [diceA, setDiceA]     = useState(1)
  const [diceB, setDiceB]     = useState(1)
  const [highlight, setHighlight] = useState(null)    // 2..12 — which skill slot is "spotlighted"
  const [log, setLog]         = useState([])
  const [outcome, setOutcome] = useState(null)        // 'win' | 'lose' | 'draw'
  const tickRef = useRef(null)

  // Player & opponent stats — derived once per fight
  const stats = useMemo(() => {
    const playerBaseAttack  = PLAYER.traits.muscle * 5 + 15
    const playerBaseDefense = PLAYER.traits.cred * 5 + 10
    const oppBaseAttack  = Math.floor(opponent.power * 0.55) + 10
    const oppBaseDefense = Math.floor(opponent.power * 0.45) + 15
    return { playerBaseAttack, playerBaseDefense, oppBaseAttack, oppBaseDefense }
  }, [opponent])

  // HP tracked as state — every dice roll is one round, HP decrements until
  // someone hits 0. Roll Again after resolution resets to full HP.
  const maxPlayerHp = PLAYER.traits.toughness * 25
  const maxOppHp    = Math.floor(opponent.power * 6 + 800)
  const [playerHp, setPlayerHp] = useState(maxPlayerHp)
  const [oppHp, setOppHp]       = useState(maxOppHp)

  const roll = () => {
    if (phase === 'rolling') return
    // If the fight already ended, start a fresh fight with full HP
    if (phase === 'resolved') {
      setPlayerHp(maxPlayerHp)
      setOppHp(maxOppHp)
      setLog([])
      setOutcome(null)
    }
    setPhase('rolling')
    onRoll()
    sfx.tick()

    const start = Date.now()
    const duration = 1400

    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - start
      setDiceA(1 + Math.floor(Math.random() * 6))
      setDiceB(1 + Math.floor(Math.random() * 6))
      setHighlight(2 + Math.floor(Math.random() * 11))
      // Quiet click during roll
      if (elapsed > 0 && elapsed % 240 < 100) sfx.tick()

      if (elapsed >= duration) {
        clearInterval(tickRef.current)
        // Lock in final values
        const finalA = 1 + Math.floor(Math.random() * 6)
        const finalB = 1 + Math.floor(Math.random() * 6)
        setDiceA(finalA); setDiceB(finalB)
        const slot = finalA + finalB
        setHighlight(slot)
        resolve(slot)
      }
    }, 80)
  }

  // Clean up interval if modal closes mid-roll
  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current) }, [])

  const resolve = (slot) => {
    // Player's skill at this slot?
    const equippedId = PLAYER.equippedSkills[slot]
    const skillDef = equippedId ? SKILLS.find(s => s.id === equippedId) : null
    const learned  = skillDef ? PLAYER.learnedSkills[skillDef.id] : null
    const skillFires = !!(skillDef && learned && learned.level > 0)
    const skillBonus = skillFires ? learned.level * skillDef.perLevelAttack : 0

    const playerAttack  = stats.playerBaseAttack + skillBonus
    const playerDefense = stats.playerBaseDefense
    const oppAttack     = stats.oppBaseAttack
    const oppDefense    = stats.oppBaseDefense

    const youDealt = Math.max(0, playerAttack - oppDefense)
    const oppDealt = Math.max(0, oppAttack - playerDefense)

    // Apply damage to both sides — fight continues until one (or both) hits 0.
    const newOppHp    = Math.max(0, oppHp - youDealt)
    const newPlayerHp = Math.max(0, playerHp - oppDealt)
    setOppHp(newOppHp)
    setPlayerHp(newPlayerHp)

    const roundLog = []
    roundLog.push({ side: 'round', text: `— Round (slot ${slot}) —`, color: '#666' })
    if (skillFires) {
      roundLog.push({ side: 'you', text: `You use ${skillDef.shortName}! +${skillBonus} attack`, color: GOLD })
    } else {
      roundLog.push({ side: 'you', text: `You don't use a skill (slot ${slot} empty)`, color: '#888' })
    }
    roundLog.push({ side: 'opp', text: `${opponent.name} doesn't use a skill`, color: '#888' })
    roundLog.push({ side: 'you', text: `You hit ${opponent.name} for ${youDealt} (HP ${newOppHp.toLocaleString()})`, color: BLUE })
    roundLog.push({ side: 'opp', text: `${opponent.name} hits you for ${oppDealt} (HP ${newPlayerHp.toLocaleString()})`, color: RED })

    // Determine outcome — based on HP after damage applied
    let result = null
    if (newOppHp <= 0 && newPlayerHp <= 0) result = 'draw'
    else if (newOppHp <= 0)                result = 'win'
    else if (newPlayerHp <= 0)             result = 'lose'

    if (result === 'win') {
      const mult = pvpRewardMultiplier(PLAYER.level, opponent.level)
      roundLog.push({ side: 'result', text: `★ Victory! +${50*mult} XP · +${(100*mult).toLocaleString()} Hustle · +${mult} skill token`, color: GREEN })
      sfx.win()
      onWin(opponent)
    } else if (result === 'lose') {
      roundLog.push({ side: 'result', text: `${opponent.name} defeats you.`, color: RED })
      sfx.lose()
    } else if (result === 'draw') {
      roundLog.push({ side: 'result', text: `Mutual KO — both fighters down.`, color: '#888' })
      sfx.tick()
    } else {
      // Fight continues — small tick, re-enable rolling
      sfx.tick()
    }

    // Append to log so the full fight history is visible
    setLog(prev => [...prev, ...roundLog])
    setOutcome(result)
    setPhase(result ? 'resolved' : 'idle')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#13131f',
      display: 'flex',
      alignItems: 'stretch',
      justifyContent: 'center',
      zIndex: 200,
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

        {/* VS row: player | dice | opponent */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <FighterBlock name={PLAYER.name} emoji={PLAYER.card.emoji} avatar={PLAYER.card.avatar} level={PLAYER.level}
            attack={stats.playerBaseAttack} defense={stats.playerBaseDefense}
            hp={playerHp} maxHp={maxPlayerHp} color={BLUE} />

          {/* Dice block */}
          <div style={{
            background: '#0d0d15',
            border: `1.5px solid ${phase === 'rolling' ? GOLD : '#2a2a3a'}`,
            borderRadius: 14, padding: 10,
            flexShrink: 0,
            transition: 'border-color 0.2s',
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
            hp={oppHp} maxHp={maxOppHp} color={RED} />
        </div>

        {/* Skill slots (player on left, opponent mirrored on right) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          <SlotGrid side="you" equipped={PLAYER.equippedSkills} learned={PLAYER.learnedSkills} highlight={highlight} color={BLUE} />
          <SlotGrid side="opp" equipped={{}} learned={{}} highlight={highlight} color={ORANGE} />
        </div>

        {/* Primary action — gold call-to-action right under the dice/skills so
            the player can't miss it. The combat log appears below once a roll
            resolves. */}
        {phase !== 'resolved' && (
          <button
            onClick={roll}
            disabled={phase === 'rolling'}
            style={{
              marginTop: 16, width: '100%',
              background: phase === 'rolling' ? '#1e1e2a' : GOLD,
              color: phase === 'rolling' ? '#555' : '#0a0a0f',
              border: 'none', borderRadius: 12,
              padding: '16px 12px',
              fontSize: 16, fontWeight: 800, letterSpacing: 1.5,
              cursor: phase === 'rolling' ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: phase === 'rolling' ? 'none' : `0 0 20px ${GOLD}44`,
              animation: phase === 'idle' ? 'pulse 2s ease-in-out infinite' : 'none',
            }}
          >
            <i className="ti ti-dice" style={{ fontSize: 18 }} />
            {phase === 'rolling' ? 'ROLLING…' : `ROLL THE DICE  ·  ${PVP_FIGHT_COST} STAMINA`}
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

        {/* Post-resolve actions */}
        {phase === 'resolved' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={roll}
              style={{
                flex: 1, background: GOLD, color: '#0a0a0f',
                border: 'none', borderRadius: 10, padding: 14,
                fontSize: 12, fontWeight: 800, letterSpacing: 1, cursor: 'pointer',
              }}
            >
              <i className="ti ti-refresh" style={{ fontSize: 13, marginRight: 4 }} />
              ROLL AGAIN
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
        {/* Outcome stripe */}
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

function FighterBlock({ name, emoji, avatar, level, attack, defense, hp, maxHp, color }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0
  const hpColor = pct > 60 ? GREEN : pct > 25 ? ORANGE : RED
  const dead = hp <= 0
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center', opacity: dead ? 0.45 : 1, transition: 'opacity 0.4s' }}>
      <div style={{ display: 'flex', justifyContent: 'center', filter: dead ? 'grayscale(1)' : 'none' }}>
        <Avatar src={avatar} emoji={emoji} size={56} radius={10} />
      </div>
      <div style={{ color, fontSize: 11, fontWeight: 600, marginTop: 2,
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name}</div>
      <div style={{ color: '#888', fontSize: 9, marginTop: 1 }}>Lv {level}</div>
      <div style={{ color: '#666', fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
        ATK {attack} · DEF {defense}
      </div>
      {/* HP bar — updates live each round */}
      <div style={{ marginTop: 5 }}>
        <div style={{
          color: hpColor, fontSize: 10, fontWeight: 600,
          fontVariantNumeric: 'tabular-nums', marginBottom: 2,
        }}>
          {dead ? 'KO' : `${hp.toLocaleString()} / ${maxHp.toLocaleString()}`}
        </div>
        <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: hpColor,
            borderRadius: 2,
            transition: 'width 0.5s ease, background 0.3s',
          }} />
        </div>
      </div>
    </div>
  )
}

function SlotGrid({ side, equipped, learned, highlight, color }) {
  // Slots 2..12, render as 3 rows (2-5, 6-8, 9-12)
  const slots = Array.from({ length: 11 }, (_, i) => i + 2)
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textAlign: side === 'you' ? 'left' : 'right', marginBottom: 4 }}>
        SKILLS
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {slots.map(slot => {
          const isHl  = highlight === slot
          const skillId = equipped[slot]
          const learnedSkill = skillId ? learned[skillId] : null
          const emoji  = skillId ? (SKILLS.find(s => s.id === skillId)?.emoji || '') : ''
          return (
            <div key={slot} style={{
              aspectRatio: '1',
              background: isHl ? `${color}33` : '#0d0d15',
              border: `${isHl ? 2 : 0.5}px solid ${isHl ? color : '#2a2a3a'}`,
              borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
              transition: 'border-color 0.12s, background 0.12s',
              boxShadow: isHl ? `0 0 8px ${color}66` : 'none',
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
  // 3x3 grid; each pip shown/hidden based on value
  const pip = (visible) => (
    <div style={{
      width: 6, height: 6, borderRadius: '50%',
      background: visible ? color : 'transparent',
      placeSelf: 'center',
    }} />
  )
  // Pip layout per value (positions in 3x3 grid index 0..8)
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
        <React.Fragment key={i}>{pip(active.has(i))}</React.Fragment>
      ))}
    </div>
  )
}
