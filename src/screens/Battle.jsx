import React, { useState } from 'react'
import { TABS, TAB_ORDER, SLOTS_PER_WAVE, generateWave, xpForLevel } from '../data/bossLadder'
import { Avatar } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import { BattleDiceModal } from '../components/BattleDiceModal'
import { useProgress, recordHit, resetProgression, resetTab } from '../state/progressionStore'
import { useVitals, spendStamina, spendHealth, restoreHealthTo } from '../state/vitalsStore'
import { bumpForBoss } from '../state/bountyStore'

const STAMINA_COST = 5
const GOLD = '#c9a84c'
const GREEN = '#2ecc71'
const PURPLE = '#a855f7'

export default function Battle() {
  const prog   = useProgress()
  const vitals = useVitals()
  const stamina = vitals.stamina
  const STAMINA_MAX = vitals.staminaMax
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {bosses.map(boss => {
            const isDead = defeated.includes(boss.slot)
            const hp     = remainingHp(boss)
            const hpPct  = Math.max(0, Math.min(100, Math.round((hp / boss.hp) * 100)))
            const worn   = hp < boss.hp
            return (
              <BossTile
                key={boss.id}
                boss={boss}
                isDead={isDead}
                hp={hp}
                hpPct={hpPct}
                worn={worn}
                canFight={stamina >= STAMINA_COST}
                onTap={() => setDetail(boss)}
                onFight={() => startFight(boss)}
              />
            )
          })}
        </div>

        {/* DEV: reset progress for testing. */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {/* Reset just the current tab (wave 1 / slot 1), keeping level + other tabs. */}
          <button onClick={() => { if (window.confirm(`Reset ${TABS[area].label} back to wave 1? (level + other tabs kept)`)) resetTab(area) }}
            style={{ flex: 1, background: 'transparent', color: '#444', border: '0.5px dashed #2a2a3a', borderRadius: 8, padding: 8, fontSize: 10, letterSpacing: 1, cursor: 'pointer' }}>
            RESET {TABS[area].label.toUpperCase()}
          </button>
          {/* Full wipe: level, XP, all tabs. */}
          <button onClick={() => { if (window.confirm('Reset ALL campaign progress (level, XP, boss HP)?')) resetProgression() }}
            style={{ flex: 1, background: 'transparent', color: '#444', border: '0.5px dashed #2a2a3a', borderRadius: 8, padding: 8, fontSize: 10, letterSpacing: 1, cursor: 'pointer' }}>
            RESET ALL (DEV)
          </button>
        </div>
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
          onWin={() => { bumpForBoss(); restoreHealthTo(0.5) }}   // boss down: bounty up + patch back to half health
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

// Boss tile — styled to match the player Collection cards (vertical card with a
// top accent bar, centered art, name, and ATK/DEF stat boxes) so the PvE roster
// reads as the same kind of "card" as the player's own crew. Layers on the
// boss-specific bits: slot #, BOSS/DEFEATED badge, persistent HP bar (bosses
// never heal), reward line, and the Fight action.
function BossTile({ boss, isDead, hp, hpPct, worn, canFight, onTap, onFight }) {
  const accent = boss.boss ? GOLD : '#3a3a4a'
  return (
    <div onClick={onTap} style={{
      background: boss.boss ? '#1a1510' : '#13131f',
      border: `0.5px solid ${boss.boss ? `${GOLD}44` : '#2a2a3a'}`,
      borderRadius: 16, padding: '22px 12px 12px',
      cursor: 'pointer', position: 'relative', overflow: 'hidden',
      opacity: isDead ? 0.4 : 1, filter: isDead ? 'grayscale(1)' : 'none',
    }}>
      {/* Top accent bar — gold for milestone bosses, like the rarity bar on player cards */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent }} />

      {/* Slot # (top-left), where the PLAYER type label sits on player cards */}
      <div style={{ position: 'absolute', top: 6, left: 8, color: '#888', fontSize: 8, fontWeight: 700, letterSpacing: 1.5 }}>
        #{boss.slot}
      </div>

      {/* Badge (top-right): DEFEATED once cleared, else BOSS for milestones */}
      {isDead ? (
        <div style={{ position: 'absolute', top: 6, right: 8, color: GREEN, fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>DEFEATED</div>
      ) : boss.boss ? (
        <div style={{ position: 'absolute', top: 6, right: 8, background: GOLD, color: '#0a0a0f', fontSize: 8, fontWeight: 700, letterSpacing: 1, borderRadius: 4, padding: '2px 5px' }}>BOSS</div>
      ) : null}

      {/* Art */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 6px' }}>
        <Avatar src={boss.avatar} emoji={boss.emoji} size={56} radius={8} />
      </div>

      {/* Name */}
      <div style={{ color: boss.boss ? GOLD : '#fff', fontSize: 12, fontWeight: 500, textAlign: 'center', marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {boss.name}
      </div>

      {/* Level subtitle (where rarity sits on player cards) */}
      <div style={{ color: '#666', fontSize: 10, textAlign: 'center', marginBottom: 10 }}>Lv {boss.level}</div>

      {/* Combat stats — ATK + DEF, same two-box layout as the player cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div style={{ background: '#1e1e2a', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: 8, letterSpacing: 1, fontWeight: 700 }}>ATK</div>
          <div style={{ color: '#e74c3c', fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{boss.atk}</div>
        </div>
        <div style={{ background: '#1e1e2a', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: 8, letterSpacing: 1, fontWeight: 700 }}>DEF</div>
          <div style={{ color: '#4a9eff', fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{boss.def}</div>
        </div>
      </div>

      {/* Persistent HP bar — how worn down the boss is across visits */}
      {!isDead && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${hpPct}%`, background: hpPct > 50 ? GREEN : hpPct > 20 ? '#f39c12' : '#e74c3c', borderRadius: 2, transition: 'width 0.4s' }} />
          </div>
          <div style={{ color: '#666', fontSize: 9, marginTop: 3, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            HP {hp.toLocaleString()} / {boss.hp.toLocaleString()}{worn ? ' · worn' : ''}
          </div>
        </div>
      )}

      {/* Reward line: XP + card drop for milestone bosses */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8 }}>
        <span style={{ color: GOLD, fontSize: 10, fontWeight: 600 }}>+{boss.xp} XP</span>
        {boss.cardDrop ? <span style={{ color: PURPLE, fontSize: 10 }}><i className="ti ti-cards" style={{ fontSize: 10 }} /> card</span> : null}
      </div>

      {/* Fight action */}
      {!isDead && (
        <button className="btn btn-gold" style={{ width: '100%', marginTop: 10, padding: '8px 0', fontSize: 12 }}
          onClick={(e) => { e.stopPropagation(); onFight() }} disabled={!canFight}>
          Fight
        </button>
      )}
    </div>
  )
}
