import React from 'react'

// Shared tile-art size for card pictures — used by the Cards collection tiles
// and the My Crew slots so a placed card shows the same size picture as it does
// in the collection. Lives here (a neutral module both screens import) to keep
// them in sync without a circular Cards <-> Crew import.
export const CARD_TILE_ART = 120

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
export function Avatar({ src, emoji, size = 40, radius = 8, style = {}, ko = false, fit = 'cover' }) {
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
          style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', filter: ko ? KO_FILTER : 'none' }}
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

// The comic "K.O." burst stamp centered over a portrait. Drop it inside any
// position:relative container (Avatar does this automatically; raw-<img> hero
// portraits include it too). Purely decorative — never intercepts taps.
// `fontSize` is kept for call-site compatibility but the burst scales to its
// container.
export function KoOverlay() {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(10,10,15,0.35)', pointerEvents: 'none',
    }}>
      <img
        src={`${process.env.PUBLIC_URL || ''}/ko-stamp.png`}
        alt="KO"
        style={{ width: '94%', height: '82%', objectFit: 'contain', filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.7))' }}
      />
    </div>
  )
}
