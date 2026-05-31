import React, { useState } from 'react'
import { TABS, TAB_ORDER, SLOTS_PER_WAVE, generateWave, xpForLevel } from '../data/bossLadder'
import { Avatar } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import { BattleDiceModal } from '../components/BattleDiceModal'
import { useProgress, recordHit, resetProgression } from '../state/progressionStore'
import { useVitals, spendStamina, spendHealth, STAMINA_MAX } from '../state/vitalsStore'

const STAMINA_COST = 5
const GOLD = '#c9a84c'
const GREEN = '#2ecc71'
const PURPLE = '#a855f7'

export default function Battle() {
  const prog   = useProgress()
  const stamina = useVitals().stamina
  const [area, setArea] = useState('guards')
  const [selected, setSelected] = useState(null)  // boss in dice fight
  const [detail, setDetail]     = useState(null)  // boss in detail card

  const wave      = prog.waves[area] || 1
  const bosses    = generateWave(area, wave)
  const defeated  = prog.defeated[area] || []
  const clearedCt = defeated.length

  // XP toward the next player level (sum of all 30 bosses at the current level).
  const xpNeed = xpForLevel(prog.level)
  const xpPct  = Math.min(100, Math.round((prog.xp / xpNeed) * 100))

  const remainingHp = (boss) => prog.bossHp[boss.id] ?? boss.hp
  const startFight  = (boss) => { if (stamina >= STAMINA_COST) setSelected(boss) }

  return (
    <div className="scroll-area animate-in">
      {/* Player level + XP toward next level */}
      <div style={{ margin: '14px 16px 0', background: 'linear-gradient(135deg, #15110a 0%, #13131f 100%)', border: `1px solid ${GOLD}44`, borderRadius: 16, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>Level {prog.level}</span>
          <span style={{ color: '#888', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{prog.xp.toLocaleString()} / {xpNeed.toLocaleString()} XP</span>
        </div>
        <div style={{ height: 6, background: '#1e1e2a', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
          <div style={{ height: '100%', width: `${xpPct}%`, background: `linear-gradient(90deg, ${GOLD}, #f0d080)`, borderRadius: 3, transition: 'width 0.5s' }} />
        </div>
        <div style={{ color: '#555', fontSize: 10, marginTop: 6 }}>Clear all 30 bosses (Guards + Yard + Kitchen) at your level to rank up.</div>
      </div>

      {/* Stamina */}
      <div style={{ margin: '12px 16px 0', background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 16, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ color: '#888', fontSize: 12 }}><i className="ti ti-bolt" style={{ color: '#f0d080', fontSize: 14, marginRight: 5 }} />Stamina</span>
          <span style={{ color: GOLD, fontSize: 12, fontWeight: 600 }}>{stamina} / {STAMINA_MAX}</span>
        </div>
        <div style={{ height: 5, background: '#1e1e2a', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round(stamina / STAMINA_MAX * 100)}%`, background: `linear-gradient(90deg, ${GOLD}, #f0d080)`, borderRadius: 3, transition: 'width 0.5s' }} />
        </div>
        <div style={{ color: '#555', fontSize: 10, marginTop: 6 }}>Each roll costs {STAMINA_COST}. Bosses never heal — chip them down across visits.</div>
      </div>

      {/* Area selector */}
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 8 }}>
        {TAB_ORDER.map(key => (
          <button key={key} onClick={() => setArea(key)} style={{
            flex: 1, background: key === area ? `${GOLD}18` : '#13131f',
            border: `0.5px solid ${key === area ? `${GOLD}44` : '#2a2a3a'}`,
            borderRadius: 12, padding: '10px 0', color: key === area ? GOLD : '#555',
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>
            <i className={`ti ${TABS[key].icon}`} style={{ fontSize: 13, marginRight: 4 }} />
            {TABS[key].label}
          </button>
        ))}
      </div>

      {/* Wave header */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{TABS[area].label} — Wave {wave} · Lv {wave}</span>
          <span style={{ color: clearedCt === SLOTS_PER_WAVE ? GREEN : '#888' }}>{clearedCt}/{SLOTS_PER_WAVE} cleared</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bosses.map(boss => {
            const isDead = defeated.includes(boss.slot)
            const hp     = remainingHp(boss)
            const hpPct  = Math.max(0, Math.min(100, Math.round((hp / boss.hp) * 100)))
            const worn   = hp < boss.hp
            return (
              <div key={boss.id} onClick={() => setDetail(boss)} className="card card-pad" style={{
                display: 'flex', alignItems: 'center', gap: 14,
                borderColor: boss.boss ? `${GOLD}44` : '#2a2a3a',
                background: boss.boss ? '#1a1510' : '#13131f',
                opacity: isDead ? 0.4 : 1, filter: isDead ? 'grayscale(1)' : 'none',
                cursor: 'pointer',
              }}>
                <div style={{ position: 'relative' }}>
                  <Avatar src={boss.avatar} emoji={boss.emoji} size={44} radius={10} />
                  <span style={{ position: 'absolute', top: -6, left: -6, background: '#0d0d15', border: '0.5px solid #2a2a3a', color: '#888', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 5 }}>#{boss.slot}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ color: boss.boss ? GOLD : '#fff', fontSize: 14, fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{boss.name}</div>
                    {boss.boss && !isDead && <span style={{ background: GOLD, color: '#0a0a0f', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>BOSS</span>}
                    {isDead && <span style={{ color: GREEN, fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>DEFEATED</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ color: '#e74c3c', fontSize: 11 }}>ATK {boss.atk}</span>
                    <span style={{ color: '#4a9eff', fontSize: 11 }}>DEF {boss.def}</span>
                    <span style={{ color: GOLD, fontSize: 11 }}>+{boss.xp} XP</span>
                  </div>
                  {!isDead && (
                    <div style={{ marginTop: 5 }}>
                      <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${hpPct}%`, background: hpPct > 50 ? GREEN : hpPct > 20 ? '#f39c12' : '#e74c3c', borderRadius: 2, transition: 'width 0.4s' }} />
                      </div>
                      <div style={{ color: '#666', fontSize: 9, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        HP {hp.toLocaleString()} / {boss.hp.toLocaleString()}{worn ? '  · worn down' : ''}
                        {boss.cardDrop ? <span style={{ color: PURPLE, marginLeft: 6 }}><i className="ti ti-cards" style={{ fontSize: 9 }} /> card</span> : null}
                      </div>
                    </div>
                  )}
                </div>
                {!isDead && (
                  <button className="btn btn-gold" style={{ padding: '8px 14px', fontSize: 12 }}
                    onClick={(e) => { e.stopPropagation(); startFight(boss) }} disabled={stamina < STAMINA_COST}>
                    Fight
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* DEV: reset campaign progress for testing. */}
        <button onClick={() => { if (window.confirm('Reset ALL campaign progress (level, XP, boss HP)?')) resetProgression() }}
          style={{ marginTop: 16, width: '100%', background: 'transparent', color: '#444', border: '0.5px dashed #2a2a3a', borderRadius: 8, padding: 8, fontSize: 10, letterSpacing: 1, cursor: 'pointer' }}>
          RESET CAMPAIGN (DEV)
        </button>
      </div>

      {/* Attrition battle */}
      {selected && (
        <BattleDiceModal
          mode="attrition"
          opponent={selected}
          oppStartHp={remainingHp(selected)}
          cost={STAMINA_COST}
          rewards={{ xp: selected.xp, hustle: selected.hustle, cardDrop: selected.cardDrop }}
          onRoll={() => spendStamina(STAMINA_COST)}
          onHit={({ dealtToOpp, dealtToPlayer }) => { recordHit(selected, dealtToOpp); spendHealth(dealtToPlayer) }}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Boss detail preview */}
      {detail && (
        <CharacterDetailModal
          character={detail}
          onClose={() => setDetail(null)}
          actions={stamina >= STAMINA_COST ? [
            { label: `FIGHT — ${STAMINA_COST} STAMINA`, icon: 'ti-sword', onClick: () => { startFight(detail); setDetail(null) } },
          ] : [
            { label: 'NOT ENOUGH STAMINA', icon: 'ti-bolt-off', onClick: () => {}, kind: 'secondary' },
          ]}
        />
      )}
    </div>
  )
}
