import React from 'react'
import { RARITY_COLORS } from '../data/gameData'

// A focused popup of a single skill card — hero art, name, rarity/level,
// description, and DMG — with an X to close. Opened by tapping a skill slot on
// either the Battle-Dice board (shows the emoji) or a detail card's skill board
// (shows the art). Renders above everything (z above the dice/detail modals).
export function SkillCardPopup({ skill, level, dmgPerLevel, onClose }) {
  if (!skill) return null
  const color = RARITY_COLORS[skill.rarity] || '#c9a84c'
  const dmg = dmgPerLevel != null ? dmgPerLevel : skill.perLevelAttack
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 400, padding: 'calc(14px + env(safe-area-inset-top)) 16px 16px',
      overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 320, background: '#13131f',
        border: `1px solid ${color}55`, borderRadius: 16, overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{ height: 3, background: color }} />

        {/* X close */}
        <button onClick={onClose} aria-label="Close" style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          width: 30, height: 30, borderRadius: '50%',
          background: 'rgba(10,10,15,0.7)', border: '0.5px solid rgba(255,255,255,0.18)',
          color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><i className="ti ti-x" /></button>

        {/* Hero art */}
        <div style={{ width: '100%', height: 200, position: 'relative', background: '#1e1e2a' }}>
          {skill.avatar ? (
            <img src={skill.avatar} alt={skill.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 90 }}>{skill.emoji}</div>
          )}
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ color, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            SKILL · {skill.rarity}{level ? ` · LVL ${level}` : ''}
          </div>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginTop: 2 }}>{skill.name}</div>
          {skill.description && (
            <div style={{ color: '#999', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>{skill.description}</div>
          )}
          <div style={{ background: '#1e1e2a', borderRadius: 8, padding: '8px 10px', textAlign: 'center', marginTop: 12 }}>
            <div style={{ color: '#555', fontSize: 8, fontWeight: 700, letterSpacing: 1 }}>DMG</div>
            <div style={{ color: '#e74c3c', fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              +{dmg}<span style={{ fontSize: 9, color: '#777', fontWeight: 600 }}> /lv</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
