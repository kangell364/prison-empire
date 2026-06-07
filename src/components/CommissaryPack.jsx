import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CARDS_COLLECTION, RARITY_COLORS } from '../data/gameData'
import { addCards } from '../state/cardsStore'
import { usePacks, accrueNow, msUntilNextFree, openOnePack, devFillPacks, MAX_STORED } from '../state/packsStore'
import { isDevMode } from '../devMode'
import { sfx } from '../sounds'
import { Avatar } from './Avatar'

// The Commissary Pack — the free-every-24h common-card pack. This file owns the
// whole experience end to end:
//   • Section banner (Cards + Store): your unopened-pack stash + the free-pack
//     countdown. Auto-deposits a free pack when the timer elapses.
//   • Inventory modal: a grid of every unopened pack you hold; tap one to open.
//   • Spin-open: black screen → pack FRONT → tap → the pack spins flipping
//     front↔back (slow → fast) → bursts open → reveals 5 random COMMON cards
//     one at a time → collect.
//
// The pull pool is "100% of the current common cards" — every common-rarity card
// in CARDS_COLLECTION. New commons added to the catalog join the pool for free.

const RARITY_TIER     = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }
const CARDS_PER_PACK  = 5
const PACK_FRONT      = '/pack-front.webp'
const PACK_BACK       = '/pack-back.webp'
const PACK_RATIO      = 0.53          // width / height of the pack art

// The live common-card pool. Recomputed each open so catalog additions are
// picked up automatically — no list to maintain.
function commonPool() { return CARDS_COLLECTION.filter(c => c.rarity === 'common') }

// Five fully-random pulls from the common pool (with replacement — duplicates
// are wanted, they grow your stack toward a merge).
function pickPackCards() {
  const pool = commonPool()
  if (pool.length === 0) return []
  const picks = []
  for (let i = 0; i < CARDS_PER_PACK; i++) {
    picks.push(pool[Math.floor(Math.random() * pool.length)])
  }
  return picks
}

function fmtCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

// A 1s ticker that also keeps the free-pack timer accruing. Returns `now` so the
// countdown re-renders each second.
function useTick() {
  const [, setNow] = useState(Date.now())
  useEffect(() => {
    accrueNow()
    const id = setInterval(() => { accrueNow(); setNow(Date.now()) }, 1000)
    const onVis = () => { if (!document.hidden) { accrueNow(); setNow(Date.now()) } }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])
}

