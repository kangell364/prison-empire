import React from 'react'

// Renders a player avatar — image if `src` is set, otherwise the emoji
// fallback. Standard sizing + styling so all the places that show a
// character look consistent (and adding artwork to a new character is
// just `avatar: '/path.jpg'` on its data).
//
//   <Avatar src={player.avatar} emoji={player.emoji} size={40} />
//
// Pass `style` to layer additional styling (drop-shadow, filter, etc.)
// onto the outer container. Set `ko` to render the knocked-out treatment
// (greyed out + a red "KO" stamp) — used for the player's own avatar
// everywhere it shows while they're knocked out.
export function Avatar({ src, emoji, size = 40, radius = 8, style = {}, ko = false }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: radius,
      overflow: 'hidden',
      flexShrink: 0,
      position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      lineHeight: 1,
      ...style,
    }}>
      {src ? (
        <img
          src={src}
          alt={emoji || ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: ko ? KO_FILTER : 'none' }}
        />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.62), lineHeight: 1, filter: ko ? KO_FILTER : 'none' }}>{emoji}</span>
      )}
      {ko && <KoOverlay fontSize={Math.max(8, Math.round(size * 0.3))} />}
    </div>
  )
}

// The greyscale wash applied to a knocked-out portrait.
export const KO_FILTER = 'grayscale(1) brightness(0.55)'

// A red "KO" stamp centered over a portrait. Drop it inside any
// position:relative container (Avatar does this automatically; raw-<img> hero
// portraits pass their own fontSize). Purely decorative — never intercepts taps.
export function KoOverlay({ fontSize = 16 }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(10,10,15,0.4)', pointerEvents: 'none',
    }}>
      <span style={{
        color: '#fff', fontWeight: 900, fontSize, letterSpacing: 1, lineHeight: 1,
        border: `${Math.max(1, Math.round(fontSize / 8))}px solid #e74c3c`,
        background: 'rgba(150,20,20,0.55)', borderRadius: Math.max(3, Math.round(fontSize / 4)),
        padding: `${Math.round(fontSize / 6)}px ${Math.round(fontSize / 2.5)}px`,
        textShadow: '0 1px 4px #000',
      }}>KO</span>
    </div>
  )
}
