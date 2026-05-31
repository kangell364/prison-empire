import React, { useState, useMemo } from 'react'
import { PLAYER, PLAYER_LOOKS, CARDS_COLLECTION, TRAITS, RARITY_COLORS, SKILLS } from '../data/gameData'
import { sfx } from '../sounds'
import { useHustle, usePlayerLook, useDisplayName } from '../state/profileStore'
import { useVitals } from '../state/vitalsStore'
import { KoOverlay, KO_FILTER } from '../components/Avatar'
import { useCrew, atkOf, defOf } from '../state/crewStore'
import { useUpgrades, flatAtLevel } from '../state/upgradesStore'
import { useProgress } from '../state/progressionStore'
import { useTraits, useAvailablePoints, usePlayerStats, allocate } from '../state/statsStore'
import { xpForLevel } from '../data/bossLadder'

const GOLD  = '#c9a84c'
const RED   = '#e74c3c'
const BLUE  = '#4a9eff'
const GREEN = '#2ecc71'
const DIM   = '#555'

export default function Profile({ onBack }) {
  const [tab, setTab] = useState('upgrades')
  // Traits + points are now the PERSISTED single source of truth (statsStore):
  // upgrading spends a real point, bumps the trait, updates live combat/pool
  // stats everywhere, and survives a refresh.
  const traits = useTraits()
  const points = useAvailablePoints()

  const upgrade = (traitId) => {
    if (allocate(traitId, 1) > 0) sfx.buy()
    else sfx.deny()
  }

  return (
    <div className="scroll-area animate-in">
      <StatusBar onBack={onBack} />

      {/* Sub-tabs */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <SubTab active={tab === 'upgrades'}  onClick={() => setTab('upgrades')}>Upgrades</SubTab>
        <SubTab active={tab === 'training'}  onClick={() => setTab('training')}>Training</SubTab>
        <SubTab active={tab === 'skills'}    onClick={() => setTab('skills')}>Skills</SubTab>
        <SubTab active={tab === 'equipment'} onClick={() => setTab('equipment')}>Equipment</SubTab>
      </div>

      {tab === 'upgrades'  && <UpgradesTab traits={traits} points={points} onUpgrade={upgrade} />}
      {tab === 'training'  && <TrainingTab />}
      {tab === 'skills'    && <PlaceholderTab title="Skills Loadout"
        body="Equip learned skills into Battle Dice slots 2–12. When a roll lands on an occupied slot the skill fires for the round. Fixed slots for v1; drag-to-assign UI coming next." />}
      {tab === 'equipment' && <PlaceholderTab title="Equipment"
        body="Shanks, body armor, contraband phones — slots that stack on top of your base traits. Coming with the Supabase pass." />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Status bar (top of profile)
// ---------------------------------------------------------------------

function StatusBar({ onBack }) {
  const hustle = useHustle()
  const vitals = useVitals()
  const stats = usePlayerStats()   // live ATK/DEF + pool maxes from real traits
  // Live cosmetic look + name — synced with the home screen (SWAP / rename).
  const lookId = usePlayerLook()
  const look = PLAYER_LOOKS.find(l => l.id === lookId) || PLAYER_LOOKS[0]
  const name = useDisplayName()
  const prog = useProgress()
  const xpNeed = xpForLevel(prog.level)
  const xpPct = Math.round((prog.xp / xpNeed) * 100)
  const cardColor = RARITY_COLORS[look.rarity] || GOLD
  // Crew combat bonus — the player's 12-card roster totals (with upgrades), the
  // muscle they roll with. Shown as a "Bonus" on top of the player's own ATK/DEF.
  const crew = useCrew()
  const flat = flatAtLevel(useUpgrades(), 1)
  const cardById = new Map(CARDS_COLLECTION.map(c => [c.id, c]))
  const crewCards = [crew.leader, ...crew.members].map(id => id != null ? cardById.get(id) : null).filter(Boolean)
  const crewAtk = crewCards.reduce((s, c) => s + atkOf(c, flat), 0)
  const crewDef = crewCards.reduce((s, c) => s + defOf(c, flat), 0)

  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div style={{
        background: 'linear-gradient(135deg, #15110a 0%, #13131f 70%)',
        border: `1px solid ${cardColor}44`,
        borderRadius: 18,
        overflow: 'hidden',
      }}>
        {/* Large hero portrait — the player's current look, big like the card
            detail view, with name/identity overlaid and an X to go home. */}
        <div style={{ position: 'relative', width: '100%', height: 280, overflow: 'hidden' }}>
          {look.avatar ? (
            <img src={look.avatar} alt={name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block', filter: vitals.ko ? KO_FILTER : 'none' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 140, background: 'radial-gradient(circle at center, #1a1a2e 0%, #0a0a0f 100%)', filter: vitals.ko ? KO_FILTER : 'none' }}>{look.emoji}</div>
          )}
          {vitals.ko && <KoOverlay fontSize={34} />}
          {/* Top accent stripe */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: cardColor }} />
          {/* Bottom gradient so text reads on any art */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 130, background: 'linear-gradient(180deg, transparent 0%, rgba(10,10,15,0.55) 50%, #13131f 100%)', pointerEvents: 'none' }} />
          {/* X — back to home (same spot as the card modal's close) */}
          <button
            onClick={() => { sfx.tap?.(); onBack && onBack() }}
            aria-label="Close"
            style={{
              position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(10,10,15,0.7)', border: '0.5px solid rgba(255,255,255,0.15)',
              color: '#fff', fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          ><i className="ti ti-x" /></button>
          {/* Identity overlaid bottom-left */}
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 12 }}>
            <div style={{ color: cardColor, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>Lv {prog.level}</div>
            <div style={{ color: '#fff', fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{name}</div>
            <div style={{ color: '#aaa', fontSize: 12, marginTop: 2 }}>{PLAYER.facility} — {PLAYER.state}</div>
          </div>
        </div>

        <div style={{ padding: 14 }}>
          {/* XP bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ color: '#555', fontSize: 9 }}>XP to Lv {prog.level + 1}</span>
              <span style={{ color: '#888', fontSize: 9 }}>
                {prog.xp.toLocaleString()} / {xpNeed.toLocaleString()}
              </span>
            </div>
            <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${xpPct}%`,
                background: `linear-gradient(90deg, ${GOLD}, #f0d080)`,
                borderRadius: 2,
              }} />
            </div>
          </div>

          {/* Combat stats — the player's own ATK/DEF, derived from Power (same
              formula the cards use). Distinct from the Crew ATK/DEF totals. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ background: '#1e1e2a', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ color: RED, fontSize: 16, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{stats.atk.toLocaleString()}</div>
              <div style={{ color: '#888', fontSize: 9, fontWeight: 500, letterSpacing: 0.5, marginTop: 4, textTransform: 'uppercase' }}>Attack</div>
            </div>
            <div style={{ background: '#1e1e2a', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ color: BLUE, fontSize: 16, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{stats.def.toLocaleString()}</div>
              <div style={{ color: '#888', fontSize: 9, fontWeight: 500, letterSpacing: 0.5, marginTop: 4, textTransform: 'uppercase' }}>Defense</div>
            </div>
          </div>

          {/* Crew bonus — the roster's combined ATK/DEF stacked on top. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12, fontSize: 11, color: '#888' }}>
            <span style={{ color: '#666', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Bonus</span>
            <span><span style={{ color: RED, fontWeight: 700 }}>+{crewAtk.toLocaleString()}</span> Crew ATK</span>
            <span><span style={{ color: BLUE, fontWeight: 700 }}>+{crewDef.toLocaleString()}</span> Crew DEF</span>
          </div>

        {/* Pool bars. All three are now trait-driven (Toughness→Health,
            Hustle→Stamina, Smarts→Knowledge). Health + stamina are the live
            regenerating pools (max from vitals); knowledge shows its capacity. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          <PoolBar icon="ti-heart"  color={RED}  label="Health"    cur={vitals.health}        max={vitals.healthMax} />
          <PoolBar icon="ti-bolt"   color={GOLD} label="Stamina"   cur={vitals.stamina}       max={vitals.staminaMax} />
          <PoolBar icon="ti-brain"  color={BLUE} label="Knowledge" cur={stats.knowledgeMax}   max={stats.knowledgeMax} />
        </div>

        {/* Currency */}
        <div style={{
          marginTop: 12, padding: '8px 12px',
          background: '#1e1e2a', borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-flame" style={{ color: GOLD, fontSize: 16 }} />
            <span style={{ color: '#888', fontSize: 11 }}>Hustle</span>
          </div>
          <span style={{ color: GOLD, fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {hustle.toLocaleString()}
          </span>
        </div>
        </div>
      </div>
    </div>
  )
}

function PoolBar({ icon, color, label, cur, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((cur / max) * 100)) : 0
  return (
    <div style={{ background: '#1e1e2a', borderRadius: 10, padding: '6px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <i className={`ti ${icon}`} style={{ color, fontSize: 12 }} />
        <span style={{ color: '#888', fontSize: 9, fontWeight: 500, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ color: '#fff', fontSize: 11, fontWeight: 500, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
        {cur.toLocaleString()} / {max.toLocaleString()}
      </div>
      <div style={{ height: 3, background: '#0d0d15', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Sub-tab pill
// ---------------------------------------------------------------------

function SubTab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1,
      background: active ? `${GOLD}18` : '#13131f',
      border: `0.5px solid ${active ? `${GOLD}44` : '#2a2a3a'}`,
      borderRadius: 10,
      padding: '9px 0',
      color: active ? GOLD : '#888',
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      cursor: 'pointer',
    }}>{children}</button>
  )
}

// ---------------------------------------------------------------------
// Upgrades tab
// ---------------------------------------------------------------------

function UpgradesTab({ traits, points, onUpgrade }) {
  return (
    <>
      {/* Points banner */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          background: points > 0
            ? 'linear-gradient(135deg, #15110a 0%, #1a1510 100%)'
            : '#0d0d15',
          border: `0.5px solid ${points > 0 ? `${GOLD}44` : '#1e1e2a'}`,
          borderRadius: 12,
          padding: '12px 14px',
          textAlign: 'center',
        }}>
          <div style={{ color: points > 0 ? '#fff' : '#666', fontSize: 13 }}>
            You have{' '}
            <span style={{ color: points > 0 ? GOLD : DIM, fontSize: 18, fontWeight: 700 }}>
              {points}
            </span>{' '}
            trait point{points === 1 ? '' : 's'} available
          </div>
          <div style={{ color: DIM, fontSize: 10, marginTop: 2 }}>Each upgrade costs one point.</div>
        </div>
      </div>

      {/* Trait cards */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Traits</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TRAITS.map(trait => (
            <TraitCard
              key={trait.id}
              trait={trait}
              value={traits[trait.id]}
              isPrimary={trait.id === PLAYER.primaryTrait}
              canUpgrade={points > 0}
              onUpgrade={() => onUpgrade(trait.id)}
            />
          ))}
        </div>
      </div>

      {/* Footer — how points work now */}
      <div style={{ padding: '0 16px 0' }}>
        <div style={{
          background: '#0d0d15',
          border: '0.5px solid #1e1e2a',
          borderRadius: 12,
          padding: 12,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <div style={{ color: BLUE, fontSize: 16, lineHeight: 1 }}>★</div>
          <div style={{ color: BLUE, fontSize: 11, lineHeight: 1.5, flex: 1 }}>
            Every level grants trait points — and the grant <span style={{ fontWeight: 600 }}>grows as you level up</span>,
            so a level's points stay meaningful all the way up. Spend them however you like:
            your build is how you fight.
          </div>
        </div>
      </div>
    </>
  )
}

function TraitCard({ trait, value, isPrimary, canUpgrade, onUpgrade }) {
  return (
    <div className="card card-pad" style={{
      padding: 14,
      borderColor: isPrimary ? `${BLUE}44` : '#2a2a3a',
      background: isPrimary
        ? 'linear-gradient(135deg, #0a0f1a 0%, #13131f 100%)'
        : '#13131f',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Icon */}
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${trait.color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <i className={`ti ${trait.icon}`} style={{ color: trait.color, fontSize: 20 }} />
        </div>

        {/* Label + value */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPrimary && <span style={{ color: BLUE, fontSize: 11 }}>★</span>}
            <div style={{
              color: isPrimary ? BLUE : '#fff',
              fontSize: 14, fontWeight: 600, letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}>{trait.label}</div>
          </div>
          <div style={{ color: trait.color, fontSize: 22, fontWeight: 700, lineHeight: 1, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </div>
        </div>

        {/* Upgrade button */}
        <button
          onClick={onUpgrade}
          disabled={!canUpgrade}
          style={{
            background: canUpgrade ? GOLD : '#1e1e2a',
            color: canUpgrade ? '#0a0a0f' : '#444',
            border: 'none', borderRadius: 8,
            padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 1,
            cursor: canUpgrade ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 4,
            flexShrink: 0,
            transition: 'background 0.15s, transform 0.1s',
          }}
        >
          <i className="ti ti-arrow-up" style={{ fontSize: 12 }} />
          UPGRADE
        </button>
      </div>

      {/* Description */}
      <div style={{ marginTop: 10, paddingLeft: 52 }}>
        <div style={{ color: trait.color, fontSize: 11, lineHeight: 1.4 }}>
          {trait.description}
        </div>
        <div style={{ color: '#888', fontSize: 11, lineHeight: 1.4, marginTop: 2 }}>
          {trait.detail}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Training tab
// ---------------------------------------------------------------------

function TrainingTab() {
  // Local state because PLAYER is static — same pattern as Property.
  const playerLevel = useProgress().level   // live campaign level
  const [learned, setLearned] = useState(PLAYER.learnedSkills)
  const [lastUpgradeLevel, setLastUpgradeLevel] = useState(PLAYER.lastSkillUpgradeLevel)
  const [feedback, setFeedback] = useState(null) // { skillId, kind: 'learn'|'upgrade', at }

  const canUpgradeThisLevel = lastUpgradeLevel < playerLevel

  // Next unlock teaser — first skill tier you don't yet qualify for
  const nextUnlock = useMemo(() => {
    const unmet = SKILLS.find(s => s.minLevel > playerLevel)
    if (unmet) return unmet.minLevel
    // No future skill data yet → first unlock is at the next 10-level mark
    return Math.ceil((playerLevel + 1) / 10) * 10
  }, [playerLevel])

  const learn = (skill) => {
    const at = Date.now()
    setLearned(l => ({ ...l, [skill.id]: { level: 1 } }))
    setFeedback({ skillId: skill.id, kind: 'learn', at })
    sfx.levelUp()
    setTimeout(() => setFeedback(f => (f && f.at === at) ? null : f), 3500)
  }

  const upgrade = (skill) => {
    if (!canUpgradeThisLevel) return
    const at = Date.now()
    setLearned(l => {
      const cur = l[skill.id] || { level: 0 }
      return { ...l, [skill.id]: { level: cur.level + 1 } }
    })
    setLastUpgradeLevel(playerLevel)
    setFeedback({ skillId: skill.id, kind: 'upgrade', at })
    sfx.buy()
    setTimeout(() => setFeedback(f => (f && f.at === at) ? null : f), 3500)
  }

  const availableSkills = SKILLS.filter(s => s.minLevel <= playerLevel)

  return (
    <>
      {/* Intro */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          background: '#0d0d15',
          border: '0.5px solid #1e1e2a',
          borderRadius: 12, padding: 12,
        }}>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            <i className="ti ti-brain" style={{ color: BLUE, marginRight: 6 }} />
            Train Skills
          </div>
          <div style={{ color: '#888', fontSize: 11, lineHeight: 1.5 }}>
            Learn skills here, then equip them into Battle Dice slots under the Skills tab.
            Each player level lets you upgrade <span style={{ color: GOLD, fontWeight: 600 }}>one</span> skill.
            New skill types unlock every 10 levels.
          </div>
        </div>
      </div>

      {/* Available skills */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Available Skills</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {availableSkills.map(skill => (
            <SkillCard
              key={skill.id}
              skill={skill}
              learned={learned[skill.id]}
              canUpgrade={canUpgradeThisLevel}
              feedback={feedback && feedback.skillId === skill.id ? feedback : null}
              onLearn={() => learn(skill)}
              onUpgrade={() => upgrade(skill)}
            />
          ))}
        </div>
      </div>

      {/* Next unlock */}
      <div className="section">
        <div className="card card-pad" style={{
          textAlign: 'center', padding: '20px 16px',
          background: '#0d0d15', borderColor: '#1e1e2a',
        }}>
          <i className="ti ti-lock" style={{ color: DIM, fontSize: 22, display: 'block', marginBottom: 6 }} />
          <div style={{ color: '#888', fontSize: 12, lineHeight: 1.5 }}>
            New skills unlock at <span style={{ color: GOLD, fontWeight: 700 }}>Level {nextUnlock}</span>
          </div>
        </div>
      </div>

      {/* Upgrade gating note */}
      <div style={{ padding: '0 16px' }}>
        <div style={{
          background: canUpgradeThisLevel ? '#0e1a0e' : '#15110a',
          border: `0.5px solid ${canUpgradeThisLevel ? `${GREEN}44` : `${GOLD}33`}`,
          borderRadius: 10, padding: '10px 12px',
          color: canUpgradeThisLevel ? GREEN : GOLD,
          fontSize: 11, lineHeight: 1.5,
        }}>
          {canUpgradeThisLevel
            ? `✓ You can upgrade one skill at Level ${playerLevel}.`
            : `Skill upgrade used at Level ${lastUpgradeLevel}. Next upgrade unlocks at Level ${lastUpgradeLevel + 1}.`}
        </div>
      </div>
    </>
  )
}

function SkillCard({ skill, learned, canUpgrade, feedback, onLearn, onUpgrade }) {
  const isLearned   = !!learned
  const curLevel    = learned?.level || 0
  const atMax       = curLevel >= skill.maxLevel
  const cost        = isLearned ? skill.upgradeCostFor(curLevel) : skill.baseLearnCost

  return (
    <div className="card card-pad" style={{
      padding: 14, position: 'relative', overflow: 'hidden',
      borderColor: isLearned ? `${GOLD}55` : '#2a2a3a',
      background: isLearned
        ? 'linear-gradient(135deg, #15110a 0%, #13131f 70%)'
        : '#13131f',
    }}>
      {isLearned && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          background: GOLD, color: '#0a0a0f',
          fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
          padding: '3px 10px',
          borderBottomLeftRadius: 10,
        }}>LV {curLevel}{atMax ? ' · MAX' : ''}</div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12,
          background: '#1e1e2a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, flexShrink: 0,
          border: isLearned ? `1px solid ${GOLD}55` : '0.5px solid #2a2a3a',
        }}>{skill.emoji}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: GOLD, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 1 }}>
            {skill.category.toUpperCase()}
          </div>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{skill.name}</div>
          <div style={{ color: '#888', fontSize: 11, lineHeight: 1.4, marginTop: 4 }}>
            {skill.description}
          </div>
          <div style={{ color: '#666', fontSize: 10, marginTop: 6 }}>
            {isLearned
              ? <>Current effect: <span style={{ color: RED, fontWeight: 600 }}>+{curLevel * skill.perLevelAttack} attack</span> when triggered</>
              : <>Level 1 effect: <span style={{ color: RED, fontWeight: 600 }}>+{skill.perLevelAttack} attack</span> when triggered</>
            }
          </div>
          <div style={{ color: DIM, fontSize: 10, marginTop: 2 }}>
            Min Level: {skill.minLevel} · Max Skill Level: {skill.maxLevel}
          </div>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          marginTop: 8,
          background: '#0e1a0e',
          border: `0.5px solid ${GREEN}55`,
          borderRadius: 8,
          padding: '6px 8px',
          fontSize: 11, color: GREEN, lineHeight: 1.4,
        }}>
          ✓ {feedback.kind === 'learn'
            ? `Learned ${skill.shortName} at Level 1.`
            : `Upgraded ${skill.shortName} to Level ${curLevel}.`}
        </div>
      )}

      {/* Cost + action */}
      {!atMax && (
        <div style={{
          marginTop: 12,
          display: 'flex', alignItems: 'center', gap: 10,
          paddingTop: 10,
          borderTop: '0.5px solid #1e1e2a',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#666', fontSize: 9, letterSpacing: 1 }}>COST</div>
            <div style={{ color: GREEN, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {cost.knowledge} knowledge · {cost.hustle.toLocaleString()} Hustle
            </div>
          </div>
          <button
            onClick={isLearned ? onUpgrade : onLearn}
            disabled={isLearned && !canUpgrade}
            style={{
              background: (isLearned && !canUpgrade) ? '#1e1e2a' : GOLD,
              color: (isLearned && !canUpgrade) ? '#555' : '#0a0a0f',
              border: 'none', borderRadius: 8,
              padding: '10px 16px',
              fontSize: 12, fontWeight: 700, letterSpacing: 1,
              cursor: (isLearned && !canUpgrade) ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            {isLearned ? (canUpgrade ? 'UPGRADE' : 'LV CAP') : 'LEARN'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Placeholder tabs (Skills, Equipment)
// ---------------------------------------------------------------------

function PlaceholderTab({ title, body }) {
  return (
    <div className="section" style={{ marginTop: 14 }}>
      <div className="card card-pad" style={{
        textAlign: 'center',
        padding: '32px 20px',
      }}>
        <i className="ti ti-tool" style={{ color: DIM, fontSize: 32, marginBottom: 10, display: 'block' }} />
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
          {title}
        </div>
        <div style={{ color: '#888', fontSize: 12, lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  )
}
