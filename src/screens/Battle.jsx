import React, { useState } from 'react'
import { BATTLE_ENEMIES } from '../data/gameData'
import { Avatar } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import { BattleDiceModal } from '../components/BattleDiceModal'
import { useVitals, spendStamina, spendHealth, STAMINA_MAX } from '../state/vitalsStore'

const STAMINA_COST = 5

export default function Battle() {
  const stamina = useVitals().stamina
  const [currentArea, setCurrentArea]   = useState(1)
  const [selectedEnemy, setSelectedEnemy] = useState(null)  // enemy in dice fight
  const [detailEnemy, setDetailEnemy]   = useState(null)    // enemy in detail card

  const areaEnemies = BATTLE_ENEMIES.filter(e => e.area === currentArea)

  const startBattle = (enemy) => {
    if (stamina < STAMINA_COST) return
    setSelectedEnemy(enemy)
  }

  const onWin = () => {
    // Stamina cost is deducted in onRoll; victory side-effects (e.g. card
    // drop for bosses, XP, hustle) would persist here once Supabase lands.
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
            <div key={enemy.id}
              onClick={() => setDetailEnemy(enemy)}
              className="card card-pad" style={{
                display: 'flex', alignItems: 'center', gap: 14,
                borderColor: enemy.boss ? '#c9a84c44' : '#2a2a3a',
                background: enemy.boss ? '#1a1510' : '#13131f',
                cursor: 'pointer',
              }}>
              <Avatar src={enemy.avatar} emoji={enemy.emoji} size={44} radius={10} />
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
                onClick={(e) => { e.stopPropagation(); startBattle(enemy) }}
                disabled={stamina < STAMINA_COST}
              >
                Fight
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Battle Dice — same view as PvP. Bosses use static reward values. */}
      {selectedEnemy && (
        <BattleDiceModal
          opponent={selectedEnemy}
          cost={STAMINA_COST}
          rewards={{
            xp:          selectedEnemy.reward_xp,
            hustle:      selectedEnemy.reward_hustle,
            skillTokens: 1,
            cardDrop:    !!selectedEnemy.boss_reward_card,
          }}
          onClose={() => setSelectedEnemy(null)}
          onRoll={() => spendStamina(STAMINA_COST)}
          onWin={onWin}
          onResult={(r) => spendHealth(r.damageTaken)}
        />
      )}

      {/* Enemy detail preview */}
      {detailEnemy && (
        <CharacterDetailModal
          character={detailEnemy}
          onClose={() => setDetailEnemy(null)}
          actions={stamina >= STAMINA_COST ? [
            { label: `FIGHT — ${STAMINA_COST} STAMINA`, icon: 'ti-sword', onClick: () => startBattle(detailEnemy) },
          ] : [
            { label: 'NOT ENOUGH STAMINA', icon: 'ti-bolt-off', onClick: () => {}, kind: 'secondary' },
          ]}
        />
      )}

    </div>
  )
}
