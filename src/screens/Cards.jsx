import React, { useState, useEffect, useMemo } from 'react'
import { CARDS_COLLECTION, RARITY_COLORS, SKILLS } from '../data/gameData'
import { useCardCounts, mergeCard, getOwnedTuples, STACK_SIZE } from '../state/cardsStore'
import {
  baseAtk, baseDef, useCrew,
  ATK_PER_LEVEL, DEF_PER_LEVEL,
} from '../state/crewStore'
import {
  useUpgrades, readUpgrade, getUpgrade, upgradeStat, carryUpgrades,
  HUSTLE_COST_PER_LEVEL, MAX_UPGRADE_LEVEL,
} from '../state/upgradesStore'
import { useHustle, spendHustle } from '../state/playerStore'
import {
  useSkillCardCounts, getOwnedSkillTuples, mergeSkillCard, SKILL_STACK_SIZE,
} from '../state/skillCardsStore'
import {
  useSkillUpgrades, readSkillUpgrade, getSkillUpgrade, upgradeSkillStat, carrySkillUpgrades,
  SKILL_DMG_PER_LEVEL, SKILL_UPGRADE_COST, MAX_SKILL_UPGRADE_LEVEL,
} from '../state/skillUpgradesStore'
import { sfx } from '../sounds'
import { Avatar } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import Crew from './Crew'
import SkillLoadout from './SkillLoadout'
import { CommissaryPack } from '../components/CommissaryPack'