// =====================================================================
// Section banner — drops into the Cards screen and the Commissary Store.
// =====================================================================
export function CommissaryPack({ style }) {
  useTick()
  const { unopened } = usePacks()
  const [invOpen, setInvOpen] = useState(false)
  const remaining = msUntilNextFree()
  const full = remaining >= 24 * 60 * 60 * 1000 && unopened >= MAX_STORED

  return (
    <>
      <div
        onClick={() => { sfx.tap?.(); setInvOpen(true) }}
        style={{
          margin: '14px 16px 0', background: 'linear-gradient(135deg, #1a1510, #251e0a)',
          border: '0.5px solid #c9a84c44', borderRadius: 20, padding: 14,
          display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', ...style,
        }}
      >
        {/* Pack art thumbnail with a FREE flag */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img src={PACK_FRONT} alt="Commissary Pack" style={{ height: 76, width: 'auto', display: 'block', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }} />
          <div style={{
            position: 'absolute', top: -6, left: -6, background: '#2ecc71', color: '#06210f',
            fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '2px 6px', borderRadius: 6,
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          }}>FREE</div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#c9a84c', fontSize: 15, fontWeight: 600 }}>Commissary Pack</div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>5 random common cards</div>
          <div style={{ color: full ? '#2ecc71' : '#7a7468', fontSize: 11, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
            {full ? 'Stash full' : <>Next free pack in <span style={{ color: '#c9a84c' }}>{fmtCountdown(remaining)}</span></>}
          </div>
        </div>

        {/* Stash count */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{unopened}</div>
          <div style={{ color: '#7a7468', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>IN STASH</div>
          <div className="btn btn-gold" style={{ padding: '6px 12px', marginTop: 8, fontSize: 12, pointerEvents: 'none' }}>
            {unopened > 0 ? 'Open' : 'View'}
          </div>
        </div>
      </div>

      {invOpen && <PackInventoryModal onClose={() => setInvOpen(false)} />}
    </>
  )
}

// =====================================================================
// Inventory — every unopened pack you hold; tap one to open it.
// =====================================================================
function PackInventoryModal({ onClose }) {
  useTick()
  const { unopened } = usePacks()
  const [opening, setOpening] = useState(false)
  const remaining = msUntilNextFree()

  const close = () => { sfx.tap?.(); onClose() }

  // Portal to <body> — the Cards/Store screens sit inside transformed,
  // scroll-height ancestors, which would otherwise capture position:fixed and
  // strand a centered overlay off-screen below the fold.
  return createPortal((
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', zIndex: 300, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 6px' }}>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Commissary Packs ({unopened})</div>
        <button onClick={close} aria-label="Close" style={{
          width: 36, height: 36, borderRadius: 10, background: '#1e1e2a', border: '0.5px solid #2a2a3a',
          color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}><i className="ti ti-x" /></button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 16px 4px' }}>
        <div style={{ color: '#7a7468', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          {remaining >= 24 * 60 * 60 * 1000 && unopened >= MAX_STORED
            ? 'Stash full — open one to restart the free timer.'
            : <>Next free pack in <span style={{ color: '#c9a84c' }}>{fmtCountdown(remaining)}</span></>}
        </div>
        {/* DEV ONLY — load a full stash for testing. Gated by isDevMode() so
            normal players never see it (on by default on localhost; ?dev=1 on
            the live site). */}
        {isDevMode() && (
          <button onClick={() => { sfx.tap?.(); devFillPacks() }} style={{
            flexShrink: 0, background: '#1e1e2a', border: '0.5px solid #2a2a3a', color: '#888',
            fontSize: 11, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
          }}>+{MAX_STORED} (dev)</button>
        )}
      </div>

      {unopened === 0 ? (
        <div style={{ margin: '40px 16px', textAlign: 'center', color: '#555' }}>
          <img src={PACK_FRONT} alt="" style={{ height: 140, opacity: 0.25, filter: 'grayscale(1)' }} />
          <div style={{ marginTop: 16, fontSize: 13 }}>No unopened packs.</div>
          <div style={{ marginTop: 4, fontSize: 12 }}>Your next free pack is on the way.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: '12px 16px 120px' }}>
          {Array.from({ length: unopened }).map((_, i) => (
            <button key={i} onClick={() => { sfx.tap?.(); setOpening(true) }} style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              animation: `logLineIn 0.3s ease ${i * 0.04}s both`,
            }}>
              <img src={PACK_FRONT} alt="Unopened pack" style={{ width: '100%', height: 'auto', display: 'block', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }} />
            </button>
          ))}
        </div>
      )}

      {opening && <PackSpinOpenModal onClose={() => setOpening(false)} />}
    </div>
  ), document.body)
}

// =====================================================================
// Spin-open — black screen, pack flips front↔back accelerating, bursts open,
// reveals 5 commons one at a time.
// =====================================================================
function PackSpinOpenModal({ onClose }) {
  // 'idle' (pack front, tap to open) → 'spinning' (3D flip, slow→fast) →
  // 'bursting' (flash) → 'revealing' (card-by-card) → 'revealed' (summary).
  const [phase, setPhase] = useState('idle')
  const [cards, setCards] = useState([])
  const [revealIndex, setRevealIndex] = useState(0)
  const flipRef = useRef(null)
  const rafRef = useRef(0)

  const PH = 380, PW = Math.round(PH * PACK_RATIO)

  const startOpen = () => {
    if (phase !== 'idle') return
    if (!openOnePack()) { onClose(); return }     // nothing to open
    const picks = pickPackCards()
    addCards(picks.map(c => c.id), 1)              // reward banked the instant it's torn open
    setCards(picks)
    setRevealIndex(0)
    setPhase('spinning')
    sfx.shake?.()
  }

  // The accelerating flip, driven by rAF mutating the transform directly.
  useEffect(() => {
    if (phase !== 'spinning') return
    const HOLD_MS = 220                            // beat on the FRONT before it turns
    const SPIN_MS = 2900                           // then a long slow-to-fast spin
    const MAX_DEG = 2880                           // 8 turns; multiple of 360 → lands on FRONT
    let start = null
    const tick = (ts) => {
      if (start == null) start = ts
      const elapsed = ts - start
      // Hold dead-still on the front first, then ease in CUBICALLY so the early
      // turns are gentle (front stays readable) and it only whips around near the end.
      const t = Math.max(0, Math.min(1, (elapsed - HOLD_MS) / SPIN_MS))
      const ease = t * t * t                       // easeInCubic → much slower start than quad
      const angle = MAX_DEG * ease
      const scale = 1 + 0.16 * ease                // swells only as it speeds up
      if (flipRef.current) flipRef.current.style.transform = `scale(${scale}) rotateY(${angle}deg)`
      if (t < 1) { rafRef.current = requestAnimationFrame(tick) }
      else {
        sfx.burst?.()
        setPhase('bursting')
        setTimeout(() => { setPhase('revealing'); sfx.reveal?.(0) }, 300)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase])

  const advanceReveal = () => {
    if (phase !== 'revealing') return
    if (revealIndex < cards.length - 1) {
      const next = revealIndex + 1
      setRevealIndex(next)
      sfx.reveal?.(RARITY_TIER[cards[next].rarity] ?? 0)
    } else {
      setPhase('revealed')
    }
  }

  const currentCard = phase === 'revealing' ? cards[revealIndex] : null
  const isLast = revealIndex === cards.length - 1
  const flashColor = '#c9a84c'

  return createPortal((
    <div style={{ position: 'fixed', inset: 0, background: '#08080c', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {/* Close (hidden during the spin so it can't be interrupted) */}
      {(phase === 'idle' || phase === 'revealed') && (
        <button onClick={() => { sfx.tap?.(); onClose() }} aria-label="Close" style={{
          position: 'absolute', top: 16, right: 16, zIndex: 5,
          width: 36, height: 36, borderRadius: 10, background: '#1e1e2a', border: '0.5px solid #2a2a3a',
          color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}><i className="ti ti-x" /></button>
      )}

      {/* Burst flash */}
      {phase === 'bursting' && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: flashColor, animation: 'rarityFlash 0.5s ease-out forwards', '--rarity': flashColor }} />
      )}

      {/* IDLE / SPINNING / BURSTING — the pack itself */}
      {(phase === 'idle' || phase === 'spinning' || phase === 'bursting') && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ perspective: 1200, display: 'inline-block' }}>
            <div
              onClick={startOpen}
              style={{
                width: PW, height: PH, position: 'relative', margin: '0 auto',
                transformStyle: 'preserve-3d', cursor: phase === 'idle' ? 'pointer' : 'default',
                transform: 'rotateY(0deg)',
                animation: phase === 'idle' ? 'packIdle 2.4s ease-in-out infinite' : 'none',
                filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.7))',
                willChange: 'transform',
              }}
              ref={flipRef}
            >
              <img src={PACK_FRONT} alt="Pack front" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }} />
              <img src={PACK_BACK} alt="Pack back" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }} />
            </div>
          </div>
          <div style={{ marginTop: 28, color: phase === 'idle' ? '#c9a84c' : '#7a7468', fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>
            {phase === 'idle' ? 'TAP TO OPEN' : 'OPENING…'}
          </div>
        </div>
      )}

      {/* REVEALING — one card at a time, tap to advance */}
      {phase === 'revealing' && currentCard && (
        <div onClick={advanceReveal} style={{ cursor: 'pointer', width: '100%', maxWidth: 390, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: 10, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>
            CARD {revealIndex + 1} / {cards.length}
          </div>
          <RevealedCard
            key={revealIndex}
            card={currentCard}
            rarityColor={RARITY_COLORS[currentCard.rarity]}
            cta={isLast ? 'See Your Pull' : 'Next Card'}
            onAccept={(e) => { e.stopPropagation(); advanceReveal() }}
          />
          <div style={{ color: '#555', fontSize: 11, letterSpacing: 1, marginTop: 4, opacity: 0, animation: 'logLineIn 0.4s ease 1.1s forwards' }}>
            Tap anywhere to continue
          </div>
        </div>
      )}

      {/* REVEALED — the 5-card summary */}
      {phase === 'revealed' && (
        <div style={{ width: '100%', maxWidth: 390, padding: '40px 24px', textAlign: 'center' }}>
          <RevealedDeckSummary cards={cards} onAccept={() => { sfx.tap?.(); onClose() }} />
        </div>
      )}
    </div>
  ), document.body)
}

