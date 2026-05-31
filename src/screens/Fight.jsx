import React, { useState, useMemo } from 'react'
import { PLAYER, PVP_LEVEL_RANGE, PVP_FIGHT_COST } from '../data/gameData'
import { generateOpponents, generateOpponent, opponentFromId } from '../data/pvpLadder'
import { Avatar } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import { PvpBattleModal, XP_WIN, XP_LOSE, RECLAIM_MULT } from '../components/PvpBattleModal'
import { useVitals } from '../state/vitalsStore'
import { usePlayerCard } from '../state/profileStore'
import { useBounty } from '../state/bountyStore'
import { useProgress } from '../state/progressionStore'
import { usePlayerCombat } from '../state/statsStore'
import { useFightLog } from '../state/fightLogStore'
import { useHitList } from '../state/hitListStore'
import { BountyModal, formatHustle } from '../components/BountyModal'
import Battle from './Battle'

// Ratio damage model — mirrors BattleDiceModal, used to preview matchups.
const dmg = (a, d) => Math.max(1, Math.round((a * a) / (a + d)))

const GOLD   = '#c9a84c'
const BLUE   = '#4a9eff'
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
        <SubTab active={tab === 'hitlist'} onClick={() => setTab('hitlist')}>
          <i className="ti ti-crosshair" style={{ marginRight: 5, fontSize: 13 }} />
          Hit List
        </SubTab>
      </div>

      {tab === 'players' ? <PlayersScreen /> : tab === 'bosses' ? <Battle /> : <HitListScreen />}
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
  const prog = useProgress()
  const fightLog = useFightLog()
  const playerLevel = prog.level
  const vitals = useVitals()
  const stamina = vitals.stamina
  const STAMINA_MAX = vitals.staminaMax
  const [target, setTarget]         = useState(null)
  const [detailPlayer, setDetailPlayer] = useState(null)
  const [bountyTarget, setBountyTarget] = useState(null)

  // Revenge targets (rivals who KO'd you) — regenerated from their stable ids so
  // they're always fightable and pinned to the top, even if they've since
  // dropped below your level and wouldn't otherwise appear.
  const revengeTargets = useMemo(() => (
    Object.keys(fightLog.revenge).map(id => {
      const m = /^ai-(\d+)-(\d+)$/.exec(id)
      return m ? generateOpponent(Number(m[1]), Number(m[2])) : null
    }).filter(Boolean)
  ), [fightLog.revenge])

  const targets = useMemo(() => {
    const base = generateOpponents(playerLevel)
    const ids = new Set(revengeTargets.map(t => t.id))
    return [...revengeTargets, ...base.filter(t => !ids.has(t.id))]
  }, [playerLevel, revengeTargets])

  const onFightOpened = (opp) => {
    if (stamina < PVP_FIGHT_COST) return
    setTarget(opp)
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
                Pick your fights — rivals from your level up to +{PVP_LEVEL_RANGE} above.
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
          <div style={{ color: BLUE, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>HOW IT WORKS</div>
          Every roll is one attack. <span style={{ color: '#fff' }}>Whoever deals more damage wins the turn.</span>{' '}
          Win a turn <span style={{ color: GREEN }}>+{XP_WIN} XP</span>, lose it <span style={{ color: RED }}>−{XP_LOSE} XP</span>.{' '}
          So pick someone you out-hit — fighting up bleeds XP.
        </div>
      </div>

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
                rivalXp={prog.rivalXp[opp.id] || 0}
                revenge={!!fightLog.revenge[opp.id]}
                disabled={stamina < PVP_FIGHT_COST}
                onFight={() => onFightOpened(opp)}
                onHitList={() => setBountyTarget(opp)}
                onShowDetail={() => setDetailPlayer(opp)}
              />
            ))}
          </div>
        )}
      </div>

      {/* PvP fight — per-turn XP, revenge, reclaim */}
      {target && (
        <PvpBattleModal
          opponent={target}
          onKO={() => setDailyKills(k => k + 1)}
          onClose={() => setTarget(null)}
        />
      )}

      {/* Player detail preview */}
      {detailPlayer && (
        <CharacterDetailModal
          character={detailPlayer}
          onClose={() => setDetailPlayer(null)}
          actions={[
            ...(stamina >= PVP_FIGHT_COST
              ? [{ label: `FIGHT — ${PVP_FIGHT_COST} STAMINA`, icon: 'ti-sword', onClick: () => onFightOpened(detailPlayer) }]
              : [{ label: 'NOT ENOUGH STAMINA', icon: 'ti-bolt-off', onClick: () => {}, kind: 'secondary' }]),
            { label: 'PUT ON HIT LIST', icon: 'ti-crosshair', kind: 'secondary', onClick: () => { setBountyTarget(detailPlayer); setDetailPlayer(null) } },
          ]}
        />
      )}

      {/* Place / add a Hustle bounty */}
      {bountyTarget && <BountyModal opponent={bountyTarget} onClose={() => setBountyTarget(null)} />}
    </div>
  )
}