// Collection filter chips. 'All' shows everything (owned + locked).
// 'Owned' hides locked tiles. Rarity labels show every card of that
// rarity regardless of ownership so users can see what's still
// possible to collect.
const FILTERS = ['All', 'Owned', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']
const RARITY_LABELS = new Set(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'])

function matchesFilter(card, filter, isOwned) {
  if (filter === 'All')   return true
  if (filter === 'Owned') return isOwned
  if (RARITY_LABELS.has(filter)) return card.rarity === filter.toLowerCase()
  return true
}

function sectionLabelFor(filter, ownedCount, totalCount) {
  if (filter === 'All')   return `Your Collection (${ownedCount}/${totalCount})`
  if (filter === 'Owned') return `Owned (${ownedCount})`
  return filter
}

export default function Cards({ initialTab = 'player' }) {
  // Top-level tabs: 'player' (Player Cards) | 'skill' (Skill Cards) | 'crew'.
  // 'collection' is the legacy id for the player grid — normalize it so old
  // deep-links still land on Player Cards. Default view is Player Cards.
  const [tab, setTab] = useState(initialTab === 'collection' ? 'player' : initialTab)
  const [selectedCard, setSelectedCard]   = useState(null)
  const [mergeReveal, setMergeReveal]     = useState(null)   // { card, toLevel } during merge animation
  const [selectedSkill, setSelectedSkill] = useState(null)   // { skill, cardLevel } skill detail
  const [skillMergeReveal, setSkillMergeReveal] = useState(null)
  // Active filter chip for the collection grid. 'All' / 'Owned' / one of
  // the rarity labels. 'All' shows owned + locked; 'Owned' shows only
  // tiles you have at least one of; rarity filters show every card of
  // that rarity (owned + locked) so users can see what's still possible
  // to collect.
  const [filter, setFilter] = useState('All')
  const counts = useCardCounts()
  const crew   = useCrew()
  const upgradesMap = useUpgrades()
  const hustle = useHustle()
  const skillCounts     = useSkillCardCounts()
  const skillUpgradeMap = useSkillUpgrades()

  // Spend Hustle to bump a skill card's DMG upgrade level (same flow as the
  // player-card ATK/DEF upgrades).
  const handleSkillUpgrade = (skillId, cardLevel) => () => {
    const cur = getSkillUpgrade(skillId, cardLevel).dmg || 0
    if (cur >= MAX_SKILL_UPGRADE_LEVEL) return
    if (spendHustle(SKILL_UPGRADE_COST(cur))) { upgradeSkillStat(skillId, cardLevel); sfx.buy() }
    else sfx.deny?.()
  }
  // "Owned" for pack-pool purposes = has at least one Level 1 copy.
  const ownedSet = useMemo(() => {
    const s = new Set()
    for (const [k, v] of counts.entries()) {
      if (v > 0 && k.endsWith(':1')) s.add(Number(k.split(':')[0]))
    }
    return s
  }, [counts])
  // Cards currently slotted in the crew (leader + members) — used to dim
  // their collection tiles so you can see at a glance what's in use.
  const inCrewSet = useMemo(() => {
    const s = new Set()
    if (crew.leader != null) s.add(crew.leader)
    crew.members.forEach(id => { if (id != null) s.add(id) })
    return s
  }, [crew.leader, crew.members])

  const handleUpgrade = (cardId, cardLevel) => (stat) => {
    const current = getUpgrade(cardId, cardLevel)[stat] || 0
    if (current >= MAX_UPGRADE_LEVEL) return
    const cost = HUSTLE_COST_PER_LEVEL(current)
    if (spendHustle(cost)) {
      upgradeStat(cardId, cardLevel, stat)
      sfx.buy()
    } else {
      sfx.deny?.()
    }
  }

  // Crew tab swaps in the standalone Crew screen so all of its layout
  // (header stats, slot grid, slot editor) renders without the pack banner
  // and collection grid below it.
  if (tab === 'crew') {
    return (
      <div className="scroll-area animate-in">
        <TabSwitcher tab={tab} onTab={setTab} />
        <Crew />
      </div>
    )
  }

  // Skills loadout — the skill-card equivalent of My Crew: equip skill cards
  // into the 11 Battle-Dice slots.
  if (tab === 'loadout') {
    return (
      <div className="scroll-area animate-in">
        <TabSwitcher tab={tab} onTab={setTab} />
        <SkillLoadout />
      </div>
    )
  }

  return (
    <div className="scroll-area animate-in">

      <TabSwitcher tab={tab} onTab={setTab} />

      {/* PLAYER CARDS — pack banner, rarity filters, and the owned/locked grid. */}
      {tab === 'player' && (
        <>
          {/* Pack Banner + open machine — shared with the Commissary Store view. */}
          <CommissaryPack />

          <FilterChips filter={filter} setFilter={setFilter} />

          {/* Cards Grid — one tile per (card_id, card_level) the player has,
              plus locked placeholders for catalog entries not seen yet. */}
          <div className="section" style={{ marginTop: 14 }}>
            <div className="section-label">
              {sectionLabelFor(filter, ownedSet.size, CARDS_COLLECTION.length)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(() => {
                const owned = getOwnedTuples()    // sorted by id asc, level desc
                const ownedKey = new Set(owned.map(t => `${t.id}:${t.level}`))
                const tiles = []

                // Owned tuples first — each gets its own tile with type, count, merge.
                owned.forEach(t => {
                  const card = CARDS_COLLECTION.find(c => c.id === t.id)
                  if (!card) return
                  if (!matchesFilter(card, filter, /* owned */ true)) return
                  tiles.push(
                    <CollectionTile
                      key={`${t.id}:${t.level}`}
                      card={card}
                      cardLevel={t.level}
                      count={t.count}
                      inCrew={inCrewSet.has(t.id)}
                      upgrades={readUpgrade(upgradesMap, t.id, t.level)}
                      onTap={() => setSelectedCard({ card, cardLevel: t.level, count: t.count })}
                    />
                  )
                })

                // Locked placeholders for any catalog card the player has zero of
                // at Lvl 1. 'Owned' filter hides these.
                CARDS_COLLECTION.forEach(card => {
                  if (ownedKey.has(`${card.id}:1`)) return
                  if (!matchesFilter(card, filter, /* owned */ false)) return
                  tiles.push(<LockedTile key={`locked:${card.id}`} card={card} />)
                })

                if (tiles.length === 0) {
                  return (
                    <div style={{
                      gridColumn: '1 / -1',
                      background: '#13131f',
                      border: '0.5px solid #1e1e2a',
                      borderRadius: 12,
                      padding: 20, textAlign: 'center',
                      color: '#555', fontSize: 12,
                    }}>
                      No {filter.toLowerCase()} cards yet.
                    </div>
                  )
                }
                return tiles
              })()}
            </div>
          </div>
        </>
      )}

      {/* SKILL CARDS — same rarity filters, stacking + merge as player cards. */}
      {tab === 'skill' && (
        <>
          <FilterChips filter={filter} setFilter={setFilter} />
          <SkillCollection
            filter={filter}
            upgradeMap={skillUpgradeMap}
            onTapSkill={(skill, cardLevel) => setSelectedSkill({ skill, cardLevel })}
          />
        </>
      )}

      {/* Card Detail — universal modal so it's consistent with all other
          character cards (no bottom-sheet gap, big cinematic hero). */}
      {selectedCard && (() => {
        const { card, cardLevel } = selectedCard
        // Read the live count from the store so the MERGE button updates (and
        // hides) as the stack is consumed, without reopening the modal.
        const liveCount = counts.get(`${card.id}:${cardLevel}`) || 0
        return (
          <CharacterDetailModal
            character={card}
            cardType="PLAYER"
            count={liveCount}
            cardLevel={cardLevel}
            upgrades={readUpgrade(upgradesMap, card.id, cardLevel)}
            hustle={hustle}
            onUpgrade={handleUpgrade(card.id, cardLevel)}
            atkPerLevel={ATK_PER_LEVEL}
            defPerLevel={DEF_PER_LEVEL}
            maxUpgradeLevel={MAX_UPGRADE_LEVEL}
            costForLevel={HUSTLE_COST_PER_LEVEL}
            canMerge={liveCount >= STACK_SIZE}
            onMerge={() => {
              mergeCard(card.id, cardLevel)
              // Level 2 inherits the Level-1 upgrades (higher of the two).
              carryUpgrades(card.id, cardLevel, cardLevel + 1)
              // Hand off to the full-screen consume → reveal animation.
              setSelectedCard(null)
              setMergeReveal({ card, toLevel: cardLevel + 1 })
            }}
            onClose={() => setSelectedCard(null)}
          />
        )
      })()}

      {/* Merge consume → Level-up reveal */}
      {mergeReveal && (
        <MergeRevealModal
          card={mergeReveal.card}
          toLevel={mergeReveal.toLevel}
          onDone={() => setMergeReveal(null)}
        />
      )}

      {/* Skill card detail — same modal, upgrades the DMG stat and merges
          duplicates to the next level exactly like the player cards. */}
      {selectedSkill && (() => {
        const { skill, cardLevel } = selectedSkill
        const liveCount = skillCounts.get(`${skill.id}:${cardLevel}`) || 0
        const dmgUp = readSkillUpgrade(skillUpgradeMap, skill.id, cardLevel).dmg || 0
        const effDmg = skill.perLevelAttack + dmgUp * SKILL_DMG_PER_LEVEL
        return (
          <CharacterDetailModal
            character={{ ...skill, bio: skill.description }}
            cardType="SKILL"
            count={liveCount}
            cardLevel={cardLevel}
            statTiles={[
              { icon: 'ti-sword', label: 'DMG / LV', value: `+${effDmg}`, color: '#e74c3c' },
              { icon: 'ti-stack-2', label: 'Card Level', value: cardLevel, color: '#c9a84c' },
            ]}
            upgrades={readSkillUpgrade(skillUpgradeMap, skill.id, cardLevel)}
            hustle={hustle}
            onUpgrade={handleSkillUpgrade(skill.id, cardLevel)}
            upgradeRows={[{ label: 'DAMAGE', color: '#e74c3c', stat: 'dmg', perLevel: SKILL_DMG_PER_LEVEL }]}
            maxUpgradeLevel={MAX_SKILL_UPGRADE_LEVEL}
            costForLevel={SKILL_UPGRADE_COST}
            canMerge={liveCount >= SKILL_STACK_SIZE}
            onMerge={() => {
              mergeSkillCard(skill.id, cardLevel)
              carrySkillUpgrades(skill.id, cardLevel, cardLevel + 1)
              setSelectedSkill(null)
              setSkillMergeReveal({ card: skill, toLevel: cardLevel + 1 })
            }}
            onClose={() => setSelectedSkill(null)}
          />
        )
      })()}

      {/* Skill merge consume → Level-up reveal (reuses the player reveal). */}
      {skillMergeReveal && (
        <MergeRevealModal
          card={skillMergeReveal.card}
          toLevel={skillMergeReveal.toLevel}
          onDone={() => setSkillMergeReveal(null)}
        />
      )}

    </div>
  )
}

// Full-screen merge celebration: a fanned stack of the card converges and
// bursts, then the next-level card bounces in — same vocabulary as the pack
// reveal so the two moments feel like one family.
function MergeRevealModal({ card, toLevel, onDone }) {
  const color = RARITY_COLORS[card.rarity] || '#c9a84c'
  const [phase, setPhase] = useState('merging')   // 'merging' → 'revealed'
  const FAN = [-2, -1, 0, 1, 2]
  const SPARKLES = 12

  useEffect(() => {
    sfx.shake?.()
    const burst  = setTimeout(() => sfx.burst?.(), 900)
    const reveal = setTimeout(() => { setPhase('revealed'); sfx.reveal?.(4) }, 1300)
    return () => { clearTimeout(burst); clearTimeout(reveal) }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0a0a0f',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      zIndex: 320, '--rarity': color,
    }}>
      {phase === 'merging' && (
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: color, opacity: 0,
          animation: 'rarityFlash 0.9s ease-out 1.0s forwards',
        }} />
      )}

      {/* Close (X) top-right — matches the detail modal so the level-up screen
          dismisses the same way as every other card view. */}
      <button
        onClick={onDone}
        aria-label="Close"
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 2,
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(10,10,15,0.7)',
          border: '0.5px solid rgba(255,255,255,0.15)',
          color: '#fff', fontSize: 18, fontWeight: 700,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      ><i className="ti ti-x" /></button>

      <div style={{
        width: '100%', maxWidth: 390, padding: '70px 24px 100px',
        textAlign: 'center', display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-start',
      }}>
        {phase === 'merging' ? (
          <>
            <div style={{ position: 'relative', height: 150, marginBottom: 24 }}>
              {FAN.map((f, i) => (
                <div key={i} aria-hidden="true" style={{
                  position: 'absolute', left: '50%', top: 20, marginLeft: -36,
                  animation: 'mergeConverge 1.15s ease-in forwards',
                  '--fanX': `${f * 36}px`,
                  '--fanR': `${f * 9}deg`,
                }}>
                  <Avatar src={card.avatar} emoji={card.emoji} size={72} radius={12} />
                </div>
              ))}
            </div>
            <div style={{ color, fontSize: 14, letterSpacing: 2, opacity: 0.85, fontWeight: 600 }}>
              MERGING {STACK_SIZE} CARDS…
            </div>
            <div style={{ height: 130 }} />
          </>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Expanding rarity rings */}
            {[0, 1, 2].map(i => (
              <div key={`ring-${i}`} aria-hidden="true" style={{
                position: 'absolute', left: '50%', top: 76,
                width: 110, height: 110, borderRadius: '50%',
                border: `2px solid ${color}`, pointerEvents: 'none',
                animation: `rarityRingExpand 1.2s ease-out ${i * 0.18}s forwards`, opacity: 0,
              }} />
            ))}

            {/* Sparkle particles */}
            {Array.from({ length: SPARKLES }).map((_, i) => {
              const angle    = (i / SPARKLES) * Math.PI * 2
              const distance = 70 + ((i * 13) % 35)
              return (
                <div key={`spark-${i}`} aria-hidden="true" style={{
                  position: 'absolute', left: 'calc(50% - 3px)', top: 'calc(76px - 3px)',
                  width: 6, height: 6, borderRadius: '50%',
                  background: color, boxShadow: `0 0 6px ${color}`,
                  pointerEvents: 'none', opacity: 0,
                  animation: `sparkleFloat 1.4s ease-out ${0.1 + i * 0.03}s forwards`,
                  '--dx': `${Math.cos(angle) * distance}px`,
                  '--dy': `${Math.sin(angle) * distance}px`,
                }} />
              )
            })}

            <div style={{
              marginTop: 20, marginBottom: 8,
              animation: 'cardRevealBounce 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
              filter: `drop-shadow(0 0 16px ${color})`,
              display: 'flex', justifyContent: 'center',
            }}>
              <Avatar src={card.avatar} emoji={card.emoji} size={128} radius={16} />
            </div>

            <div style={{
              height: 3, background: color, borderRadius: 2, margin: '8px auto 14px', width: 90,
              opacity: 0, animation: 'logLineIn 0.4s ease 0.5s forwards',
            }} />

            <div style={{
              color: '#fff', fontSize: 22, fontWeight: 600, marginBottom: 4,
              opacity: 0, animation: 'logLineIn 0.4s ease 0.55s forwards',
            }}>{card.name}</div>

            <div style={{
              color, fontSize: 15, fontWeight: 700, letterSpacing: 3, marginBottom: 18,
              opacity: 0,
              animation: 'logLineIn 0.4s ease 0.65s forwards, labelGlow 1.6s ease-in-out 1s infinite',
            }}>LEVEL {toLevel}</div>

            <button className="btn btn-primary btn-full"
              style={{ padding: 14, opacity: 0, animation: 'logLineIn 0.4s ease 0.9s forwards' }}
              onClick={onDone}>
              Collect
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Collection tiles
// ---------------------------------------------------------------------

// Owned tile — shows PLAYER type, CARDS:N badge. Tap opens the detail modal,
// where upgrades and the MERGE action live.
// `inCrew` dims the tile and shows an IN CREW badge so you can see at a
// glance which cards are slotted vs. on the bench.
function CollectionTile({ card, cardLevel, count, inCrew, upgrades, onTap }) {
  const rarityColor = RARITY_COLORS[card.rarity]
  const atk = baseAtk(card) + (upgrades?.atk || 0) * ATK_PER_LEVEL
  const def = baseDef(card) + (upgrades?.def || 0) * DEF_PER_LEVEL
  // Cards pile into stacks of STACK_SIZE; extras spill into the next stack.
  const fullStacks = Math.floor(count / STACK_SIZE)
  const remainder  = count % STACK_SIZE
  const stackLabel = fullStacks > 0
    ? `${fullStacks} STACK${fullStacks > 1 ? 'S' : ''}${remainder > 0 ? ` +${remainder}` : ''}`
    : null

  return (
    <div onClick={onTap} style={{
      background: '#13131f',
      border: `0.5px solid ${rarityColor}44`,
      borderRadius: 16,
      padding: '22px 14px 14px',
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Rarity top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: rarityColor }} />

      {/* Type label (top-left) — for now everything in this catalog is a
          Player card; Attack/Defence/Skill types arrive in later phases. */}
      <div style={{
        position: 'absolute', top: 6, left: 8,
        color: '#888', fontSize: 8, fontWeight: 700, letterSpacing: 1.5,
      }}>PLAYER</div>

      {/* CARDS:N badge (top-right) */}
      <div style={{
        position: 'absolute', top: 6, right: 8,
        color: rarityColor, fontSize: 9, fontWeight: 700, letterSpacing: 1,
        background: `${rarityColor}18`,
        border: `0.5px solid ${rarityColor}44`,
        borderRadius: 4,
        padding: '2px 5px',
        fontVariantNumeric: 'tabular-nums',
      }}>CARDS:{count}</div>

      {/* Card art — sits on offset 'card-back' layers, one per full stack, so
          a deeper pile reads as more stacks at a glance. Extra top margin keeps
          it clear of the PLAYER / CARDS badges. */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 6px' }}>
        <div style={{ position: 'relative', width: 56, height: 56 }}>
          {Array.from({ length: Math.min(fullStacks, 3) }).map((_, i) => {
            const off = (i + 1) * 3
            return (
              <div key={i} aria-hidden="true" style={{
                position: 'absolute', top: 0, left: 0, zIndex: 0,
                width: 56, height: 56, borderRadius: 8,
                background: '#181826',
                border: `0.5px solid ${rarityColor}55`,
                transform: `translate(${-off}px, ${-off}px)`,
              }} />
            )
          })}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Avatar src={card.avatar} emoji={card.emoji} size={56} radius={8} />
          </div>
        </div>
      </div>

      {/* Stack count — only once at least one full stack has formed. */}
      {stackLabel && (
        <div style={{
          textAlign: 'center', marginBottom: 4,
          color: rarityColor, fontSize: 9, fontWeight: 800, letterSpacing: 1,
        }}>{stackLabel}</div>
      )}

      {/* Name */}
      <div style={{ color: '#fff', fontSize: 12, fontWeight: 500, textAlign: 'center', marginBottom: 2 }}>
        {card.name}{cardLevel >= 1 && <span style={{ color: rarityColor, marginLeft: 4 }}>· LVL {cardLevel}</span>}
      </div>

      {/* Rarity */}
      <div style={{ color: rarityColor, fontSize: 10, textAlign: 'center', textTransform: 'capitalize', marginBottom: 10 }}>
        {card.rarity}
      </div>

      {/* Combat stats — ATK + DEF only (reflects upgrades if any) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div style={{
          background: '#1e1e2a', borderRadius: 8,
          padding: '6px 8px', textAlign: 'center',
        }}>
          <div style={{ color: '#555', fontSize: 8, letterSpacing: 1, fontWeight: 700 }}>ATK</div>
          <div style={{ color: '#e74c3c', fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {atk}
          </div>
        </div>
        <div style={{
          background: '#1e1e2a', borderRadius: 8,
          padding: '6px 8px', textAlign: 'center',
        }}>
          <div style={{ color: '#555', fontSize: 8, letterSpacing: 1, fontWeight: 700 }}>DEF</div>
          <div style={{ color: '#4a9eff', fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {def}
          </div>
        </div>
      </div>

      {/* IN CREW indicator — appears when this card is in the leader or
          member slots. The tile is dimmed in addition, for at-a-glance scan. */}
      {inCrew && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          color: '#fff',
          background: 'rgba(10,10,15,0.85)',
          border: '0.5px solid rgba(255,255,255,0.2)',
          borderRadius: 4,
          padding: '2px 6px',
          fontSize: 8, fontWeight: 800, letterSpacing: 1.2,
        }}>IN CREW</div>
      )}
    </div>
  )
}

