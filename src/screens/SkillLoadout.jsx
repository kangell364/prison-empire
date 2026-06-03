import React, { useMemo, useState } from 'react'
import { SKILLS, RARITY_COLORS } from '../data/gameData'
import { Avatar } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import { sfx } from '../sounds'
import {
  useSkillLoadout, setSkillSlot, clearSkillSlot, SKILL_SLOTS,
} from '../state/skillLoadoutStore'
import { useSkillCardCounts, getOwnedSkillTuples } from '../state/skillCardsStore'
import {
  useSkillUpgrades, readSkillUpgrade, getSkillUpgrade, upgradeSkillStat,
  SKILL_DMG_PER_LEVEL, SKILL_UPGRADE_COST, MAX_SKILL_UPGRADE_LEVEL,
} from '../state/skillUpgradesStore'
import { useHustle, spendHustle } from '../state/playerStore'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#555'

const SKILL_BY_ID = new Map(SKILLS.map(s => [s.id, s]))

// Best owned level for a skill (merging mints higher-level cards), 0 if unowned.
function bestLevel(skillId) {
  let best = 0
  for (const t of getOwnedSkillTuples()) if (t.id === skillId && t.level > best) best = t.level
  return best
}
// Effective per-hit damage = base + DMG upgrades at the skill's best level.
function effDmg(skillId) {
  const lvl = bestLevel(skillId)
  if (!lvl) return 0
  const dmgUp = getSkillUpgrade(skillId, lvl).dmg || 0
  const s = SKILL_BY_ID.get(skillId)
  return s ? s.perLevelAttack + dmgUp * SKILL_DMG_PER_LEVEL : 0
}

