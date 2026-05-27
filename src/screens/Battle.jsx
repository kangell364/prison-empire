import React, { useState, useEffect } from 'react'
import { BATTLE_ENEMIES, PLAYER } from '../data/gameData'
import { sfx } from '../sounds'

const STAMINA_MAX = 100
const STAMINA_COST = 5
const BATTLE_RESOLVE_MS = 1500

// Animates a number from 0 → `to` over `duration` ms. Mount with start=true to begin counting.
function CountUp({ to, duration = 900, start = true }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!start || to === 0) { setN(to); return }
    const t0 = Date.now()
    const id = setInterval(() => {
      const pct = Math.min(1, (Date.now() - t0) / duration)
      // Ease-out cubic for a satisfying decel
      const eased = 1 - Math.pow(1 - pct, 3)
      setN(Math.floor(to * eased))
      if (pct >= 1) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [to, duration, start])
  return n
}

export default function Battle() {
  const [stamina, setStamina] = useState(78)
  const [currentArea, setCurrentArea] = useState(1)
  const [selectedEnemy, setSelectedEnemy] = useState(null)
  const [battleState, setBattleState] = useState(null) // null | 'fighting' | 'won' | 'lost'
  const [battleLog, setBattleLog] = useState([])
  const [rolledPower, setRolledPower] = useState({ player: 0, enemy: 0 })

  const areaEnemies = BATTLE_ENEMIES.filter(e => e.area === currentArea)

  const startBattle = (enemy) => {
    if (stamina < STAMINA_COST) return
    setSelectedEnemy(enemy)
    setBattleState('fighting')
    setBattleLog([])

    // Roll powers up-front so we can animate the count-up while "fighting"
    const playerPower = PLAYER.power + Math.floor(Math.random() * 40)
    const enemyPower  = enemy.power + Math.floor(Math.random() * 30)
    setRolledPower({ player: playerPower, enemy: enemyPower })

    sfx.clash()

    setTimeout(() => {
      const won = playerPower > enemyPower

      const log = [
        `You launch your attack on ${enemy.name}!`,
        `Your power: ${playerPower} vs their power: ${enemyPower}`,
        won
          ? `Your crew overwhelms ${enemy.name}!`
          : `${enemy.name} fights back hard!`,
        won
          ? `Victory! +${enemy.reward_xp} XP, +${enemy.reward_hustle} Hustle`
          : `You retreat... regroup and try again.`,
      ]

      setBattleLog(log)
      setBattleState(won ? 'won' : 'lost')
      setStamina(s => Math.max(0, s - STAMINA_COST))
      if (won) sfx.win(); else sfx.lose()
    }, BATTLE_RESOLVE_MS)
  }

  const resetBattle = () => {
    setSelectedEnemy(null)
    setBattleState(null)
    setBattleLog([])
    setRolledPower({ player: 0, enemy: 0 })
  }

  return (
    <div className="scroll-area animate-in">

      {/* Stamina Bar */}
      <div style={{ margin: '14px 16px 0', background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 16, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-bolt" style={{ color: '#f0d080', fontSize: 16 }} />
            <span style={{ color: '#888', fontSize: 12 }}>Stamina</span>
          </div>
          <span style={{ color: '#c9a84c', fontSize: 13, fontWeight: 500 }}>{stamina} / {STAMINA_MAX}</span>
        </div>
        <div style={{ height: 6, background: '#1e1e2a', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round(stamina / STAMINA_MAX * 100)}%`, background: 'linear-gradient(90deg, #c9a84c, #f0d080)', borderRadius: 3, transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ color: '#555', fontSize: 10, marginTop: 6 }}>Refills 1 point every 5 min — Each fight costs {STAMINA_COST}</div>
      </div>

      {/* Area Selector */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8 }}>
        {[1, 2, 3].map(area => (
          <button key={area} onClick={() => setCurrentArea(area)} style={{
            flex: 1, background: area === currentArea ? '#c9a84c18' : '#13131f',
            border: `0.5px solid ${area === currentArea ? '#c9a84c44' : '#2a2a3a'}`,
            borderRadius: 12, padding: '10px 0',
            color: area === currentArea ? '#c9a84c' : '#555',
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>
            {area === 1 ? '🔒 Intake' : area === 2 ? '🏋️ The Yard' : '👨‍🍳 Kitchen'}
          </button>
        ))}
      </div>

      {/* Enemy List */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">
          {currentArea === 1 ? 'Area 1 — The Intake Block' : currentArea === 2 ? 'Area 2 — The Yard' : 'Area 3 — The Kitchen'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {areaEnemies.map(enemy => (
            <div key={enemy.id} className="card card-pad" style={{
              display: 'flex', alignItems: 'center', gap: 14,
              borderColor: enemy.boss ? '#c9a84c44' : '#2a2a3a',
              background: enemy.boss ? '#1a1510' : '#13131f',
            }}>
              <div style={{ fontSize: 36, flexShrink: 0 }}>{enemy.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div style={{ color: enemy.boss ? '#c9a84c' : '#fff', fontSize: 14, fontWeight: 500 }}>{enemy.name}</div>
                  {enemy.boss && <span style={{ background: '#c9a84c', color: '#0a0a0f', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>BOSS</span>}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ color: '#e74c3c', fontSize: 11 }}>Power: {enemy.power}</span>
                  <span style={{ color: '#c9a84c', fontSize: 11 }}>+{enemy.reward_xp} XP</span>
                  <span style={{ color: '#888', fontSize: 11 }}>+{enemy.reward_hustle} Hustle</span>
                </div>
                {enemy.boss_reward_card && (
                  <div style={{ color: '#a855f7', fontSize: 10, marginTop: 2 }}>
                    <i className="ti ti-cards" style={{ fontSize: 10 }} /> Card reward on win
                  </div>
                )}
              </div>
              <button
                className="btn btn-gold"
                style={{ padding: '8px 14px', fontSize: 12 }}
                onClick={() => startBattle(enemy)}
                disabled={stamina < STAMINA_COST}
              >
                Fight
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Battle Modal */}
      {selectedEnemy && (
        <BattleModal
          enemy={selectedEnemy}
          state={battleState}
          rolledPower={rolledPower}
          log={battleLog}
          onRetry={() => startBattle(selectedEnemy)}
          onReset={resetBattle}
        />
      )}

    </div>
  )
}

function BattleModal({ enemy, state, rolledPower, log, onRetry, onReset }) {
  const playerWon  = state === 'won'
  const playerLost = state === 'lost'
  const resolved   = playerWon || playerLost

  // Card-side styling: winner glows gold, loser dims out.
  const playerSideStyle = !resolved ? {} : playerWon
    ? { animation: 'winnerGlow 1.4s ease-in-out infinite', borderRadius: 16 }
    : { animation: 'loserDim 0.6s ease forwards' }
  const enemySideStyle = !resolved ? {} : playerLost
    ? { animation: 'winnerGlow 1.4s ease-in-out infinite', borderRadius: 16 }
    : { animation: 'loserDim 0.6s ease forwards' }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 200,
    }}>
      {/* Flash overlay at resolution moment — pure white wash through the modal */}
      {resolved && (
        <div aria-hidden="true" style={{
          position: 'fixed', inset: 0, pointerEvents: 'none',
          animation: 'flashWhite 0.5s ease-out forwards',
        }} />
      )}

      <div style={{
        background: '#13131f',
        borderRadius: '24px 24px 0 0',
        padding: 24,
        width: '100%',
        maxWidth: 390,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 20px' }} />

        {/* VS Display */}
        <div style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20,
          padding: '8px 4px',
        }}>
          {/* Player card */}
          <div style={{
            textAlign: 'center', padding: 10, flex: 1,
            animation: `battleCardInLeft 0.4s ease forwards${state === 'fighting' ? ', cardClash 0.4s ease-in-out 0.4s infinite' : ''}`,
            ...playerSideStyle,
          }}>
            <div style={{ fontSize: 52, marginBottom: 4 }}>{PLAYER.card.emoji}</div>
            <div style={{ color: '#c9a84c', fontSize: 12, fontWeight: 500 }}>{PLAYER.name}</div>
            <div style={{ color: '#888', fontSize: 11, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              Power: <CountUp to={rolledPower.player} duration={900} start={state !== null} />
            </div>
          </div>

          {/* VS or Stamp center */}
          <div style={{
            position: 'relative',
            width: 60, height: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {state === 'fighting' && (
              <div style={{
                color: '#e74c3c',
                fontSize: 26, fontWeight: 800, letterSpacing: 1,
                animation: 'vsFlash 0.5s ease forwards, vsPulse 0.9s ease-in-out 0.5s infinite',
              }}>VS</div>
            )}
            {resolved && (
              <Stamp result={state} />
            )}
          </div>

          {/* Enemy card */}
          <div style={{
            textAlign: 'center', padding: 10, flex: 1,
            animation: `battleCardInRight 0.4s ease forwards${state === 'fighting' ? ', cardClash 0.4s ease-in-out 0.4s infinite reverse' : ''}`,
            ...enemySideStyle,
          }}>
            <div style={{ fontSize: 52, marginBottom: 4 }}>{enemy.emoji}</div>
            <div style={{ color: '#e74c3c', fontSize: 12, fontWeight: 500 }}>{enemy.name}</div>
            <div style={{ color: '#888', fontSize: 11, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              Power: <CountUp to={rolledPower.enemy} duration={900} start={state !== null} />
            </div>
          </div>

          {/* Reward floaters on win */}
          {playerWon && (
            <>
              <div style={{
                position: 'absolute', left: '25%', bottom: 0,
                color: '#c9a84c', fontSize: 14, fontWeight: 700,
                textShadow: '0 0 8px #c9a84c66',
                animation: 'rewardFloat 1.8s ease-out 0.6s forwards',
                opacity: 0, pointerEvents: 'none',
              }}>+{enemy.reward_xp} XP</div>
              <div style={{
                position: 'absolute', left: '25%', bottom: 0,
                color: '#f0d080', fontSize: 13, fontWeight: 600,
                textShadow: '0 0 6px #c9a84c44',
                animation: 'rewardFloat 1.8s ease-out 0.95s forwards',
                opacity: 0, pointerEvents: 'none',
              }}>+{enemy.reward_hustle} Hustle</div>
            </>
          )}
        </div>

        {/* Battle Log */}
        <div style={{
          background: '#0d0d15',
          borderRadius: 12, padding: 14,
          minHeight: 100, marginBottom: 16,
        }}>
          {state === 'fighting' && log.length === 0 && (
            <div style={{
              color: '#888', fontSize: 13, textAlign: 'center', marginTop: 20,
              animation: 'pulse 1s infinite',
            }}>Calculating battle...</div>
          )}
          {log.map((line, i) => (
            <div key={i} style={{
              color: i === log.length - 1
                ? (playerWon ? '#2ecc71' : '#e74c3c')
                : '#888',
              fontSize: 13, marginBottom: 6, lineHeight: 1.4,
              opacity: 0,
              animation: `logLineIn 0.35s ease forwards`,
              animationDelay: `${i * 0.15}s`,
            }}>{line}</div>
          ))}
        </div>

        {/* Action buttons */}
        {playerWon && (
          <button className="btn btn-primary btn-full"
            style={{ padding: 14, marginBottom: 10, opacity: 0, animation: 'logLineIn 0.4s ease 0.7s forwards' }}
            onClick={onReset}>
            <i className="ti ti-trophy" /> Collect Rewards
          </button>
        )}
        {playerLost && (
          <div style={{ opacity: 0, animation: 'logLineIn 0.4s ease 0.7s forwards' }}>
            <button className="btn btn-gold btn-full" style={{ padding: 14, marginBottom: 10 }} onClick={onRetry}>
              <i className="ti ti-refresh" /> Try Again ({STAMINA_COST} Stamina)
            </button>
            <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={onReset}>Retreat</button>
          </div>
        )}
        {state === 'fighting' && <div style={{ height: 44 }} />}
      </div>
    </div>
  )
}

function Stamp({ result }) {
  const isWin = result === 'won'
  const text  = isWin ? 'WIN' : 'LOST'
  const color = isWin ? '#c9a84c' : '#e74c3c'
  // Outer wrapper handles static centering; inner element runs the keyframe
  // animation (separate transforms so they don't clobber each other).
  return (
    <div
      aria-label={isWin ? 'Victory' : 'Defeat'}
      style={{
        position: 'absolute',
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 5,
        pointerEvents: 'none',
      }}>
      <div style={{
        color,
        fontSize: 30,
        fontWeight: 900,
        letterSpacing: 4,
        textShadow: `0 0 14px ${color}99, 0 0 28px ${color}55`,
        padding: '6px 18px',
        border: `2.5px solid ${color}`,
        borderRadius: 6,
        background: 'rgba(0,0,0,0.55)',
        whiteSpace: 'nowrap',
        animation: 'stampIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      }}>{text}</div>
    </div>
  )
}