// Locked tile — catalog card the player hasn't pulled yet.
function LockedTile({ card }) {
  return (
    <div style={{
      background: '#13131f',
      border: '0.5px solid #1e1e2a',
      borderRadius: 16,
      padding: '22px 14px 14px',
      opacity: 0.4,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: RARITY_COLORS[card.rarity] }} />
      <div style={{
        position: 'absolute', top: 6, left: 8,
        color: '#555', fontSize: 8, fontWeight: 700, letterSpacing: 1.5,
      }}>PLAYER</div>
      <div style={{
        position: 'absolute', top: 6, right: 8,
        color: '#555', fontSize: 9, fontWeight: 700, letterSpacing: 1,
        background: '#1e1e2a',
        border: '0.5px solid #2a2a3a',
        borderRadius: 4,
        padding: '2px 5px',
      }}>CARDS:0</div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0 6px' }}>
        <Avatar emoji="🔒" size={48} radius={8} />
      </div>
      <div style={{ color: '#555', fontSize: 12, fontWeight: 500, textAlign: 'center', marginBottom: 2 }}>{card.name}</div>
      <div style={{ color: RARITY_COLORS[card.rarity], fontSize: 10, textAlign: 'center', textTransform: 'capitalize', marginBottom: 10 }}>
        {card.rarity}
      </div>
    </div>
  )
}

