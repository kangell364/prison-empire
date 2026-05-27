import React from 'react'

// Renders a player avatar — image if `src` is set, otherwise the emoji
// fallback. Standard sizing + styling so all the places that show a
// character look consistent (and adding artwork to a new character is
// just `avatar: '/path.jpg'` on its data).
//
//   <Avatar src={player.avatar} emoji={player.emoji} size={40} />
//
// Pass `style` to layer additional styling (drop-shadow, filter, etc.)
// onto the outer container.
export function Avatar({ src, emoji, size = 40, radius = 8, style = {} }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: radius,
      overflow: 'hidden',
      flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      lineHeight: 1,
      ...style,
    }}>
      {src ? (
        <img
          src={src}
          alt={emoji || ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.62), lineHeight: 1 }}>{emoji}</span>
      )}
    </div>
  )
}
