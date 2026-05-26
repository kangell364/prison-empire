import React from 'react'

const GOLD     = '#c9a84c'
const GOLD_HOT = '#f0d080'
const ORANGE   = '#f39c12'
const RED      = '#e74c3c'
const HOT_RED  = '#ff4747'

// Color + halo intensity escalate as an INCOMING attack gets close.
// OUTBOUND attacks stay gold (your move — anticipatory, not urgent).
function styleFor(variant, remaining, pct) {
  if (variant === 'outbound') {
    const isLanding = pct < 0.08
    return {
      color: isLanding ? GOLD_HOT : GOLD,
      halo: isLanding ? 0.7 : 0.2,
      haloDuration: 1.6,
    }
  }
  if (remaining <= 30)  return { color: HOT_RED, halo: 1.0, haloDuration: 0.6 }
  if (remaining <= 60)  return { color: RED,     halo: 0.7, haloDuration: 1.0 }
  if (remaining <= 300) return { color: ORANGE,  halo: 0.4, haloDuration: 1.8 }
  return                       { color: GOLD,    halo: 0,   haloDuration: 2.4 }
}

export function CountdownRing({
  remaining,
  total,
  size = 80,
  strokeWidth = 4,
  variant = 'incoming',
  label,
}) {
  const safe        = Math.max(0, remaining)
  const pct         = total > 0 ? safe / total : 0
  const radius      = (size / 2) - strokeWidth - 1
  const circ        = 2 * Math.PI * radius
  const offset      = (1 - pct) * circ

  const { color, halo, haloDuration } = styleFor(variant, safe, pct)

  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  const time = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* Pulsing halo for high-threat states */}
      {halo > 0.5 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: -6,
            borderRadius: '50%',
            border: `1.5px solid ${color}`,
            opacity: 0,
            animation: `ringHalo ${haloDuration}s ease-out infinite`,
          }}
        />
      )}

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="#1e1e2a"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: 'stroke-dashoffset 1s linear, stroke 0.5s, filter 0.5s',
            filter: halo > 0 ? `drop-shadow(0 0 ${4 + halo * 6}px ${color})` : 'none',
          }}
        />
      </svg>

      {/* Centered label */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          color,
          fontSize: size * 0.22,
          fontWeight: 700,
          letterSpacing: 0.5,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
          transition: 'color 0.5s',
        }}>{time}</div>
        {label && (
          <div style={{
            color: '#666',
            fontSize: size * 0.09,
            letterSpacing: 1.2,
            marginTop: 3,
            textTransform: 'uppercase',
          }}>{label}</div>
        )}
      </div>
    </div>
  )
}
