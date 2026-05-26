import React, { useState } from 'react'
import { BATTLE_ENEMIES, PLAYER } from '../data/gameData'

const STAMINA_MAX = 100
const STAMINA_COST = 5

export default function Battle() {
  const [stamina, setStamina] = useState(78)
  const [currentArea, setCurrentArea] = useState(1)
  const [selectedEnemy, setSelectedEnemy] = useState(null)
  const [battleState, setBattleState] = useState(null) // null | 'fighting' | 'won' | 'lost'
  const [battleLog, setBattleLog] = useState([])

  const areaEnemies = BATTLE_ENEMIES.filter(e => e.area === currentArea)

  const startBattle = (enemy) => {
    if (stamina < STAMINA_COST) return
    setSelectedEnemy(enemy)
    setBattleState('fighting')
    setBattleLog([])

    setTimeout(() => {
      const playerPower = PLAYER.power + Math.floor(Math.random() * 40)
      const enemyPower  = enemy.power + Math.floor(Math.random() * 30)
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
    }, 1500)
  }

  const resetBattle = () => {
    setSelectedEnemy(null)
    setBattleState(null)
    setBattleLog([])
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#13131f', borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 390 }}>
            <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 20px' }} />

            {/* VS Display */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', marginBottom: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48 }}>{PLAYER.card.emoji}</div>
                <div style={{ color: '#c9a84c', fontSize: 12, fontWeight: 500 }}>{PLAYER.name}</div>
                <div style={{ color: '#888', fontSize: 11 }}>Power: {PLAYER.power}</div>
              </div>
              <div style={{ color: '#e74c3c', fontSize: 24, fontWeight: 700 }}>VS</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48 }}>{selectedEnemy.emoji}</div>
                <div style={{ color: '#e74c3c', fontSize: 12, fontWeight: 500 }}>{selectedEnemy.name}</div>
                <div style={{ color: '#888', fontSize: 11 }}>Power: {selectedEnemy.power}</div>
              </div>
            </div>

            {/* Battle Log */}
            <div style={{ background: '#0d0d15', borderRadius: 12, padding: 14, minHeight: 100, marginBottom: 16 }}>
              {battleState === 'fighting' && battleLog.length === 0 && (
                <div style={{ color: '#888', fontSize: 13, textAlign: 'center', marginTop: 20, animation: 'pulse 1s infinite' }}>Calculating battle...</div>
              )}
              {battleLog.map((line, i) => (
                <div key={i} style={{ color: i === battleLog.length - 1 ? (battleState === 'won' ? '#2ecc71' : '#e74c3c') : '#888', fontSize: 13, marginBottom: 6, lineHeight: 1.4 }}>{line}</div>
              ))}
            </div>

            {/* Result */}
            {battleState === 'won' && (
              <button className="btn btn-primary btn-full" style={{ padding: 14, marginBottom: 10 }} onClick={resetBattle}>
                <i className="ti ti-trophy" /> Collect Rewards
              </button>
            )}
            {battleState === 'lost' && (
              <>
                <button className="btn btn-gold btn-full" style={{ padding: 14, marginBottom: 10 }} onClick={() => startBattle(selectedEnemy)}>
                  <i className="ti ti-refresh" /> Try Again ({STAMINA_COST} Stamina)
                </button>
                <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={resetBattle}>Retreat</button>
              </>
            )}
            {battleState === 'fighting' && <div style={{ height: 44 }} />}
          </div>
        </div>
      )}

    </div>
  )
}
