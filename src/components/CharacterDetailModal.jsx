import React, { useState } from 'react'
import { RARITY_COLORS, SKILLS } from '../data/gameData'
import { Avatar, KoOverlay, KO_FILTER } from './Avatar'
import { SkillCardPopup } from './SkillCardPopup'
import { useVitals, openNurse } from '../state/vitalsStore'

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
export function CharacterDetailModal({
  character: c,
  onClose,
  actions = [],
  cardType,
  count,
  cardLevel,
  // Upgrade props — only rendered together. When supplied, the modal
  // shows the ATK/DEF upgrade panel under Combat Stats. `upgrades` is
  // { atk: number, def: number }; `onUpgrade(stat)` is the click handler.
  upgrades,
  hustle,
  onUpgrade,
  atkPerLevel = 10,
  defPerLevel = 10,
  maxUpgradeLevel = 20,
  costForLevel,
  // Optional custom upgrade rows — [{ label, color, stat, perLevel }]. When
  // omitted, the panel defaults to the ATK + DEF rows (player cards). Skill
  // cards pass a single DMG row. `upgrades` is keyed by each row's `stat`.
  upgradeRows,
  // Merge props — when canMerge is true and onMerge is supplied, a MERGE
  // CARDS button renders below the upgrade rows. Consumes a full stack to
  // mint one of the same card at the next level.
  canMerge = false,
  onMerge,
  // Skill loadout — { [slot]: { skillId, level } } keyed by Battle-Dice slot
  // (2–12). When supplied, the modal previews the fighter's 12-slot skill
  // board (used for bosses so you can scout their loadout before the fight).
  skillLoadout,
  // Optional headline stat tiles — [{ icon, label, value, color }]. Rendered
  // under the bio. Used by skill cards to show DMG so the open view matches
  // the card face.
  statTiles,
  // Optional hero-image treatment. `heroBg` paints a solid card face behind
  // the portrait (grow cards use yellow); `heroFit` overrides the image
  // objectFit (e.g. 'contain' for a cutout so the whole subject shows).
  heroBg,
  heroFit = 'cover',
}) {
  // KO the player's own portrait when knocked out (this modal opens for the
  // player from Home / leaderboards, and for opponents — only `isYou` greys out).
  const vitals = useVitals()
  const playerKo = vitals.ko
  if (!c) return null
  const koHero = !!c.isYou && playerKo

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
      className="app-overlay"
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
          background: heroBg || undefined,
        }}>
          {c.avatar ? (
            <img
              src={c.avatar}
              alt={c.name}
              style={{
                width: '100%', height: '100%',
                objectFit: heroFit, objectPosition: 'center top',
                display: 'block', filter: koHero ? KO_FILTER : 'none',
              }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: 'radial-gradient(circle at center, #1a1a2e 0%, #0a0a0f 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 140, filter: koHero ? KO_FILTER : 'none',
            }}>{c.emoji}</div>
          )}
          {koHero && <KoOverlay fontSize={40} />}
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

          {/* Card type badge (top-left) + CARDS:N badge (below close).
              Only shown for collected cards — character types without
              these props (enemies, ranked players) don't see them. */}
          {cardType && (
            <div style={{
              position: 'absolute', top: 16, left: 16,
              color: '#fff',
              background: 'rgba(10,10,15,0.7)',
              border: '0.5px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
            }}>
              {cardType}
              {cardLevel >= 1 && <span style={{ color: accent, marginLeft: 6 }}>· LVL {cardLevel}</span>}
            </div>
          )}
          {count != null && (
            <div style={{
              position: 'absolute', top: 40, left: 16,
              color: accent,
              background: 'rgba(10,10,15,0.7)',
              border: `0.5px solid ${accent}55`,
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 10, fontWeight: 800, letterSpacing: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>CARDS:{count}</div>
          )}
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

        {/* Headline stat tiles (e.g. a skill card's DMG) — kept in sync with
            the card face so the open view shows the same numbers. */}
        {statTiles && statTiles.length > 0 && (
          <div style={{ padding: '16px 18px 0' }}>
            <SectionLabel>Stats</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${statTiles.length}, 1fr)`, gap: 8 }}>
              {statTiles.map((t, i) => (
                <StatTile key={i} icon={t.icon} label={t.label} value={t.value} color={t.color} />
              ))}
            </div>
          </div>
        )}

        {/* Card stats — for CARDS_COLLECTION items. ATK + DEF are the only
            visible numbers; the underlying hustle/muscle/smarts/cred breakdown
            was removed at user request (those derive ATK/DEF anyway). */}
        {c.hustle != null && c.muscle != null && c.smarts != null && c.cred != null && (
          <div style={{ padding: '16px 18px 0' }}>
            <SectionLabel>Combat Stats</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <StatTile icon="ti-sword"  label="Attack"  value={derivedAtk(c, upgrades, atkPerLevel)}  color={RED} />
              <StatTile icon="ti-shield" label="Defense" value={derivedDef(c, upgrades, defPerLevel)} color={BLUE} />
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

        {/* Upgrade panel — only when caller wired up upgrade callbacks.
            Same look as the rows that used to live in the Crew slot editor,
            unified so there's one place to upgrade. */}
        {upgrades && onUpgrade && hustle != null && costForLevel && (
          <div style={{ padding: '16px 18px 0' }}>
            <SectionLabel>Upgrade</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(upgradeRows || [
                { label: 'ATTACK',  color: RED,  stat: 'atk', perLevel: atkPerLevel },
                { label: 'DEFENSE', color: BLUE, stat: 'def', perLevel: defPerLevel },
              ]).map(row => (
                <UpgradeRow
                  key={row.stat}
                  label={row.label}
                  color={row.color}
                  stat={row.stat}
                  level={upgrades[row.stat] || 0}
                  perLevel={row.perLevel}
                  maxLevel={maxUpgradeLevel}
                  cost={costForLevel(upgrades[row.stat] || 0)}
                  hustle={hustle}
                  onUpgrade={onUpgrade}
                />
              ))}
            </div>
          </div>
        )}

        {/* Merge — appears when a full stack is ready. Sits below the upgrade
            rows so the flow reads: see stats → upgrade → merge to next level. */}
        {canMerge && onMerge && (
          <div style={{ padding: '14px 18px 0' }}>
            <button onClick={onMerge} style={{
              width: '100%',
              background: accent, color: '#0a0a0f',
              border: 'none', borderRadius: 10,
              padding: '13px 14px',
              fontSize: 13, fontWeight: 800, letterSpacing: 1.4,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <i className="ti ti-arrows-join" /> MERGE CARDS
            </button>
          </div>
        )}

        {/* Your live vitals — tap either to head to the nurse and recover. */}
        {c.isYou && (
          <div style={{ padding: '16px 18px 0' }}>
            <SectionLabel>Vitals</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <StatTile icon="ti-heart" label="Health" color={RED} small
                value={`${vitals.health.toLocaleString()}/${vitals.healthMax.toLocaleString()}`}
                onClick={() => { onClose?.(); openNurse() }} />
              <StatTile icon="ti-bolt" label="Stamina" color={GOLD} small
                value={`${vitals.stamina.toLocaleString()}/${vitals.staminaMax.toLocaleString()}`}
                onClick={() => { onClose?.(); openNurse() }} />
            </div>
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
              <StatTile icon="ti-heart"   label="Life"    value={(c.hp ?? 0).toLocaleString()} color="#2ecc71" small />
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

        {/* Actions — rendered above the skill board so FIGHT sits directly
            over the boss's Skills section. */}
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

        {/* Skill loadout — the fighter's 12-slot skill board (slots 2–12, the
            Battle-Dice sum range). Same slots that fire mid-fight, so you can
            scout a boss's skills before committing stamina. Shows the empty
            board even with no skills yet, so the slots are visible as a
            placeholder. */}
        {skillLoadout && (
          <div style={{ padding: '16px 18px 0' }}>
            <SectionLabel>Skills</SectionLabel>
            <SkillSlotGrid loadout={skillLoadout} accent={accent} />
            <div style={{ color: '#555', fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
              A roll lands on a slot (the two dice sum, 2–12). If a skill sits there, it fires for bonus attack.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Read-only skill board for the detail card — 11 cells for Battle-Dice slots
// 2–12, in the same 4-wide grid as the in-fight SlotGrid. A slot holding a
// skill shows its emoji + level; empty slots are dimmed with just the number.
function SkillSlotGrid({ loadout = {}, accent = GOLD }) {
  const slots = Array.from({ length: 11 }, (_, i) => i + 2)   // 2..12
  const [popup, setPopup] = useState(null)   // { skill, level } when a slot is tapped
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {slots.map(slot => {
          const entry = loadout[slot]
          const skill = entry ? SKILLS.find(s => s.id === entry.skillId) : null
          return (
            <div key={slot}
              onClick={skill ? () => setPopup({ skill, entry }) : undefined}
              style={{
                aspectRatio: '1',
                background: entry ? `${accent}14` : '#0d0d15',
                border: `0.5px solid ${entry ? `${accent}66` : '#2a2a3a'}`,
                borderRadius: 8, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', cursor: skill ? 'pointer' : 'default',
              }}>
              {/* In the open view, the slot shows the actual skill card art
                  (emoji fallback). Tap it to pop the full card. */}
              {skill && skill.avatar ? (
                <img src={skill.avatar} alt={skill.name}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : skill ? (
                <span style={{ fontSize: 20, lineHeight: 1 }}>{skill.emoji}</span>
              ) : null}
              {entry && (
                <span style={{ position: 'absolute', top: 2, left: 4, color: '#fff', fontSize: 8, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>
                  L{entry.level}
                </span>
              )}
              <span style={{ position: 'absolute', bottom: 2, right: 4, color: skill ? '#fff' : (entry ? accent : '#444'), fontSize: 8, fontWeight: 700, fontVariantNumeric: 'tabular-nums', textShadow: skill ? '0 1px 2px rgba(0,0,0,0.9)' : 'none' }}>
                {slot}
              </span>
            </div>
          )
        })}
      </div>
      {popup && (
        <SkillCardPopup
          skill={popup.skill}
          level={popup.entry?.level}
          dmgPerLevel={popup.skill.perLevelAttack + (popup.entry?.dmgUpgrade || 0) * 5}
          onClose={() => setPopup(null)}
        />
      )}
    </>
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

function StatTile({ icon, label, value, color, small, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: '#13131f',
      border: `0.5px solid ${onClick ? color + '55' : '#2a2a3a'}`,
      borderRadius: 10,
      padding: small ? '8px 8px' : '10px 10px',
      textAlign: 'center',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <i className={`ti ${icon}`} style={{ color, fontSize: small ? 13 : 16, display: 'block', marginBottom: 2 }} />
      <div style={{
        color, fontSize: small ? 14 : 18, fontWeight: 700, lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{
        color: '#555', fontSize: small ? 9 : 10, marginTop: 3, letterSpacing: 0.5,
      }}>{label}{onClick && <i className="ti ti-chevron-right" style={{ fontSize: 8, marginLeft: 2 }} />}</div>
    </div>
  )
}

// Re-export Avatar so callers can pull both from one place if they want.
export { Avatar }

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

// Derived ATK/DEF including upgrade levels. Matches the formula used in
// crewStore — base from muscle/cred, +perLevel per upgrade level.
function derivedAtk(c, upgrades, perLevel) {
  const base = (c.muscle * 5 + 15)
  return (base + (upgrades?.atk || 0) * perLevel).toLocaleString()
}
function derivedDef(c, upgrades, perLevel) {
  const base = (c.cred * 5 + 10)
  return (base + (upgrades?.def || 0) * perLevel).toLocaleString()
}

function UpgradeRow({ label, color, stat, level, perLevel, maxLevel, cost, hustle, onUpgrade }) {
  const maxed = level >= maxLevel
  const canAfford = !maxed && hustle >= cost
  return (
    <div style={{
      background: '#13131f',
      border: `0.5px solid ${color}33`,
      borderRadius: 12, padding: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ color, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>{label}</div>
        <div style={{ color: '#888', fontSize: 11 }}>
          Lvl <span style={{ color: '#fff', fontWeight: 700 }}>{level}</span>/{maxLevel}
        </div>
      </div>
      <button
        onClick={() => !maxed && canAfford && onUpgrade(stat)}
        disabled={maxed || !canAfford}
        style={{
          width: '100%', padding: 10,
          background: maxed ? '#1e1e2a' : canAfford ? `${color}22` : '#1e1e2a',
          border: `0.5px solid ${maxed ? '#2a2a3a' : canAfford ? color + '66' : '#2a2a3a'}`,
          color: maxed ? '#555' : canAfford ? color : '#555',
          fontSize: 12, fontWeight: 600, borderRadius: 8,
          cursor: maxed || !canAfford ? 'not-allowed' : 'pointer',
          opacity: !maxed && !canAfford ? 0.55 : 1,
        }}
      >
        {maxed
          ? 'MAXED OUT'
          : <>+{perLevel} {label} <span style={{ opacity: 0.7, marginLeft: 8 }}>— {cost.toLocaleString()} Hustle</span></>}
      </button>
    </div>
  )
}

// Derives attack/defense from a character. Matches the formula used in
// BattleDiceModal so the numbers in the detail card match what the player
// sees once a fight starts. Falls back to muscle/cred when available
// (e.g. the player's own card).
function attackOf(c) {
  if (c.atk != null) return c.atk.toLocaleString()   // explicit, current-build scale
  if (c.muscle != null) return (c.muscle * 5 + 15).toLocaleString()
  if (c.power  != null) return (Math.floor(c.power * 0.55) + 10).toLocaleString()
  return '—'
}
function defenseOf(c) {
  if (c.def != null) return c.def.toLocaleString()
  if (c.cred  != null) return (c.cred * 5 + 10).toLocaleString()
  if (c.power != null) return (Math.floor(c.power * 0.45) + 15).toLocaleString()
  return '—'
}
