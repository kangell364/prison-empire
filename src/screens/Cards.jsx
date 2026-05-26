import React, { useState } from 'react'
import { CARDS_COLLECTION, RARITY_COLORS } from '../data/gameData'

export default function Cards() {
  const [selectedCard, setSelectedCard] = useState(null)
  const [showPack, setShowPack] = useState(false)
  const [packOpened, setPackOpened] = useState(false)
  const [revealedCard, setRevealedCard] = useState(null)

  const openPack = () => {
    setShowPack(true)
    setPackOpened(false)
    setRevealedCard(null)
  }

  const revealPack = () => {
    const locked = CARDS_COLLECTION.filter(c => !c.owned)
    const card = locked[Math.floor(Math.random() * locked.length)] || CARDS_COLLECTION[4]
    setRevealedCard(card)
    setPackOpened(true)
  }

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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ textAlign: 'center', padding: 24, width: '100%', maxWidth: 340 }}>
            {!packOpened ? (
              <>
                <div style={{ fontSize: 80, marginBottom: 20, animation: 'pulse 1s infinite' }}>🎴</div>
                <div style={{ color: '#c9a84c', fontSize: 20, fontWeight: 500, marginBottom: 8 }}>Commissary Pack</div>
                <div style={{ color: '#888', fontSize: 14, marginBottom: 32 }}>Tap to reveal your cards</div>
                <button className="btn btn-primary btn-full" style={{ padding: 16, fontSize: 15, marginBottom: 12 }} onClick={revealPack}>
                  Open Pack!
                </button>
                <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={() => setShowPack(false)}>Cancel</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 80, marginBottom: 8 }}>{revealedCard?.emoji}</div>
                <div style={{ height: 3, background: RARITY_COLORS[revealedCard?.rarity], borderRadius: 2, margin: '0 auto 16px', width: 80 }} />
                <div style={{ color: '#fff', fontSize: 22, fontWeight: 500, marginBottom: 4 }}>{revealedCard?.name}</div>
                <div style={{ color: RARITY_COLORS[revealedCard?.rarity], fontSize: 14, textTransform: 'capitalize', marginBottom: 8 }}>{revealedCard?.rarity}</div>
                <div style={{ color: '#c9a84c', fontSize: 13, background: '#c9a84c18', border: '0.5px solid #c9a84c44', borderRadius: 12, padding: '6px 16px', display: 'inline-block', marginBottom: 24 }}>{revealedCard?.special}</div>
                <button className="btn btn-primary btn-full" style={{ padding: 14, marginBottom: 10 }} onClick={() => setShowPack(false)}>
                  Add to Collection
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
