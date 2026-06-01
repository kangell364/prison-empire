import React, { useState, useEffect, useMemo } from 'react'
import { CARDS_COLLECTION, RARITY_COLORS } from '../data/gameData'
import { useCardCounts, addCards } from '../state/cardsStore'
import { sfx } from '../sounds'
import { Avatar } from './Avatar'

// The Commissary Pack — banner + the full open → reveal → collect machine,
// self-contained so it can drop into both the Cards screen and the Commissary
// Store view. Reads/writes the card store itself; no props required.

const RARITY_TIER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }
const PACK_OPEN_DURATION_MS = 1600  // total time of shake → charge → burst
const PACK_BURST_AT_MS      = 1300  // when the burst animation kicks in
const CARDS_PER_PACK        = 3

// Picks 3 cards for a pack reveal. Stacking changes the math — duplicates are
// valuable (they grow your stack toward merge), but we still pick 3 distinct
// cards per pack for variety, biased toward cards you don't own yet. Guarantees
// at least one Uncommon+, rarest reveals last for the big payoff.
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

export function CommissaryPack({ style }) {
  const counts = useCardCounts()
  // 'idle' → 'opening' (shake/charge/burst) → 'revealing' (one card at a time,
  // tap to advance) → 'revealed' (accept).
  const [showPack, setShowPack]           = useState(false)
  const [packState, setPackState]         = useState('idle')
  const [revealedCards, setRevealedCards] = useState([])
  const [revealIndex,   setRevealIndex]   = useState(0)

  // "Owned" for pack-pool purposes = has at least one Level 1 copy.
  const ownedSet = useMemo(() => {
    const s = new Set()
    for (const [k, v] of counts.entries()) {
      if (v > 0 && k.endsWith(':1')) s.add(Number(k.split(':')[0]))
    }
    return s
  }, [counts])

  // The burst flash uses the rarest card's color for a coherent payoff.
  const headlineCard = revealedCards[revealedCards.length - 1] || null

  const openPack = () => {
    setShowPack(true)
    setPackState('idle')
    setRevealedCards([])
    setRevealIndex(0)
  }

  const closePack = () => {
    // "Add to Collection" → increment stack count for each revealed card.
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

  // Transition opening → revealing after the burst completes.
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

  return (
    <>
      {/* Pack Banner */}
      <div style={{ margin: '14px 16px 0', background: 'linear-gradient(135deg, #1a1510, #251e0a)', border: '0.5px solid #c9a84c44', borderRadius: 20, padding: 16, display: 'flex', alignItems: 'center', gap: 14, ...style }}>
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
    </>
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
        <Avatar src={card.avatar} emoji={card.emoji} size={180} radius={21} />
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
