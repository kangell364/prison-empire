import React, { useState, useEffect, useMemo } from 'react'
import { CARDS_COLLECTION, RARITY_COLORS } from '../data/gameData'
import { useCardCounts, addCards, mergeCard, getOwnedTuples, STACK_SIZE } from '../state/cardsStore'
import {
  baseAtk, baseDef, useCrew,
  ATK_PER_LEVEL, DEF_PER_LEVEL,
} from '../state/crewStore'
import {
  useUpgrades, readUpgrade, getUpgrade, upgradeStat, carryUpgrades,
  HUSTLE_COST_PER_LEVEL, MAX_UPGRADE_LEVEL,
} from '../state/upgradesStore'
import { useHustle, spendHustle } from '../state/playerStore'
import { sfx } from '../sounds'
import { Avatar } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import Crew from './Crew'

const RARITY_TIER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }
const PACK_OPEN_DURATION_MS = 1600  // total time of shake → charge → burst
const PACK_BURST_AT_MS      = 1300  // when the burst animation kicks in
const CARDS_PER_PACK        = 3

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

// Picks 3 cards for a pack reveal. Stacking changes the math here —
// duplicates are now valuable (they grow your stack toward merge), so the
// pack can deliver the same card twice and that's a feature. We still
// pick 3 distinct cards per pack for variety, biased toward cards you
// don't own yet but happy to dip into owned ones once everything is
// unlocked at base level. Guarantees at least one Uncommon+, rarest
// reveals last for the big payoff.
function pickPackCards(ownedSet) {
  const unowned = CARDS_COLLECTION.filter(c => !ownedSet.has(c.id))
  const pool = unowned.length >= CARDS_PER_PACK ? unowned : CARDS_COLLECTION
  const picks = []
  const used = new Set()
  while (picks.length < CARDS_PER_PACK && used.size < pool.length) {
    const c = pool[Math.floor(Math.random() * pool.length)]
    if (used.has(c.id)) continue
    used.add(c.id)
    picks.push(c)
  }
  if (!picks.some(c => (RARITY_TIER[c.rarity] ?? 0) >= 1)) {
    const better = pool.filter(c => (RARITY_TIER[c.rarity] ?? 0) >= 1 && !used.has(c.id))
    if (better.length > 0) picks[picks.length - 1] = better[Math.floor(Math.random() * better.length)]
  }
  return picks.sort((a, b) => (RARITY_TIER[a.rarity] ?? 0) - (RARITY_TIER[b.rarity] ?? 0))
}

