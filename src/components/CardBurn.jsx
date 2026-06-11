import React, { useEffect, useRef, useState } from 'react'

// One-shot fire burn that engulfs a card — the visual for the burn-for-tokens
// flow (docs/skill-cards-spec.md §7). Wrap the card content; when `active` flips
// true the children char + shrink while flames and embers rise over them, then
// `onDone` fires (~1.1s). Pure CSS keyframes (burnCardChar/burnFlame/burnEmber/
// burnGlow in App.css) — a single short-lived overlay, cheap on mobile.
//
//   <CardBurn active={burning} onDone={() => removeCard()}>
//     <SkillCardTile ... />
//   </CardBurn>
export function CardBurn({ active, onDone, duration = 1600, children }) {
  const fired = useRef(false)
  const videoRef = useRef(null)
  useEffect(() => {
    if (!active || fired.current) return
    fired.current = true
    if (videoRef.current) { try { videoRef.current.currentTime = 0; videoRef.current.play() } catch {} }
    const t = setTimeout(() => onDone && onDone(), duration)
    return () => clearTimeout(t)
  }, [active, duration, onDone])

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{
        animation: active ? `burnCardChar ${duration}ms ease-in forwards` : 'none',
        willChange: active ? 'transform, opacity, filter' : 'auto',
      }}>
        {children}
      </div>
      {active && (
        <>
          {/* CSS heat glow + embers play UNDER the video — and stand in as the
              fallback if the clip can't load. */}
          <BurnOverlay duration={duration} />
          {/* Real fire (keyed to black) screen-blended over the card — black drops
              out, only the flames show. Slightly oversized so they overhang. */}
          <video ref={videoRef} src="/fire-burn.mp4" muted playsInline autoPlay
            style={{
              position: 'absolute', left: '-14%', top: '-22%', width: '128%', height: '132%',
              objectFit: 'cover', mixBlendMode: 'screen', pointerEvents: 'none', borderRadius: 8,
            }} />
        </>
      )}
    </div>
  )
}

// Heat glow + drifting embers that play UNDER the fire video (and stand in as the
// fallback if the clip can't load). Positions are index-derived (no RNG) so it
// renders identically every time. The big flames come from the video now.
function BurnOverlay({ duration }) {
  const embers = Array.from({ length: 16 })
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {/* heat glow */}
      <div style={{
        position: 'absolute', inset: -12, borderRadius: 16, mixBlendMode: 'screen',
        background: 'radial-gradient(circle at 50% 70%, rgba(255,150,40,0.6), rgba(255,80,20,0.25) 45%, transparent 72%)',
        animation: `burnGlow ${duration}ms ease-out forwards`,
      }} />
      {/* embers */}
      {embers.map((_, i) => {
        const left = (i * 37) % 92 + 4            // spread across the width
        const ex   = (((i * 53) % 60) - 30)        // horizontal drift, −30..30px
        const delay = (i * 47) % 500
        return (
          <div key={`e${i}`} style={{
            position: 'absolute', left: `${left}%`, bottom: '8%', width: 4, height: 4, borderRadius: '50%',
            background: i % 3 === 0 ? '#ffd24a' : '#ff7a2a', boxShadow: '0 0 5px #ff8a2a',
            mixBlendMode: 'screen', '--ex': `${ex}px`,
            animation: `burnEmber ${duration + 250}ms ease-out ${delay}ms forwards`,
          }} />
        )
      })}
    </div>
  )
}

// Dev-only floating preview so you can watch the burn without the Phase 3 flow.
// Mounted in App behind isDevMode. Tap the card to set it alight; it reappears.
export function CardBurnPreview() {
  const [burning, setBurning] = useState(false)
  return (
    <div style={{ position: 'fixed', right: 12, bottom: 90, zIndex: 400, textAlign: 'center' }}>
      <div style={{ color: '#ff8a2a', fontSize: 8, fontWeight: 800, letterSpacing: 1, marginBottom: 4 }}>🔥 BURN TEST</div>
      <div onClick={() => !burning && setBurning(true)} style={{ cursor: 'pointer' }}>
        <CardBurn active={burning} onDone={() => setBurning(false)}>
          <div style={{
            width: 78, height: 108, borderRadius: 10, border: '1.5px solid #c9a84c',
            background: 'linear-gradient(160deg, #2a2436, #14101c)', display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 30 }}>🔪</span>
            <span style={{ color: '#c9a84c', fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>SHIV</span>
          </div>
        </CardBurn>
      </div>
    </div>
  )
}