// The Skills loadout — eleven Battle-Dice slots (2–12), each holding one skill
// card. Mirrors the My Crew screen: tap an empty slot to pick from your owned
// SKILL cards; tap a filled slot for the big detail view (upgrade / replace /
// remove). Only skill cards can be equipped here.
export default function SkillLoadout() {
  const loadout = useSkillLoadout()
  const counts  = useSkillCardCounts()
  const upgradeMap = useSkillUpgrades()
  const hustle  = useHustle()
  const [editing, setEditing] = useState(null)  // { slot } | { slot, openPicker }

  // Owned skill ids (any level, count > 0) — recomputed when counts change.
  const ownedIds = useMemo(() => {
    const s = new Set()
    for (const [k, v] of counts.entries()) {
      if (v > 0) s.add(k.slice(0, k.lastIndexOf(':')))
    }
    return s
  }, [counts])

  const filled = SKILL_SLOTS.filter(s => loadout[s]).length
  const totalDmg = SKILL_SLOTS.reduce((sum, s) => sum + (loadout[s] ? effDmg(loadout[s]) : 0), 0)

  // Owned skills not currently in any slot — the picker bench.
  const benchSkills = useMemo(() => {
    const inUse = new Set(SKILL_SLOTS.map(s => loadout[s]).filter(Boolean))
    return SKILLS.filter(sk => ownedIds.has(sk.id) && !inUse.has(sk.id))
  }, [loadout, ownedIds])

  const onPick = (skillId) => { if (editing) { setSkillSlot(editing.slot, skillId); setEditing(null) } }
  const onRemove = () => { if (editing) { clearSkillSlot(editing.slot); setEditing(null) } }

  const onUpgrade = (skillId, cardLevel) => () => {
    const cur = getSkillUpgrade(skillId, cardLevel).dmg || 0
    if (cur >= MAX_SKILL_UPGRADE_LEVEL) return
    if (spendHustle(SKILL_UPGRADE_COST(cur))) { upgradeSkillStat(skillId, cardLevel); sfx.buy() }
    else sfx.deny?.()
  }

  return (
    <>
      {/* Header: total equipped skill damage + slots filled */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Stat label="Equipped Skills" value={`${filled}/11`} color={GOLD} />
          <Stat label="Total Skill DMG" value={`+${totalDmg}`} color={RED} />
        </div>
        <div style={{ color: DIM, fontSize: 11, marginTop: 8, textAlign: 'center', letterSpacing: 0.5 }}>
          A roll lands on a slot (two dice, 2–12). If a skill sits there, it fires for bonus attack.
        </div>
      </div>

      {/* 11 dice slots */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Skill Slots</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {SKILL_SLOTS.map(slot => (
            <SlotTile
              key={slot}
              slot={slot}
              skill={loadout[slot] ? SKILL_BY_ID.get(loadout[slot]) : null}
              onClick={() => setEditing({ slot })}
            />
          ))}
        </div>
      </div>

      {/* Empty slot → picker. Filled slot → big detail view + replace/remove. */}
      {editing && (() => {
        const skillId = loadout[editing.slot]
        const skill = skillId ? SKILL_BY_ID.get(skillId) : null
        if (!skill || editing.openPicker) {
          return (
            <SkillPicker
              slot={editing.slot}
              benchSkills={benchSkills}
              onPick={onPick}
              onClose={() => setEditing(null)}
            />
          )
        }
        const cardLevel = bestLevel(skillId) || 1
        return (
          <CharacterDetailModal
            character={{ ...skill, bio: skill.description }}
            cardType="SKILL"
            cardLevel={cardLevel}
            statTiles={[
              { icon: 'ti-sword', label: 'DMG / LV', value: `+${effDmg(skillId)}`, color: RED },
              { icon: 'ti-stack-2', label: 'Card Level', value: cardLevel, color: GOLD },
            ]}
            upgrades={readSkillUpgrade(upgradeMap, skillId, cardLevel)}
            hustle={hustle}
            onUpgrade={onUpgrade(skillId, cardLevel)}
            upgradeRows={[{ label: 'DAMAGE', color: RED, stat: 'dmg', perLevel: SKILL_DMG_PER_LEVEL }]}
            maxUpgradeLevel={MAX_SKILL_UPGRADE_LEVEL}
            costForLevel={SKILL_UPGRADE_COST}
            actions={[
              { label: 'Replace Slot', icon: 'ti-arrows-exchange', kind: 'secondary',
                onClick: () => setEditing({ ...editing, openPicker: true }) },
              { label: 'Remove from Slot', icon: 'ti-trash', kind: 'danger', onClick: onRemove },
            ]}
            onClose={() => setEditing(null)}
          />
        )
      })()}
    </>
  )
}

// ---------------------------------------------------------------------

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
      <div style={{ color, fontSize: 18, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ color: DIM, fontSize: 10, marginTop: 5, letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

// One dice slot — empty shows "+ Add" with the slot number; filled shows the
// equipped skill's art, name, and effective DMG. The slot number always shows
// (bottom-right) so you can line it up with the Battle Dice.
function SlotTile({ slot, skill, onClick }) {
  if (!skill) {
    return (
      <button onClick={onClick} className="btn" style={{
        background: '#13131f', border: '1px dashed #2a2a3a', borderRadius: 12,
        padding: '16px 8px', color: DIM, fontSize: 11, fontWeight: 500,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 110, position: 'relative',
      }}>
        <i className="ti ti-plus" style={{ fontSize: 22, marginBottom: 4 }} />
        Add
        <span style={{ position: 'absolute', bottom: 4, right: 6, color: '#3a3a4a', fontSize: 9, fontWeight: 700 }}>{slot}</span>
      </button>
    )
  }
  const ringColor = RARITY_COLORS[skill.rarity] || DIM
  return (
    <div onClick={onClick} style={{
      background: '#13131f', border: `0.5px solid ${ringColor}66`, borderRadius: 12,
      padding: 8, cursor: 'pointer', position: 'relative', overflow: 'hidden', minHeight: 110,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: ringColor }} />
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6, marginBottom: 4 }}>
        <Avatar src={skill.avatar} emoji={skill.emoji} size={44} radius={8} style={{ background: '#1e1e2a' }} />
      </div>
      <div style={{ color: '#fff', fontSize: 10, fontWeight: 500, textAlign: 'center', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.name}</div>
      <div style={{ textAlign: 'center', fontSize: 8, color: ringColor, fontWeight: 700, marginBottom: 2 }}>LVL {bestLevel(skill.id) || 1}</div>
      <div style={{ textAlign: 'center', fontSize: 9, color: RED, fontVariantNumeric: 'tabular-nums' }}>+{effDmg(skill.id)} DMG</div>
      <span style={{ position: 'absolute', bottom: 4, right: 6, color: ringColor, fontSize: 9, fontWeight: 700 }}>{slot}</span>
    </div>
  )
}

// Skill picker — owned skill cards not already equipped. Skill cards only.
function SkillPicker({ slot, benchSkills, onPick, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center', zIndex: 250,
    }} onClick={onClose}>
      <div style={{
        background: '#13131f', width: '100%', maxWidth: 390, padding: 24, paddingTop: 60,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ color: GOLD, fontSize: 11, letterSpacing: 2, marginBottom: 14 }}>SKILL SLOT {slot}</div>
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Pick a Skill</div>
        <div style={{ color: DIM, fontSize: 12, marginBottom: 16 }}>
          Your owned skill cards not already equipped. Only skill cards go in these slots.
        </div>

        {benchSkills.length === 0 ? (
          <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 18, textAlign: 'center', color: DIM, fontSize: 13, marginBottom: 16 }}>
            No skill cards available. Collect or unequip a skill first.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {benchSkills.map(skill => {
              const ringColor = RARITY_COLORS[skill.rarity] || DIM
              return (
                <div key={skill.id} onClick={() => onPick(skill.id)} style={{
                  background: '#13131f', border: `0.5px solid ${ringColor}66`, borderRadius: 12,
                  padding: 10, cursor: 'pointer', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: ringColor }} />
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                    <Avatar src={skill.avatar} emoji={skill.emoji} size={56} radius={10} style={{ background: '#1e1e2a' }} />
                  </div>
                  <div style={{ color: '#fff', fontSize: 12, fontWeight: 500, textAlign: 'center', marginTop: 8 }}>{skill.name}</div>
                  <div style={{ color: ringColor, fontSize: 9, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{skill.rarity}</div>
                  <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: RED, fontVariantNumeric: 'tabular-nums' }}>+{effDmg(skill.id)} DMG</div>
                </div>
              )
            })}
          </div>
        )}

        <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
