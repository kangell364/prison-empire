import React from 'react'
import { RARITY_COLORS } from '../data/gameData'
import { Avatar } from './Avatar'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const BLUE = '#4a9eff'
const PURP = '#a855f7'

// Universal detail card for any character — works for cards in the
// collection, ranked players, PvP targets, hit list marks, leaderboard
// rows, and boss enemies. Renders sections conditionally based on
// which fields the character object has.
//
// Big hero image at the top because the artwork is the whole point.
export function CharacterDetailModal({ character: c, onClose, actions = [] }) {
  if (!c) return null

  const accent =
    c.rarity ? (RARITY_COLORS[c.rarity] || GOLD)
    : c.boss ? RED
    : c.isYou ? GOLD
    : c.owner ? RED
    : c.facility ? BLUE
    : GOLD

  // Optional context lines under the name
  const metaParts = []
  if (c.archetype)                          metaParts.push(c.archetype)
  if (c.rarity)                             metaParts.push(capitalize(c.rarity))
  if (c.boss)                               metaParts.push('BOSS')
  if (c.final_boss)                         metaParts.push('FINAL BOSS')
  if (c.facility && c.state)                metaParts.push(`${c.facility} — ${c.state}`)
  if (c.level)                              metaParts.push(`Lv ${c.level}`)
  if (c.area != null && !c.boss)            metaParts.push(`Area ${c.area}`)

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: '#0a0a0f',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        zIndex: 220,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 390,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 100,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Big cinematic hero — full-width portrait dominates the top */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: 280,
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {c.avatar ? (
            <img
              src={c.avatar}
              alt={c.name}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover', objectPosition: 'center top',
                display: 'block',
              }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: 'radial-gradient(circle at center, #1a1a2e 0%, #0a0a0f 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 140,
            }}>{c.emoji}</div>
          )}
          {/* Dark gradient at the bottom so name/meta read against any image */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: 110,
            background: 'linear-gradient(180deg, transparent 0%, rgba(10,10,15,0.6) 50%, #0a0a0f 100%)',
            pointerEvents: 'none',
          }} />
          {/* Top stripe in accent color */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 3, background: accent,
          }} />
          {/* Close button (X) top right */}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute', top: 12, right: 12,
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(10,10,15,0.7)',
              border: '0.5px solid rgba(255,255,255,0.15)',
              color: '#fff', fontSize: 18, fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          ><i className="ti ti-x" /></button>
        </div>

        {/* Identity block */}
        <div style={{ padding: '14px 18px 0' }}>
          <div style={{
            color: accent, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
            textTransform: 'uppercase', marginBottom: 4,
          }}>
            {metaParts[0] || (c.isYou ? 'You' : '')}
          </div>
          <div style={{
            color: '#fff', fontSize: 26, fontWeight: 700, lineHeight: 1.1,
          }}>{c.name}</div>
          {metaParts.length > 1 && (
            <div style={{
              color: '#888', fontSize: 12, marginTop: 4,
            }}>{metaParts.slice(1).join(' · ')}</div>
          )}
        </div>

        {/* Bio */}
        {c.bio && (
          <div style={{ padding: '14px 18px 0' }}>
            <div style={{
              background: '#13131f',
              border: `0.5px solid ${accent}44`,
              borderLeft: `3px solid ${accent}`,
              borderRadius: 10,
              padding: 12,
              color: '#bbb',
              fontSize: 13,
              lineHeight: 1.55,
              fontStyle: 'italic',
            }}>{c.bio}</div>
          </div>
        )}

        {/* Card stats (hustle/muscle/smarts/cred) — for CARDS_COLLECTION items */}
        {c.hustle != null && c.muscle != null && c.smarts != null && c.cred != null && (
          <div style={{ padding: '16px 18px 0' }}>
            <SectionLabel>Card Stats</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <StatTile icon="ti-flame"   label="Hustle" value={c.hustle} color={GOLD} />
              <StatTile icon="ti-barbell" label="Muscle" value={c.muscle} color={RED} />
              <StatTile icon="ti-brain"   label="Smarts" value={c.smarts} color={BLUE} />
              <StatTile icon="ti-star"    label="Cred"   value={c.cred}   color={PURP} />
            </div>
            {c.special && (
              <div style={{
                marginTop: 10,
                background: `${GOLD}18`,
                border: `0.5px solid ${GOLD}44`,
                borderRadius: 10,
                padding: '8px 12px',
                color: GOLD,
                fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <i className="ti ti-bolt" />
                Special: {c.special}
              </div>
            )}
          </div>
        )}

        {/* PvP / ranked-player stats */}
        {c.wins != null && c.losses != null && (
          <div style={{ padding: '16px 18px 0' }}>
            <SectionLabel>Combat Record</SectionLabel>
            {/* Combat — Attack/Defense/Power derive from base power using the
                same formula as Battle Dice so what you see here matches the
                numbers under the fighter blocks once the fight starts. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
              <StatTile icon="ti-sword"   label="Attack"  value={attackOf(c)}  color={RED}   small />
              <StatTile icon="ti-shield"  label="Defense" value={defenseOf(c)} color={BLUE}  small />
              <StatTile icon="ti-bolt"    label="Power"   value={(c.power ?? 0).toLocaleString()} color={GOLD} small />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <StatTile icon="ti-trophy" label="Wins"   value={c.wins.toLocaleString()}   color={GOLD}     small />
              <StatTile icon="ti-x"      label="Losses" value={c.losses.toLocaleString()} color={RED}      small />
              <StatTile icon="ti-skull"  label="KOs"    value={(c.kos ?? 0).toLocaleString()} color="#f0d080" small />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
              <StatTile icon="ti-bus"       label="Defeats" value={(c.defeats ?? 0).toLocaleString()} color="#e0824f" small />
              <StatTile icon="ti-briefcase" label="Jobs"    value={(c.jobs ?? 0).toLocaleString()}    color={BLUE}    small />
            </div>
          </div>
        )}

        {/* Enemy power + rewards (bosses + area enemies) */}
        {c.reward_xp != null && (
          <div style={{ padding: '16px 18px 0' }}>
            <SectionLabel>Threat & Reward</SectionLabel>
            {/* Threat: attack/defense/power side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
              <StatTile icon="ti-sword"  label="Attack"  value={attackOf(c)}  color={RED}  small />
              <StatTile icon="ti-shield" label="Defense" value={defenseOf(c)} color={BLUE} small />
              <StatTile icon="ti-bolt"   label="Power"   value={c.power}      color={GOLD} small />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <StatTile icon="ti-flame" label="XP Reward"     value={`+${c.reward_xp}`}     color={GOLD} />
              <StatTile icon="ti-coin"  label="Hustle Reward" value={`+${c.reward_hustle}`} color={GOLD} />
            </div>
            {c.boss_reward_card && (
              <div style={{ marginTop: 8 }}>
                <StatTile icon="ti-cards" label="Bonus on Win" value="Card drop" color={PURP} />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {actions.length > 0 && (
          <div style={{ padding: '16px 18px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={() => { a.onClick(); onClose() }}
                style={{
                  background: a.kind === 'danger' ? '#1a0808'
                    : a.kind === 'secondary' ? '#1e1e2a'
                    : GOLD,
                  color: a.kind === 'danger' ? RED
                    : a.kind === 'secondary' ? '#888'
                    : '#0a0a0f',
                  border: a.kind === 'danger' ? `1px solid ${RED}55`
                    : a.kind === 'secondary' ? '0.5px solid #2a2a3a'
                    : 'none',
                  borderRadius: 10,
                  padding: '14px',
                  fontSize: 13, fontWeight: 700, letterSpacing: 1,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {a.icon && <i className={`ti ${a.icon}`} style={{ fontSize: 14 }} />}
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      color: '#555', fontSize: 10, fontWeight: 600, letterSpacing: 1.5,
      textTransform: 'uppercase', marginBottom: 8,
    }}>{children}</div>
  )
}

function StatTile({ icon, label, value, color, small }) {
  return (
    <div style={{
      background: '#13131f',
      border: '0.5px solid #2a2a3a',
      borderRadius: 10,
      padding: small ? '8px 8px' : '10px 10px',
      textAlign: 'center',
    }}>
      <i className={`ti ${icon}`} style={{ color, fontSize: small ? 13 : 16, display: 'block', marginBottom: 2 }} />
      <div style={{
        color, fontSize: small ? 14 : 18, fontWeight: 700, lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{
        color: '#555', fontSize: small ? 9 : 10, marginTop: 3, letterSpacing: 0.5,
      }}>{label}</div>
    </div>
  )
}

// Re-export Avatar so callers can pull both from one place if they want.
export { Avatar }

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

// Derives attack/defense from a character. Matches the formula used in
// BattleDiceModal so the numbers in the detail card match what the player
// sees once a fight starts. Falls back to muscle/cred when available
// (e.g. the player's own card).
function attackOf(c) {
  if (c.muscle != null) return (c.muscle * 5 + 15).toLocaleString()
  if (c.power  != null) return (Math.floor(c.power * 0.55) + 10).toLocaleString()
  return '—'
}
function defenseOf(c) {
  if (c.cred  != null) return (c.cred * 5 + 10).toLocaleString()
  if (c.power != null) return (Math.floor(c.power * 0.45) + 15).toLocaleString()
  return '—'
}
