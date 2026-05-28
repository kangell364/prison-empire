import React, { useState, useMemo } from 'react'
import { PLAYER, RANKED_PLAYERS, PVP_LEVEL_RANGE, PVP_FIGHT_COST, pvpRewardMultiplier } from '../data/gameData'
import { Avatar } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import { BattleDiceModal } from '../components/BattleDiceModal'
import { useVitals, spendStamina, STAMINA_MAX } from '../state/vitalsStore'
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
  const stamina = useVitals().stamina
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
    spendStamina(PVP_FIGHT_COST)
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
              <span style={{ color: GOLD, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{stamina} / {STAMINA_MAX}</span>
            </div>
            <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(stamina / STAMINA_MAX * 100)}%`, background: `linear-gradient(90deg, ${GOLD}, #f0d080)`, borderRadius: 2, transition: 'width 0.4s' }} />
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
      {target && (() => {
        const mult = pvpRewardMultiplier(PLAYER.level, target.level)
        return (
          <BattleDiceModal
            opponent={target}
            cost={PVP_FIGHT_COST}
            rewards={{
              xp:          50 * mult,
              hustle:      100 * mult,
              skillTokens: mult,
              multText:    `${mult}× REWARD`,
            }}
            onClose={() => setTarget(null)}
            onRoll={onDiceRoll}
            onWin={onWin}
          />
        )
      })()}

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

