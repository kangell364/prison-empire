// Skill-card bonus-affix panel — Phase 3 of the Jailhouse Affix system.
//
// Rendered inside the skill CharacterDetailModal (via its `extraContent` slot).
// Shows the RANDOM bonus skills rolled onto this (skillId, cardLevel) tile, lets
// the player spend a re-roll token to re-roll one, and burn a spare copy for a
// Hustle refund + 1 re-roll token. The roll itself happens on MERGE (see
// onMergeRollAffixes in skillAffixStore); this panel is the management surface.

import React, { useState } from 'react'
import { RARITY_COLORS } from '../data/gameData'
import {
  useSkillAffixes, useReRollTokens, getTileAffixes,
  bonusSlotsForLevel, rerollAffix, burnSkillCard,
  BURN_BASE_HUSTLE, BURN_LEVEL_K,
} from '../state/skillAffixStore'
import { getProgress } from '../state/progressionStore'
import { sfx } from '../sounds'

// Human-readable one-liner for an affix's effect, off the Phase 2 effect schema.
// `target` is relative to the card's owner: 'self' buffs you, 'opponent' debuffs
// the foe. Kept in sync with src/combat/skillEffects.js by shape, not by import.
function affixEffectText(effect) {
  if (!effect) return ''
  const foe = effect.target === 'opponent'
  switch (effect.kind) {
    case 'dot':
      return `Bleed foe ${effect.pctMaxHp}% max HP × ${effect.rolls}`
    case 'modifier': {
      const sign = effect.pct >= 0 ? '+' : '−'
      const who = foe ? 'foe ' : ''
      return `${sign}${Math.abs(effect.pct)}% ${who}${effect.stat.toUpperCase()} (fight)`
    }
    case 'dice':
      return `Nudge your dice +${effect.nudge} × ${effect.rolls}`
    case 'disable': {
      const which = effect.slots === 'all' ? 'all' : `${effect.slots} `
      return `Disable foe ${which}slots × ${effect.rolls}`
    }
    default:
      return ''
  }
}

const RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' }

export function SkillAffixPanel({ skillId, level, count }) {
  useSkillAffixes()                 // re-render when this tile's affixes change
  const tokens = useReRollTokens()  // re-render when the token balance changes
  const [confirmBurn, setConfirmBurn] = useState(false)

  const affixes = getTileAffixes(skillId, level)
  const slots = bonusSlotsForLevel(level)

  const playerLevel = getProgress().level || 1
  const burnHustle = Math.round(BURN_BASE_HUSTLE * level * (1 + playerLevel * BURN_LEVEL_K))

  const onReroll = (index) => {
    if (tokens <= 0) { sfx.deny?.(); return }
    if (rerollAffix(skillId, level, index)) sfx.buy?.()
  }
  const onBurn = () => {
    if (count <= 0) { sfx.deny?.(); return }
    if (!confirmBurn) { setConfirmBurn(true); return }
    setConfirmBurn(false)
    if (burnSkillCard(skillId, level)) sfx.buy?.()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, color: '#c9a84c', textTransform: 'uppercase' }}>
          Bonus Skills
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: tokens > 0 ? '#4a9eff' : '#666' }}>
          🎲 {tokens} re-roll{tokens === 1 ? '' : 's'}
        </span>
      </div>

      {slots === 0 ? (
        <div style={{ fontSize: 12, color: '#888', lineHeight: 1.4, padding: '4px 0 2px' }}>
          Merge to <b style={{ color: '#c9a84c' }}>Lvl 2</b> to roll a random bonus skill onto this card.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: slots }).map((_, i) => {
            const af = affixes[i]
            if (!af) {
              return (
                <div key={i} style={{
                  border: '1px dashed #333', borderRadius: 10, padding: '10px 12px',
                  fontSize: 12, color: '#666', textAlign: 'center',
                }}>
                  Empty slot — merge again to roll
                </div>
              )
            }
            const color = RARITY_COLORS[af.rarity] || '#888'
            const canReroll = tokens > 0
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                border: `1px solid ${color}55`, background: `${color}11`,
                borderRadius: 10, padding: '8px 10px',
              }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{af.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color }}>{af.name}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {RARITY_LABEL[af.rarity] || af.rarity}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>{affixEffectText(af.effect)}</div>
                </div>
                <button
                  onClick={() => onReroll(i)}
                  disabled={!canReroll}
                  title={canReroll ? 'Spend 1 re-roll token' : 'No re-roll tokens — burn a spare copy'}
                  style={{
                    flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 8,
                    border: '1px solid #444', cursor: canReroll ? 'pointer' : 'not-allowed',
                    background: canReroll ? '#1e2a3a' : '#1a1a1a',
                    color: canReroll ? '#4a9eff' : '#555',
                  }}
                >
                  🎲 Re-roll
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Burn — feed a spare copy to the furnace for a re-roll token + Hustle. */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onBurn}
          disabled={count <= 0}
          onMouseLeave={() => setConfirmBurn(false)}
          style={{
            flex: 1, fontSize: 12, fontWeight: 800, padding: '10px 12px', borderRadius: 10,
            border: `1px solid ${confirmBurn ? '#e74c3c' : '#5a2a2a'}`,
            background: confirmBurn ? '#e74c3c' : '#2a1414',
            color: count <= 0 ? '#555' : confirmBurn ? '#fff' : '#e08a8a',
            cursor: count <= 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {confirmBurn ? `Burn it? +${burnHustle.toLocaleString()} Hustle, +1 🎲` : '🔥 Burn a spare copy'}
        </button>
      </div>
      <div style={{ fontSize: 10, color: '#777', marginTop: 4, textAlign: 'center' }}>
        Burns 1 of {count} copies → +1 re-roll token & +{burnHustle.toLocaleString()} Hustle
      </div>
    </div>
  )
}