export default function Cards() {
  const [tab, setTab] = useState('collection')   // 'collection' | 'crew'
  const [selectedCard, setSelectedCard]   = useState(null)
  const [mergeReveal, setMergeReveal]     = useState(null)   // { card, toLevel } during merge animation
  const [showPack, setShowPack]           = useState(false)
  // 'idle' → 'opening' (shake/charge/burst) → 'revealing' (one card at a time, tap to advance) → 'revealed' (accept)
  const [packState, setPackState]         = useState('idle')
  const [revealedCards, setRevealedCards] = useState([])
  const [revealIndex,   setRevealIndex]   = useState(0)
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

  // The burst flash uses the rarest card's color so the big moment feels coherent
  // with the payoff card the player is about to see at the end of the sequence.
  const headlineCard = revealedCards[revealedCards.length - 1] || null

  const openPack = () => {
    setShowPack(true)
    setPackState('idle')
    setRevealedCards([])
    setRevealIndex(0)
  }

  const closePack = () => {
    // "Add to Collection" → increment stack count for each revealed card.
    // Duplicates inside the pack are intentional now — they grow stacks.
    if (packState === 'revealed' && revealedCards.length > 0) {
      addCards(revealedCards.map(c => c.id), 1)
    }
    setShowPack(false)
    setPackState('idle')
    setRevealedCards([])
    setRevealIndex(0)
  }

  const startOpening = () => {
    setRevealedCards(pickPackCards(ownedSet))
    setRevealIndex(0)
    setPackState('opening')
    sfx.shake()
  }

  const advanceReveal = () => {
    if (packState !== 'revealing') return
    if (revealIndex < revealedCards.length - 1) {
      const nextIdx = revealIndex + 1
      setRevealIndex(nextIdx)
      const tier = RARITY_TIER[revealedCards[nextIdx].rarity] ?? 0
      sfx.reveal(tier)
    } else {
      setPackState('revealed')
    }
  }

  // Transition opening → revealing after the burst completes. Burst sound
  // fires on the matching frame, then the first card's reveal ping.
  useEffect(() => {
    if (packState !== 'opening') return
    const firstTier = revealedCards[0] ? RARITY_TIER[revealedCards[0].rarity] ?? 0 : 0
    const burstId  = setTimeout(() => sfx.burst(), PACK_BURST_AT_MS)
    const revealId = setTimeout(() => {
      setPackState('revealing')
      sfx.reveal(firstTier)
    }, PACK_OPEN_DURATION_MS)
    return () => { clearTimeout(burstId); clearTimeout(revealId) }
  }, [packState, revealedCards])

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

  return (
    <div className="scroll-area animate-in">

      <TabSwitcher tab={tab} onTab={setTab} />

      {/* Pack Banner */}
      <div style={{ margin: '14px 16px 0', background: 'linear-gradient(135deg, #1a1510, #251e0a)', border: '0.5px solid #c9a84c44', borderRadius: 20, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 44 }}>🎴</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#c9a84c', fontSize: 15, fontWeight: 500 }}>Commissary Pack</div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>3 random cards — guaranteed 1 Uncommon</div>
          <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>2 packs available today</div>
        </div>
        <button className="btn btn-gold" onClick={openPack} style={{ padding: '10px 16px' }}>
          Open<br />
          <span style={{ fontSize: 11, opacity: 0.8 }}>$0.99</span>
        </button>
      </div>

      {/* Filter chips — each one filters the collection grid below. */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {FILTERS.map(f => {
          const active = filter === f
          return (
            <div
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flexShrink: 0,
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

      {/* Cards Grid — one tile per (card_id, card_level) the player has,
          plus locked placeholders for catalog entries they haven't seen yet.
          Filter chip narrows the list. */}
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

      {/* Pack Opening Modal */}
      {showPack && (
        <PackOpenModal
          state={packState}
          cards={revealedCards}
          revealIndex={revealIndex}
          headlineCard={headlineCard}
          onOpen={startOpening}
          onAdvance={advanceReveal}
          onCancel={closePack}
          onAccept={closePack}
        />
      )}

      {/* Merge consume → Level-up reveal */}
      {mergeReveal && (
        <MergeRevealModal
          card={mergeReveal.card}
          toLevel={mergeReveal.toLevel}
          onDone={() => setMergeReveal(null)}
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

      {/* Card art */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0 6px' }}>
        <Avatar src={card.avatar} emoji={card.emoji} size={56} radius={8} />
      </div>

      {/* Name */}
      <div style={{ color: '#fff', fontSize: 12, fontWeight: 500, textAlign: 'center', marginBottom: 2 }}>
        {card.name}{cardLevel > 1 && <span style={{ color: rarityColor, marginLeft: 4 }}>· LVL {cardLevel}</span>}
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
    { id: 'collection', label: 'Collection', icon: 'ti-cards' },
    { id: 'crew',       label: 'My Crew',    icon: 'ti-users' },
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
              padding: '10px 14px',
              background: active ? '#c9a84c18' : '#13131f',
              border: `0.5px solid ${active ? '#c9a84c66' : '#2a2a3a'}`,
              color: active ? '#c9a84c' : '#888',
              borderRadius: 12,
              fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
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

function PackOpenModal({ state, cards, revealIndex, headlineCard, onOpen, onAdvance, onCancel, onAccept }) {
  // The burst flash uses the rarest card's color so the big moment feels
  // coherent with the headline reveal at the end of the sequence.
  const burstColor = headlineCard ? RARITY_COLORS[headlineCard.rarity] : '#c9a84c'
  const currentCard = state === 'revealing' && cards[revealIndex] ? cards[revealIndex] : null
  const currentColor = currentCard ? RARITY_COLORS[currentCard.rarity] : burstColor
  const isLast = revealIndex === cards.length - 1

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0a0a0f',
      display: 'flex',
      alignItems: 'stretch',      // sheet fills full viewport vertically
      justifyContent: 'center',   // centered horizontally
      zIndex: 300,
      // Drive --rarity for all keyframes inside.
      '--rarity': state === 'revealing' ? currentColor : burstColor,
    }}>
      {/* Rarity-colored full-screen flash at the burst moment. */}
      {state === 'opening' && (
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: burstColor,
          opacity: 0,
          animation: 'rarityFlash 0.9s ease-out 1.1s forwards',
        }} />
      )}

      {/* Sheet stretches to full viewport. Content sits near the top so
          there's no dim band above the reveal. */}
      <div style={{
        textAlign: 'center', padding: '60px 24px 100px',
        width: '100%', maxWidth: 390,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}>
        {state === 'idle' && (
          <>
            <div style={{
              fontSize: 84, marginBottom: 20,
              animation: 'packIdle 2s ease-in-out infinite',
              filter: 'drop-shadow(0 0 16px rgba(201,168,76,0.4))',
            }}>🎴</div>
            <div style={{ color: '#c9a84c', fontSize: 20, fontWeight: 500, marginBottom: 8 }}>Commissary Pack</div>
            <div style={{ color: '#888', fontSize: 14, marginBottom: 32 }}>3 cards · guaranteed 1 Uncommon+</div>
            <button className="btn btn-primary btn-full" style={{ padding: 16, fontSize: 15, marginBottom: 12 }} onClick={onOpen}>
              Open Pack!
            </button>
            <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={onCancel}>Cancel</button>
          </>
        )}

        {state === 'opening' && (
          <>
            {/* Pack chains 3 animations: shake (0.9s) → charge (0.4s @0.9s) → burst (0.3s @1.3s) */}
            <div style={{
              fontSize: 90, marginBottom: 20,
              animation: 'packShakeBuildup 0.9s ease-in-out forwards, packCharge 0.4s ease-in 0.9s forwards, packBurst 0.3s ease-out 1.3s forwards',
            }}>🎴</div>
            <div style={{ color: burstColor, fontSize: 14, letterSpacing: 2, opacity: 0.8 }}>OPENING...</div>
            {/* Reserve space so layout doesn't jump when buttons appear later */}
            <div style={{ height: 110 }} />
          </>
        )}

        {state === 'revealing' && currentCard && (
          <div
            // Tap anywhere in this area to advance — easier than hitting the button on mobile.
            onClick={onAdvance}
            style={{ cursor: 'pointer' }}
          >
            {/* "CARD 2 / 3" progress chip */}
            <div style={{
              color: '#888', fontSize: 10, letterSpacing: 2,
              fontWeight: 700, marginBottom: 4,
            }}>
              CARD {revealIndex + 1} / {cards.length}
            </div>
            <RevealedCard
              // Remount on advance so the entrance animations re-fire.
              key={currentCard.id}
              card={currentCard}
              rarityColor={currentColor}
              cta={isLast ? 'See Your Pack' : 'Next Card'}
              onAccept={(e) => { e.stopPropagation(); onAdvance() }}
            />
            <div style={{
              color: '#555', fontSize: 11, letterSpacing: 1,
              marginTop: 4, opacity: 0,
              animation: 'logLineIn 0.4s ease 1.1s forwards',
            }}>
              Tap anywhere to continue
            </div>
          </div>
        )}

        {state === 'revealed' && (
          <RevealedDeckSummary cards={cards} onAccept={onAccept} />
        )}
      </div>
    </div>
  )
}

function RevealedDeckSummary({ cards, onAccept }) {
  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{
        color: '#c9a84c', fontSize: 18, fontWeight: 600, letterSpacing: 1,
        marginBottom: 18,
        opacity: 0, animation: 'logLineIn 0.4s ease forwards',
      }}>
        Pack Opened
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: 8, marginBottom: 24,
      }}>
        {cards.map((c, i) => {
          const color = RARITY_COLORS[c.rarity]
          return (
            <div key={c.id} style={{
              background: '#13131f',
              border: `0.5px solid ${color}44`,
              borderRadius: 12, padding: 10,
              opacity: 0, animation: `logLineIn 0.35s ease ${0.1 + i * 0.1}s forwards`,
            }}>
              <div style={{ height: 2, background: color, borderRadius: 1, marginBottom: 8 }} />
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                <Avatar src={c.avatar} emoji={c.emoji} size={42} radius={6} />
              </div>
              <div style={{ color: '#fff', fontSize: 11, fontWeight: 500, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
              <div style={{ color, fontSize: 9, textAlign: 'center', textTransform: 'capitalize', marginTop: 2 }}>{c.rarity}</div>
            </div>
          )
        })}
      </div>
      <button className="btn btn-primary btn-full"
        style={{ padding: 14, opacity: 0, animation: 'logLineIn 0.4s ease 0.45s forwards' }}
        onClick={onAccept}>
        Add to Collection
      </button>
    </div>
  )
}

function RevealedCard({ card, rarityColor, onAccept, cta = 'Add to Collection' }) {
  const tier         = RARITY_TIER[card.rarity] ?? 0
  const sparkleCount = 4 + tier * 2          // 4, 6, 8, 10, 12
  const ringCount    = tier >= 4 ? 3 : tier >= 2 ? 2 : 1

  return (
    <div style={{ position: 'relative' }}>
      {/* Expanding rarity rings — staggered for higher tiers */}
      {Array.from({ length: ringCount }).map((_, i) => (
        <div key={`ring-${i}`} aria-hidden="true" style={{
          position: 'absolute',
          left: '50%', top: 60,
          width: 100, height: 100,
          borderRadius: '50%',
          border: `2px solid ${rarityColor}`,
          pointerEvents: 'none',
          animation: `rarityRingExpand 1.2s ease-out ${i * 0.18}s forwards`,
          opacity: 0,
        }} />
      ))}

      {/* Sparkle particles radiating outward */}
      {Array.from({ length: sparkleCount }).map((_, i) => {
        const angle    = (i / sparkleCount) * Math.PI * 2
        const distance = 70 + ((i * 13) % 35)   // deterministic-but-varied
        return (
          <div key={`spark-${i}`} aria-hidden="true" style={{
            position: 'absolute',
            left: 'calc(50% - 3px)', top: 'calc(60px - 3px)',
            width: 6, height: 6, borderRadius: '50%',
            background: rarityColor,
            boxShadow: `0 0 6px ${rarityColor}`,
            pointerEvents: 'none',
            opacity: 0,
            animation: `sparkleFloat 1.4s ease-out ${0.1 + (i * 0.03)}s forwards`,
            '--dx': `${Math.cos(angle) * distance}px`,
            '--dy': `${Math.sin(angle) * distance}px`,
          }} />
        )
      })}

      {/* Card art — bounces in */}
      <div style={{
        marginTop: 16,
        marginBottom: 8,
        animation: 'cardRevealBounce 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        filter: `drop-shadow(0 0 14px ${rarityColor})`,
        display: 'flex', justifyContent: 'center',
      }}>
        <Avatar src={card.avatar} emoji={card.emoji} size={120} radius={14} />
      </div>

      {/* Rarity bar */}
      <div style={{
        height: 3, background: rarityColor,
        borderRadius: 2, margin: '8px auto 16px', width: 80,
        opacity: 0, animation: 'logLineIn 0.4s ease 0.5s forwards',
      }} />

      <div style={{
        color: '#fff', fontSize: 22, fontWeight: 500, marginBottom: 4,
        opacity: 0, animation: 'logLineIn 0.4s ease 0.55s forwards',
      }}>{card.name}</div>

      <div style={{
        color: rarityColor, fontSize: 14, textTransform: 'capitalize', marginBottom: 12,
        fontWeight: 600, letterSpacing: 2,
        opacity: 0,
        animation: `logLineIn 0.4s ease 0.65s forwards${tier >= 3 ? ', labelGlow 1.6s ease-in-out 1s infinite' : ''}`,
      }}>{card.rarity}</div>

      <div style={{
        color: '#c9a84c', fontSize: 13,
        background: '#c9a84c18',
        border: '0.5px solid #c9a84c44',
        borderRadius: 12, padding: '6px 16px',
        display: 'inline-block', marginBottom: 24,
        opacity: 0, animation: 'logLineIn 0.4s ease 0.8s forwards',
      }}>{card.special}</div>

      <button className="btn btn-primary btn-full"
        style={{ padding: 14, marginBottom: 10, opacity: 0, animation: 'logLineIn 0.4s ease 1s forwards' }}
        onClick={onAccept}>
        {cta}
      </button>
    </div>
  )
}
