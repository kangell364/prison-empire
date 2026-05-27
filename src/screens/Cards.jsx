import React, { useState, useEffect } from 'react'
import { CARDS_COLLECTION, RARITY_COLORS } from '../data/gameData'
import { sfx } from '../sounds'

const RARITY_TIER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }
const PACK_OPEN_DURATION_MS = 1600  // total time of shake → charge → burst
const PACK_BURST_AT_MS      = 1300  // when the burst animation kicks in

export default function Cards() {
  const [selectedCard, setSelectedCard]   = useState(null)
  const [showPack, setShowPack]           = useState(false)
  // 'idle' (user prompted to open) | 'opening' (shake/charge/burst) | 'revealed'
  const [packState, setPackState]         = useState('idle')
  const [revealedCard, setRevealedCard]   = useState(null)

  const openPack = () => {
    setShowPack(true)
    setPackState('idle')
    setRevealedCard(null)
  }

  const closePack = () => {
    setShowPack(false)
    setPackState('idle')
    setRevealedCard(null)
  }

  const startOpening = () => {
    // Pick the card now so the burst animation can use its rarity color.
    const locked = CARDS_COLLECTION.filter(c => !c.owned)
    const card = locked[Math.floor(Math.random() * locked.length)] || CARDS_COLLECTION[4]
    setRevealedCard(card)
    setPackState('opening')
    sfx.shake()
  }

  // Transition opening → revealed after the burst animation completes.
  // Also fires the burst sound on the matching frame and the reveal ping
  // (pitched by rarity tier) on transition.
  useEffect(() => {
    if (packState !== 'opening') return
    const tier = revealedCard ? RARITY_TIER[revealedCard.rarity] ?? 0 : 0
    const burstId  = setTimeout(() => sfx.burst(), PACK_BURST_AT_MS)
    const revealId = setTimeout(() => {
      setPackState('revealed')
      sfx.reveal(tier)
    }, PACK_OPEN_DURATION_MS)
    return () => { clearTimeout(burstId); clearTimeout(revealId) }
  }, [packState, revealedCard])

  return (
    <div className="scroll-area animate-in">

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

      {/* Filter */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {['All', 'Owned', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].map(f => (
          <div key={f} style={{ flexShrink: 0, background: f === 'All' ? '#c9a84c18' : '#13131f', border: `0.5px solid ${f === 'All' ? '#c9a84c44' : '#2a2a3a'}`, borderRadius: 20, padding: '5px 14px', color: f === 'All' ? '#c9a84c' : '#888', fontSize: 12, cursor: 'pointer' }}>{f}</div>
        ))}
      </div>

      {/* Cards Grid */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Your Collection ({CARDS_COLLECTION.filter(c => c.owned).length}/{CARDS_COLLECTION.length})</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {CARDS_COLLECTION.map(card => (
            <div key={card.id} onClick={() => setSelectedCard(card)} style={{
              background: '#13131f',
              border: `0.5px solid ${card.owned ? RARITY_COLORS[card.rarity] + '44' : '#1e1e2a'}`,
              borderRadius: 16,
              padding: 14,
              cursor: 'pointer',
              opacity: card.owned ? 1 : 0.4,
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Rarity top bar */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: RARITY_COLORS[card.rarity] }} />

              {/* Card emoji */}
              <div style={{ fontSize: 40, textAlign: 'center', margin: '8px 0' }}>{card.owned ? card.emoji : '🔒'}</div>

              {/* Name */}
              <div style={{ color: card.owned ? '#fff' : '#555', fontSize: 12, fontWeight: 500, textAlign: 'center', marginBottom: 4 }}>{card.name}</div>

              {/* Rarity */}
              <div style={{ color: RARITY_COLORS[card.rarity], fontSize: 10, textAlign: 'center', textTransform: 'capitalize', marginBottom: 10 }}>{card.rarity}</div>

              {/* Stats */}
              {card.owned && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {[
                    { lbl: 'HST', val: card.hustle, color: '#c9a84c' },
                    { lbl: 'MSC', val: card.muscle, color: '#e74c3c' },
                    { lbl: 'SMT', val: card.smarts, color: '#4a9eff' },
                    { lbl: 'CRD', val: card.cred,   color: '#a855f7' },
                  ].map(s => (
                    <div key={s.lbl} style={{ background: '#1e1e2a', borderRadius: 6, padding: '3px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#555', fontSize: 9 }}>{s.lbl}</span>
                      <span style={{ color: s.color, fontSize: 11, fontWeight: 500 }}>{s.val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Card Detail Modal */}
      {selectedCard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }} onClick={() => setSelectedCard(null)}>
          <div style={{ background: '#13131f', borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 390 }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 20px' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ height: 3, background: RARITY_COLORS[selectedCard.rarity], borderRadius: 2, marginBottom: 20 }} />
              <div style={{ fontSize: 64, marginBottom: 8 }}>{selectedCard.emoji}</div>
              <div style={{ color: '#fff', fontSize: 20, fontWeight: 500 }}>{selectedCard.name}</div>
              <div style={{ color: RARITY_COLORS[selectedCard.rarity], fontSize: 13, textTransform: 'capitalize', marginTop: 4, marginBottom: 16 }}>{selectedCard.rarity}</div>
              <div style={{ background: '#c9a84c18', border: '0.5px solid #c9a84c44', borderRadius: 12, padding: '8px 16px', display: 'inline-block', marginBottom: 20 }}>
                <span style={{ color: '#c9a84c', fontSize: 13, fontWeight: 500 }}>{selectedCard.special}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {[
                  { lbl: 'Hustle', val: selectedCard.hustle, color: '#c9a84c', icon: 'ti-flame' },
                  { lbl: 'Muscle', val: selectedCard.muscle, color: '#e74c3c', icon: 'ti-barbell' },
                  { lbl: 'Smarts', val: selectedCard.smarts, color: '#4a9eff', icon: 'ti-brain' },
                  { lbl: 'Cred',   val: selectedCard.cred,   color: '#a855f7', icon: 'ti-star' },
                ].map(s => (
                  <div key={s.lbl} style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                    <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 20, display: 'block', marginBottom: 4 }} />
                    <div style={{ color: s.color, fontSize: 22, fontWeight: 500 }}>{s.val}</div>
                    <div style={{ color: '#555', fontSize: 11 }}>{s.lbl}</div>
                  </div>
                ))}
              </div>
              <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={() => setSelectedCard(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Pack Opening Modal */}
      {showPack && (
        <PackOpenModal
          state={packState}
          card={revealedCard}
          onOpen={startOpening}
          onCancel={closePack}
          onAccept={closePack}
        />
      )}

    </div>
  )
}

function PackOpenModal({ state, card, onOpen, onCancel, onAccept }) {
  // When opening, use the about-to-be-revealed card's rarity color so the
  // burst feels coherent with the result. When idle, use gold.
  const rarityColor = card ? RARITY_COLORS[card.rarity] : '#c9a84c'

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.95)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 300,
      // Drive --rarity for all keyframes inside.
      '--rarity': rarityColor,
    }}>
      {/* Rarity-colored full-screen flash at the burst moment. */}
      {state === 'opening' && (
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: rarityColor,
          opacity: 0,
          animation: 'rarityFlash 0.9s ease-out 1.1s forwards',
        }} />
      )}

      {/* Sheet fills almost the entire viewport so there's no dim gap above
          the content — same treatment as the Battle Dice modal. */}
      <div style={{
        textAlign: 'center', padding: '40px 24px 100px',
        width: '100%', maxWidth: 390,
        minHeight: '85vh',
        position: 'relative',
        background: '#0a0a0f',
        borderRadius: 24,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
        {state === 'idle' && (
          <>
            <div style={{
              fontSize: 84, marginBottom: 20,
              animation: 'packIdle 2s ease-in-out infinite',
              filter: 'drop-shadow(0 0 16px rgba(201,168,76,0.4))',
            }}>🎴</div>
            <div style={{ color: '#c9a84c', fontSize: 20, fontWeight: 500, marginBottom: 8 }}>Commissary Pack</div>
            <div style={{ color: '#888', fontSize: 14, marginBottom: 32 }}>Tap to reveal your cards</div>
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
            <div style={{ color: rarityColor, fontSize: 14, letterSpacing: 2, opacity: 0.8 }}>OPENING...</div>
            {/* Reserve space so layout doesn't jump when buttons appear later */}
            <div style={{ height: 110 }} />
          </>
        )}

        {state === 'revealed' && card && (
          <RevealedCard card={card} rarityColor={rarityColor} onAccept={onAccept} />
        )}
      </div>
    </div>
  )
}

function RevealedCard({ card, rarityColor, onAccept }) {
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

      {/* Card emoji — bounces in */}
      <div style={{
        fontSize: 84,
        marginTop: 16,
        marginBottom: 8,
        animation: 'cardRevealBounce 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        filter: `drop-shadow(0 0 14px ${rarityColor})`,
      }}>{card.emoji}</div>

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
        Add to Collection
      </button>
    </div>
  )
}
