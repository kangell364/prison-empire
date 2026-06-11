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
export function CardBurn({ active, onDone, duration = 1100, children }) {
  const fired = useRef(false)
  useEffect(() => {
    if (!active || fired.current) return
    fired.current = true
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
      {active && <BurnOverlay duration={duration} />}
    </div>
  )
}

// Flames along the bottom rising up + drifting embers + an orange glow. Positions
// are index-derived (deterministic, no RNG) so it renders identically every time.
function BurnOverlay({ duration }) {
  const flames = [
    { left: '2%',  w: '42%', h: '120%', delay: 0 },
    { left: '24%', w: '44%', h: '135%', delay: 90 },
    { left: '48%', w: '42%', h: '125%', delay: 40 },
    { left: '66%', w: '40%', h: '130%', delay: 140 },
    { left: '12%', w: '38%', h: '110%', delay: 200 },
  ]
  const embers = Array.from({ length: 16 })
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {/* heat glow behind the flames */}
      <div style={{
        position: 'absolute', inset: -12, borderRadius: 16, mixBlendMode: 'screen',
        background: 'radial-gradient(circle at 50% 70%, rgba(255,150,40,0.6), rgba(255,80,20,0.25) 45%, transparent 72%)',
        animation: `burnGlow ${duration}ms ease-out forwards`,
      }} />
      {/* flames */}
      {flames.map((f, i) => (
        <div key={i} style={{
          position: 'absolute', left: f.left, bottom: '-8%', width: f.w, height: f.h,
          background: 'radial-gradient(ellipse at 50% 100%, #fff4bd 0%, #ffbe3a 28%, #ff6a1f 58%, #cc1f0d 82%, transparent 100%)',
          borderRadius: '50% 50% 46% 46% / 72% 72% 28% 28%',
          transformOrigin: '50% 100%', filter: 'blur(1px)', mixBlendMode: 'screen',
          animation: `burnFlame ${duration}ms ease-in ${f.delay}ms forwards`,
        }} />
      ))}
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