function TargetCard({ opp, rivalXp = 0, revenge = false, disabled, onFight, onHitList, onShowDetail }) {
  const me = usePlayerCombat()
  // Preview the matchup: do you out-hit them per turn? (same model as the fight)
  const youDealt = dmg(me.atk, opp.def)
  const oppDealt = dmg(opp.atk, me.def)
  const favorable = youDealt > oppDealt
  const even = youDealt === oppDealt
  const tag = even ? { c: GOLD, t: 'COIN FLIP' } : favorable ? { c: GREEN, t: `FAVORABLE +${XP_WIN}/turn` } : { c: RED, t: `TOUGH −${XP_LOSE}/turn` }

  return (
    <div className="card card-pad"
      onClick={onShowDetail}
      style={{
        padding: 14, display: 'flex', alignItems: 'center', gap: 12,
        borderColor: revenge ? `${RED}88` : '#2a2a3a',
        background: revenge ? '#1a1012' : undefined,
        cursor: 'pointer',
      }}>
      <Avatar src={opp.avatar} emoji={opp.emoji} size={52} radius={12}
        style={{ background: '#1e1e2a' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{opp.name}</span>
          {revenge && <span style={{ background: RED, color: '#fff', fontSize: 8, fontWeight: 800, letterSpacing: 0.5, padding: '2px 5px', borderRadius: 4 }}>REVENGE</span>}
        </div>
        <div style={{ color: '#888', fontSize: 11, marginTop: 1 }}>
          Lv {opp.level} · ATK {opp.atk} · DEF {opp.def}
        </div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            background: `${tag.c}18`,
            border: `0.5px solid ${tag.c}66`,
            color: tag.c,
            fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            padding: '2px 6px',
            borderRadius: 6,
          }}>
            {tag.t}
          </span>
          <span style={{ color: DIM, fontSize: 10 }}>
            you {youDealt} vs {oppDealt}
          </span>
          {rivalXp > 0 && (
            <span style={{
              background: `${GOLD}18`, border: `0.5px solid ${GOLD}66`, color: GOLD,
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
            }} title={`Took ${rivalXp} XP off you — KO them to reclaim ${rivalXp * RECLAIM_MULT}`}>
              <i className="ti ti-target" style={{ fontSize: 10, marginRight: 2 }} />KO bounty +{rivalXp * RECLAIM_MULT} XP
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onFight() }}
          disabled={disabled}
          style={{
            background: disabled ? '#1e1e2a' : GOLD,
            color: disabled ? '#555' : '#0a0a0f',
            border: 'none', borderRadius: 8,
            padding: '9px 14px',
            fontSize: 12, fontWeight: 700, letterSpacing: 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <i className="ti ti-sword" style={{ fontSize: 13 }} />
          FIGHT
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onHitList && onHitList() }}
          title="Put a Hustle bounty on this player"
          style={{
            background: 'transparent', color: '#888',
            border: '0.5px solid #2a2a3a', borderRadius: 8,
            padding: '7px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <i className="ti ti-crosshair" style={{ fontSize: 12 }} />
          HIT LIST
        </button>
      </div>
    </div>
  )
}

// =====================================================================
// Hit List — bountied targets (paid in Hustle)
// =====================================================================

function HitListScreen() {
  const list = useHitList()
  const vitals = useVitals()
  const stamina = vitals.stamina
  const me = usePlayerCard()
  const prog = useProgress()
  const [bountyTarget, setBountyTarget] = useState(null)
  const [moveTarget, setMoveTarget] = useState(null)   // { opp, bounty }
  const targets = Object.values(list.targets).sort((a, b) => b.bounty - a.bounty)
  // The LIVE price on your head — grows when you KO rivals / clear bosses, and a
  // rival collects (resets) it when you get knocked out.
  const youBounty = useBounty()

  const moveOn = (t) => {
    if (stamina < PVP_FIGHT_COST) return
    const opp = opponentFromId(t.id)
    if (opp) setMoveTarget({ opp, bounty: t.bounty })
  }
  const total = targets.reduce((s, t) => s + t.bounty, 0)

  return (
    <div className="scroll-area animate-in">
      <div style={{ margin: '14px 16px 0', background: 'linear-gradient(135deg, #1a1012 0%, #13131f 100%)', border: `1px solid ${RED}44`, borderRadius: 16, padding: 14 }}>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>
          <i className="ti ti-crosshair" style={{ color: RED, marginRight: 6 }} />Hit List
        </div>
        <div style={{ color: '#888', fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>
          Put a Hustle bounty on a rival. Anyone can stack more on the pot — and move on the target to collect it.
        </div>
        {targets.length > 0 && (
          <div style={{ color: GOLD, fontSize: 12, marginTop: 8, fontWeight: 700 }}>
            <i className="ti ti-coin" style={{ fontSize: 12, marginRight: 4 }} />{formatHustle(total)} Hustle on {targets.length} target{targets.length === 1 ? '' : 's'}
          </div>
        )}
      </div>

      <div className="section" style={{ marginTop: 14 }}>
        {/* Your own player — pinned on top while there's a price on your head.
            When a rival collects it (KOs you), the bounty clears and this row
            drops off until you build a new one by being notorious again. */}
        {youBounty > 0 && (
        <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, borderColor: `${GOLD}66`, background: 'linear-gradient(135deg, #15110a, #13131f)', marginBottom: 10 }}>
          <Avatar src={me.avatar} emoji={me.emoji} size={48} radius={12} ko={vitals.ko} style={{ background: '#1e1e2a' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{me.name}</span>
              <span style={{ background: GOLD, color: '#0a0a0f', fontSize: 8, fontWeight: 800, letterSpacing: 0.5, padding: '2px 5px', borderRadius: 4, flexShrink: 0 }}>YOU</span>
            </div>
            <div style={{ color: '#888', fontSize: 11, marginTop: 1 }}>Lv {prog.level} · price on your head</div>
            <div style={{ color: GOLD, fontSize: 13, fontWeight: 700, marginTop: 3 }}>
              <i className="ti ti-coin" style={{ fontSize: 12, marginRight: 3 }} />{formatHustle(youBounty)} bounty
            </div>
          </div>
          <div style={{ color: DIM, fontSize: 9, textAlign: 'right', flexShrink: 0, maxWidth: 80, lineHeight: 1.4 }}>Rivals can collect this</div>
        </div>
        )}

        {targets.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: 'center', color: DIM, fontSize: 12, lineHeight: 1.6, padding: 24 }}>
            <i className="ti ti-crosshair" style={{ fontSize: 30, color: '#2a2a3a', display: 'block', marginBottom: 8 }} />
            No bounties yet. Tap <b style={{ color: '#888' }}>HIT LIST</b> on any player to put a price on their head.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {targets.map(t => (
              <div key={t.id} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, borderColor: `${RED}33` }}>
                <Avatar src={t.avatar} emoji={t.emoji} size={48} radius={12} style={{ background: '#1e1e2a' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{t.name}</div>
                  <div style={{ color: '#888', fontSize: 11, marginTop: 1 }}>Lv {t.level}</div>
                  <div style={{ color: GOLD, fontSize: 13, fontWeight: 700, marginTop: 3 }}>
                    <i className="ti ti-coin" style={{ fontSize: 12, marginRight: 3 }} />{formatHustle(t.bounty)} bounty
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setBountyTarget(t)} style={{ background: '#13131f', color: GOLD, border: `0.5px solid ${GOLD}55`, borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer' }}>
                    <i className="ti ti-plus" style={{ fontSize: 12, marginRight: 3 }} />ADD BOUNTY
                  </button>
                  <button onClick={() => moveOn(t)} disabled={stamina < PVP_FIGHT_COST} title="KO the target to claim the bounty"
                    style={{ background: stamina < PVP_FIGHT_COST ? '#1e1e2a' : RED, color: stamina < PVP_FIGHT_COST ? '#555' : '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 0.5, cursor: stamina < PVP_FIGHT_COST ? 'not-allowed' : 'pointer' }}>
                    <i className="ti ti-target-arrow" style={{ fontSize: 12, marginRight: 3 }} />MOVE ON TARGET
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {bountyTarget && <BountyModal opponent={bountyTarget} onClose={() => setBountyTarget(null)} />}
      {moveTarget && (
        <PvpBattleModal opponent={moveTarget.opp} bounty={moveTarget.bounty} onClose={() => setMoveTarget(null)} />
      )}
    </div>
  )
}