function TabSwitcher({ tab, onTab }) {
  const TABS = [
    { id: 'player',  label: 'Player Cards', icon: 'ti-user' },
    { id: 'skill',   label: 'Skill Cards',  icon: 'ti-cards' },
    { id: 'crew',    label: 'My Crew',      icon: 'ti-users' },
    { id: 'loadout', label: 'Skills',       icon: 'ti-bolt' },
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
      padding: '14px 16px 0',
    }}>
      {TABS.map(t => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className="btn"
            style={{
              padding: '10px 8px',
              background: active ? '#c9a84c18' : '#13131f',
              border: `0.5px solid ${active ? '#c9a84c66' : '#2a2a3a'}`,
              color: active ? '#c9a84c' : '#888',
              borderRadius: 12,
              fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <i className={`ti ${t.icon}`} aria-hidden="true" />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// Shared rarity filter chips — used by both the Player Cards and Skill Cards
// tabs. Wraps so every type is visible at once.
function FilterChips({ filter, setFilter }) {
  return (
    <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {FILTERS.map(f => {
        const active = filter === f
        return (
          <div
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: active ? '#c9a84c18' : '#13131f',
              border: `0.5px solid ${active ? '#c9a84c44' : '#2a2a3a'}`,
              borderRadius: 20,
              padding: '5px 14px',
              color: active ? '#c9a84c' : '#888',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >{f}</div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------
// Skill Cards tab — stacks + merges + upgrades exactly like player cards.
// ---------------------------------------------------------------------

// The Skill Cards grid — same rarity filters as Player Cards, over the SKILLS
// catalog, reading the skill-cards store for owned (id, level) tuples. Owned
// tiles show stack counts + open the upgrade/merge modal; unowned catalog
// skills render as locked placeholders.
function SkillCollection({ filter, upgradeMap, onTapSkill }) {
  const owned = getOwnedSkillTuples()                 // [{ id, level, count }]
  const ownedKey = new Set(owned.map(t => `${t.id}:${t.level}`))
  const ownedIds = new Set(owned.map(t => t.id))
  const label = filter === 'All'   ? `Skill Cards (${ownedIds.size}/${SKILLS.length})`
              : filter === 'Owned' ? `Owned (${ownedIds.size})`
              : filter

  const tiles = []
  owned.forEach(t => {
    const skill = SKILLS.find(s => s.id === t.id)
    if (!skill) return
    if (!matchesFilter(skill, filter, /* owned */ true)) return
    tiles.push(
      <SkillTile
        key={`${t.id}:${t.level}`}
        skill={skill}
        cardLevel={t.level}
        count={t.count}
        dmgUpgrade={readSkillUpgrade(upgradeMap, t.id, t.level).dmg || 0}
        onTap={() => onTapSkill(skill, t.level)}
      />
    )
  })
  SKILLS.forEach(skill => {
    if (ownedKey.has(`${skill.id}:1`)) return
    if (!matchesFilter(skill, filter, /* owned */ false)) return
    tiles.push(<LockedSkillTile key={`locked:${skill.id}`} skill={skill} />)
  })

  return (
    <div className="section" style={{ marginTop: 14 }}>
      <div className="section-label">{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {tiles.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            background: '#13131f', border: '0.5px solid #1e1e2a',
            borderRadius: 12, padding: 20, textAlign: 'center',
            color: '#555', fontSize: 12,
          }}>
            {SKILLS.length === 0 ? 'No skill cards yet.' : `No ${filter.toLowerCase()} skill cards.`}
          </div>
        ) : tiles}
      </div>
    </div>
  )
}

// Skill card tile — same chrome + stacking visuals as the player CollectionTile
// (CARDS:N badge, stack-back layers, merge-ready dot), with DMG + LVL stat tiles.
function SkillTile({ skill, cardLevel, count, dmgUpgrade = 0, onTap }) {
  const rarityColor = RARITY_COLORS[skill.rarity] || '#c9a84c'
  const effDmg      = skill.perLevelAttack + dmgUpgrade * SKILL_DMG_PER_LEVEL
  const fullStacks  = Math.floor(count / SKILL_STACK_SIZE)
  const remainder   = count % SKILL_STACK_SIZE
  const stackLabel  = fullStacks > 0
    ? `${fullStacks} STACK${fullStacks > 1 ? 'S' : ''}${remainder > 0 ? ` +${remainder}` : ''}`
    : null
  const mergeReady  = count >= SKILL_STACK_SIZE

  return (
    <div onClick={onTap} style={{
      background: '#13131f',
      border: `0.5px solid ${rarityColor}44`,
      borderRadius: 16,
      padding: '22px 14px 14px',
      position: 'relative', overflow: 'hidden', cursor: 'pointer',
    }}>
      {/* Rarity top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: rarityColor }} />

      {/* Type label (top-left) */}
      <div style={{ position: 'absolute', top: 6, left: 8, color: '#888', fontSize: 8, fontWeight: 700, letterSpacing: 1.5 }}>SKILL</div>

      {/* CARDS:N badge (top-right) — merge-ready gets a dot */}
      <div style={{
        position: 'absolute', top: 6, right: 8,
        color: rarityColor, fontSize: 9, fontWeight: 700, letterSpacing: 1,
        background: `${rarityColor}18`, border: `0.5px solid ${rarityColor}44`,
        borderRadius: 4, padding: '2px 5px', fontVariantNumeric: 'tabular-nums',
      }}>{mergeReady ? '● ' : ''}CARDS:{count}</div>

      {/* Art — 1.5× the player-tile size, on offset stack-back layers (one per
          full stack). */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 8px' }}>
        <div style={{ position: 'relative', width: 84, height: 84 }}>
          {Array.from({ length: Math.min(fullStacks, 3) }).map((_, i) => {
            const off = (i + 1) * 3
            return (
              <div key={i} aria-hidden="true" style={{
                position: 'absolute', top: 0, left: 0, zIndex: 0,
                width: 84, height: 84, borderRadius: 10,
                background: '#181826', border: `0.5px solid ${rarityColor}55`,
                transform: `translate(${-off}px, ${-off}px)`,
              }} />
            )
          })}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Avatar src={skill.avatar} emoji={skill.emoji} size={84} radius={10}
              style={{ background: '#1e1e2a', border: `1px solid ${rarityColor}55` }} />
          </div>
        </div>
      </div>

      {stackLabel && (
        <div style={{ textAlign: 'center', marginBottom: 4, color: rarityColor, fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>{stackLabel}</div>
      )}

      {/* Name + card level */}
      <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, textAlign: 'center', marginBottom: 2 }}>
        {skill.name}{cardLevel >= 1 && <span style={{ color: rarityColor, marginLeft: 4 }}>· LVL {cardLevel}</span>}
      </div>

      {/* Category */}
      <div style={{ color: rarityColor, fontSize: 10, textAlign: 'center', textTransform: 'capitalize', marginBottom: 10 }}>
        {skill.category}
      </div>

      {/* Stat tiles — DMG (reflects upgrades) + LVL */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div style={{ background: '#1e1e2a', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: 8, letterSpacing: 1, fontWeight: 700 }}>DMG</div>
          <div style={{ color: '#e74c3c', fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            +{effDmg}<span style={{ fontSize: 8, color: '#777', fontWeight: 600 }}>/lv</span>
          </div>
        </div>
        <div style={{ background: '#1e1e2a', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: 8, letterSpacing: 1, fontWeight: 700 }}>LVL</div>
          <div style={{ color: '#c9a84c', fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{cardLevel}</div>
        </div>
      </div>
    </div>
  )
}

// Locked skill tile — a catalog skill the player owns zero of.
function LockedSkillTile({ skill }) {
  const rarityColor = RARITY_COLORS[skill.rarity] || '#c9a84c'
  return (
    <div style={{
      background: '#13131f', border: '0.5px solid #1e1e2a', borderRadius: 16,
      padding: '22px 14px 14px', opacity: 0.4, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: rarityColor }} />
      <div style={{ position: 'absolute', top: 6, left: 8, color: '#555', fontSize: 8, fontWeight: 700, letterSpacing: 1.5 }}>SKILL</div>
      <div style={{ position: 'absolute', top: 6, right: 8, color: '#555', fontSize: 9, fontWeight: 700, letterSpacing: 1, background: '#1e1e2a', border: '0.5px solid #2a2a3a', borderRadius: 4, padding: '2px 5px' }}>CARDS:0</div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 6px' }}>
        <Avatar emoji="🔒" size={56} radius={8} style={{ background: '#1e1e2a' }} />
      </div>
      <div style={{ color: '#555', fontSize: 12, fontWeight: 600, textAlign: 'center', marginBottom: 2 }}>{skill.name}</div>
      <div style={{ color: rarityColor, fontSize: 10, textAlign: 'center', textTransform: 'capitalize', marginBottom: 10 }}>{skill.category}</div>
    </div>
  )
}