function RevealedDeckSummary({ cards, onAccept }) {
  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ color: '#c9a84c', fontSize: 18, fontWeight: 600, letterSpacing: 1, marginBottom: 18, opacity: 0, animation: 'logLineIn 0.4s ease forwards' }}>
        Pack Opened
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 24 }}>
        {cards.map((c, i) => {
          const color = RARITY_COLORS[c.rarity]
          return (
            <div key={i} style={{
              background: '#13131f', border: `0.5px solid ${color}44`, borderRadius: 12, padding: 10,
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
      <button className="btn btn-primary btn-full" style={{ padding: 14, opacity: 0, animation: 'logLineIn 0.4s ease 0.55s forwards' }} onClick={onAccept}>
        Collect
      </button>
    </div>
  )
}

function RevealedCard({ card, rarityColor, onAccept, cta = 'Add to Collection' }) {
  const tier         = RARITY_TIER[card.rarity] ?? 0
  const sparkleCount = 4 + tier * 2
  const ringCount    = tier >= 4 ? 3 : tier >= 2 ? 2 : 1

  return (
    <div style={{ position: 'relative' }}>
      {Array.from({ length: ringCount }).map((_, i) => (
        <div key={`ring-${i}`} aria-hidden="true" style={{
          position: 'absolute', left: '50%', top: 60, width: 100, height: 100, borderRadius: '50%',
          border: `2px solid ${rarityColor}`, pointerEvents: 'none',
          animation: `rarityRingExpand 1.2s ease-out ${i * 0.18}s forwards`, opacity: 0,
        }} />
      ))}

      {Array.from({ length: sparkleCount }).map((_, i) => {
        const angle    = (i / sparkleCount) * Math.PI * 2
        const distance = 70 + ((i * 13) % 35)
        return (
          <div key={`spark-${i}`} aria-hidden="true" style={{
            position: 'absolute', left: 'calc(50% - 3px)', top: 'calc(60px - 3px)',
            width: 6, height: 6, borderRadius: '50%', background: rarityColor,
            boxShadow: `0 0 6px ${rarityColor}`, pointerEvents: 'none', opacity: 0,
            animation: `sparkleFloat 1.4s ease-out ${0.1 + (i * 0.03)}s forwards`,
            '--dx': `${Math.cos(angle) * distance}px`, '--dy': `${Math.sin(angle) * distance}px`,
          }} />
        )
      })}

      <div style={{
        marginTop: 16, marginBottom: 8,
        animation: 'cardRevealBounce 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        filter: `drop-shadow(0 0 14px ${rarityColor})`, display: 'flex', justifyContent: 'center',
      }}>
        <Avatar src={card.avatar} emoji={card.emoji} size={180} radius={21} />
      </div>

      <div style={{ height: 3, background: rarityColor, borderRadius: 2, margin: '8px auto 16px', width: 80, opacity: 0, animation: 'logLineIn 0.4s ease 0.5s forwards' }} />

      <div style={{ color: '#fff', fontSize: 22, fontWeight: 500, marginBottom: 4, opacity: 0, animation: 'logLineIn 0.4s ease 0.55s forwards' }}>{card.name}</div>

      <div style={{
        color: rarityColor, fontSize: 14, textTransform: 'capitalize', marginBottom: 12, fontWeight: 600, letterSpacing: 2, opacity: 0,
        animation: `logLineIn 0.4s ease 0.65s forwards${tier >= 3 ? ', labelGlow 1.6s ease-in-out 1s infinite' : ''}`,
      }}>{card.rarity}</div>

      {card.special && (
        <div style={{
          color: '#c9a84c', fontSize: 13, background: '#c9a84c18', border: '0.5px solid #c9a84c44',
          borderRadius: 12, padding: '6px 16px', display: 'inline-block', marginBottom: 24, opacity: 0, animation: 'logLineIn 0.4s ease 0.8s forwards',
        }}>{card.special}</div>
      )}

      <button className="btn btn-primary btn-full" style={{ padding: 14, marginBottom: 10, opacity: 0, animation: 'logLineIn 0.4s ease 1s forwards' }} onClick={onAccept}>
        {cta}
      </button>
    </div>
  )
}
