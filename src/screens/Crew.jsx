import React, { useMemo, useState } from 'react'
import { CARDS_COLLECTION, RARITY_COLORS } from '../data/gameData'
import { Avatar, CARD_TILE_ART } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import { sfx } from '../sounds'
import { CrewBattleModal } from '../components/CrewBattleModal'
import { buildPracticeCrew } from '../data/opponentCrews'
import {
  useCrew, setLeader, setMember, clearSlot,
  atkOf, defOf,
  ATK_PER_LEVEL, DEF_PER_LEVEL,
} from '../state/crewStore'
import {
  useUpgrades, flatAtLevel, getUpgrade, upgradeStat,
  MAX_UPGRADE_LEVEL, HUSTLE_COST_PER_LEVEL,
} from '../state/upgradesStore'
import { useHustle, spendHustle, addHustle } from '../state/playerStore'
import { useCardCounts } from '../state/cardsStore'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#555'

// Quick lookup for card-by-id
const CARD_BY_ID = new Map(CARDS_COLLECTION.map(c => [c.id, c]))

export default function Crew() {
  const crew    = useCrew()
  const hustle  = useHustle()
  const counts  = useCardCounts()
  // Crew slots are Level-1 only, so the whole screen works off a flat
  // { [cardId]: {atk,def} } view of the player's Level-1 upgrades.
  const upgradesMap = useUpgrades()
  const flat = useMemo(() => flatAtLevel(upgradesMap, 1), [upgradesMap])
  // For the crew picker, "owned" = at least one Level 1 copy. Crew slots
  // don't yet care about levels (Phase 3 work).
  const ownedSet = useMemo(() => {
    const s = new Set()
    for (const [k, v] of counts.entries()) {
      if (v > 0 && k.endsWith(':1')) s.add(Number(k.split(':')[0]))
    }
    return s
  }, [counts])
  const [editing, setEditing] = useState(null)  // { kind: 'leader'|'member', slotIndex?: number }
  const [battling, setBattling] = useState(null)  // opponent object when modal is open

  const leaderCard = crew.leader != null ? CARD_BY_ID.get(crew.leader) : null
  const memberCards = crew.members.map(id => id != null ? CARD_BY_ID.get(id) : null)

  // Combined totals — sum of all 12 cards' ATK/DEF
  const totals = useMemo(() => {
    let atk = 0, def = 0, filled = 0
    const all = [leaderCard, ...memberCards].filter(Boolean)
    all.forEach(c => { atk += atkOf(c, flat); def += defOf(c, flat); filled++ })
    return { atk, def, filled, total: 12 }
  }, [leaderCard, memberCards, flat])

  // Owned cards not currently in any slot — for the picker
  const benchCards = useMemo(() => {
    const inUse = new Set([crew.leader, ...crew.members].filter(x => x != null))
    return CARDS_COLLECTION.filter(c => ownedSet.has(c.id) && !inUse.has(c.id))
  }, [crew.leader, crew.members, ownedSet])

  const onPick = (cardId) => {
    if (!editing) return
    if (editing.kind === 'leader') setLeader(cardId)
    else setMember(editing.slotIndex, cardId)
    setEditing(null)
  }

  const onRemove = () => {
    if (!editing) return
    clearSlot(editing.kind, editing.slotIndex)
    setEditing(null)
  }

  // Detail modal handlers — invoked when tapping a FILLED slot. Upgrades
  // live in the modal (unified with the Cards collection); Replace/Remove
  // are surfaced as action buttons in the modal footer.
  const onUpgrade = (cardId) => (stat) => {
    const current = getUpgrade(cardId, 1)[stat] || 0
    if (current >= MAX_UPGRADE_LEVEL) return
    const cost = HUSTLE_COST_PER_LEVEL(current)
    if (spendHustle(cost)) {
      upgradeStat(cardId, 1, stat)
      sfx.buy()
    } else {
      sfx.deny?.()
    }
  }

  const startPracticeBattle = () => {
    // Seed varies per session so successive practice fights aren't identical
    const opp = buildPracticeCrew(`practice-${Date.now()}`)
    setBattling(opp)
  }

  const onBattleWin = () => {
    // Practice win — small Hustle reward so the loop has a payoff
    addHustle(500)
    sfx.win()
  }

  return (
    <>
      {/* Header: combined crew ATK / DEF */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Stat label="Crew ATK"  value={totals.atk.toLocaleString()} color={RED} />
          <Stat label="Crew DEF"  value={totals.def.toLocaleString()} color="#4a9eff" />
        </div>
        <div style={{
          color: DIM, fontSize: 11, marginTop: 8, textAlign: 'center',
          letterSpacing: 0.5,
        }}>
          {totals.filled}/12 SLOTS FILLED
          {totals.filled < 12 && <span style={{ color: GOLD, marginLeft: 8 }}>
            — open packs to fill the rest
          </span>}
        </div>
      </div>

      {/* Crew Leader */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Crew Leader</div>
        <LeaderTile
          card={leaderCard}
          upgrades={flat}
          onClick={() => setEditing({ kind: 'leader' })}
        />
      </div>

      {/* 11 Member Slots */}
      <div className="section">
        <div className="section-label">Crew Members</div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        }}>
          {memberCards.map((c, i) => (
            <MemberTile
              key={i}
              card={c}
              upgrades={flat}
              onClick={() => setEditing({ kind: 'member', slotIndex: i })}
            />
          ))}
        </div>
      </div>

      {/* Practice Battle launcher — lets us test crew-vs-crew without the map */}
      <div className="section">
        <button
          className="btn btn-gold btn-full"
          style={{ padding: 16, fontSize: 14, letterSpacing: 1.5, fontWeight: 700 }}
          onClick={startPracticeBattle}
        >
          <i className="ti ti-sword" /> PRACTICE BATTLE — RIVAL CREW
        </button>
        <div style={{ color: DIM, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
          Test your roster against a random rival crew. Win +500 Hustle.
        </div>
      </div>

      {battling && (
        <CrewBattleModal
          playerCrew={{
            name: 'Your Crew',
            leader: leaderCard,
            members: memberCards,
            upgrades: flat,
          }}
          opponent={battling}
          onClose={() => setBattling(null)}
          onWin={onBattleWin}
        />
      )}

      {editing && (() => {
        const slotCard = editing.kind === 'leader'
          ? leaderCard
          : memberCards[editing.slotIndex]

        // Empty slot → picker. Filled slot → unified detail modal with
        // upgrade UI + Replace/Remove actions.
        if (slotCard == null) {
          return (
            <SlotEditor
              editing={editing}
              benchCards={benchCards}
              upgrades={flat}
              onPick={onPick}
              onClose={() => setEditing(null)}
            />
          )
        }
        return (
          <CharacterDetailModal
            character={slotCard}
            cardType="PLAYER"
            upgrades={flat[slotCard.id] || { atk: 0, def: 0 }}
            hustle={hustle}
            onUpgrade={onUpgrade(slotCard.id)}
            atkPerLevel={ATK_PER_LEVEL}
            defPerLevel={DEF_PER_LEVEL}
            maxUpgradeLevel={MAX_UPGRADE_LEVEL}
            costForLevel={HUSTLE_COST_PER_LEVEL}
            actions={[
              { label: 'Replace Slot',  icon: 'ti-arrows-exchange', kind: 'secondary',
                onClick: () => setEditing({ ...editing, openPicker: true }) },
              { label: 'Remove from Crew', icon: 'ti-trash', kind: 'danger',
                onClick: onRemove },
            ]}
            onClose={() => setEditing(null)}
          />
        )
      })()}

      {/* If the user picked Replace in the detail modal, we re-open the
          slot editor in picker mode for the same slot. */}
      {editing?.openPicker && (
        <SlotEditor
          editing={editing}
          benchCards={benchCards}
          upgrades={flat}
          onPick={onPick}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------

function Stat({ label, value, color }) {
  return (
    <div style={{
      background: '#13131f', border: '0.5px solid #2a2a3a',
      borderRadius: 14, padding: '12px 10px', textAlign: 'center',
    }}>
      <div style={{ color, fontSize: 18, fontWeight: 600, lineHeight: 1 }}>{value}</div>
      <div style={{ color: DIM, fontSize: 10, marginTop: 5, letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

function LeaderTile({ card, upgrades, onClick }) {
  if (!card) {
    return (
      <button onClick={onClick} className="btn" style={{
        width: '100%', background: '#13131f', border: `1px dashed ${GOLD}66`,
        borderRadius: 16, padding: 22, color: GOLD, fontSize: 14, fontWeight: 500,
      }}>
        <i className="ti ti-plus" /> Pick Your Leader
      </button>
    )
  }
  const ringColor = RARITY_COLORS[card.rarity] || GOLD
  const atk = atkOf(card, upgrades), def = defOf(card, upgrades)
  return (
    <div onClick={onClick} style={{
      background: `linear-gradient(135deg, ${ringColor}22 0%, #13131f 60%)`,
      border: `1px solid ${ringColor}66`,
      borderRadius: 16, padding: 14,
      display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
    }}>
      <div style={{ position: 'relative' }}>
        <Avatar src={card.face || card.avatar} emoji={card.emoji} size={CARD_TILE_ART} radius={12} />
        <div style={{
          position: 'absolute', top: -6, right: -6,
          background: GOLD, color: '#0a0a0f',
          fontSize: 9, fontWeight: 700, letterSpacing: 1,
          padding: '2px 6px', borderRadius: 4,
        }}>LEADER</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{card.name}</div>
        <div style={{
          color: ringColor, fontSize: 11, textTransform: 'uppercase',
          letterSpacing: 1.5, marginTop: 2,
        }}>{card.rarity}</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <StatChip label="ATK" value={atk} color={RED} />
          <StatChip label="DEF" value={def} color="#4a9eff" />
        </div>
      </div>
      <i className="ti ti-chevron-right" style={{ color: DIM, fontSize: 20 }} />
    </div>
  )
}

function MemberTile({ card, upgrades, onClick }) {
  if (!card) {
    return (
      <button onClick={onClick} className="btn" style={{
        background: '#13131f', border: '1px dashed #2a2a3a',
        borderRadius: 12, padding: '16px 8px',
        color: DIM, fontSize: 11, fontWeight: 500,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: CARD_TILE_ART + 70,
      }}>
        <i className="ti ti-plus" style={{ fontSize: 22, marginBottom: 4 }} />
        Add
      </button>
    )
  }
  const ringColor = RARITY_COLORS[card.rarity] || DIM
  const atk = atkOf(card, upgrades), def = defOf(card, upgrades)
  return (
    <div onClick={onClick} style={{
      background: '#13131f',
      border: `0.5px solid ${ringColor}66`,
      borderRadius: 12, padding: 8,
      cursor: 'pointer', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 3, background: ringColor,
      }} />
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6, marginBottom: 4 }}>
        <Avatar src={card.face || card.avatar} emoji={card.emoji} size={CARD_TILE_ART} radius={10} />
      </div>
      <div style={{
        color: '#fff', fontSize: 10, fontWeight: 500,
        textAlign: 'center', marginBottom: 4,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{card.name}</div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: 4,
        fontSize: 9, fontVariantNumeric: 'tabular-nums',
      }}>
        <div style={{ color: RED }}>A {atk}</div>
        <div style={{ color: '#4a9eff' }}>D {def}</div>
      </div>
    </div>
  )
}

function StatChip({ label, value, color }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: '#1e1e2a', borderRadius: 6, padding: '3px 8px',
      fontSize: 11, fontVariantNumeric: 'tabular-nums',
    }}>
      <span style={{ color: DIM, fontSize: 9, letterSpacing: 0.5 }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------
// Slot Editor — only handles empty slots now. Filled slots open the
// shared CharacterDetailModal (upgrades + Replace/Remove there).
// ---------------------------------------------------------------------

function SlotEditor({ editing, benchCards, upgrades, onPick, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center', zIndex: 250,
    }} onClick={onClose}>
      <div style={{
        background: '#13131f', width: '100%', maxWidth: 390,
        padding: 24, paddingTop: 60,
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>

        <div style={{
          color: GOLD, fontSize: 11, letterSpacing: 2,
          marginBottom: 14,
        }}>
          {editing.kind === 'leader' ? 'CREW LEADER' : `MEMBER SLOT ${editing.slotIndex + 1}`}
        </div>

        <CardPicker
          benchCards={benchCards}
          upgrades={upgrades}
          onPick={onPick}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}

function CardPicker({ benchCards, upgrades, onPick, onCancel }) {
  return (
    <>
      <div style={{ color: '#fff', fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
        Pick a Card
      </div>
      <div style={{ color: DIM, fontSize: 12, marginBottom: 16 }}>
        Owned cards not in your crew. Open packs to unlock more.
      </div>

      {benchCards.length === 0 ? (
        <div style={{
          background: '#1e1e2a', borderRadius: 12, padding: 18, textAlign: 'center',
          color: DIM, fontSize: 13, marginBottom: 16,
        }}>
          No bench cards. Every owned card is already in your crew.
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
          marginBottom: 16,
        }}>
          {benchCards.map(card => {
            const ringColor = RARITY_COLORS[card.rarity] || DIM
            return (
              <div key={card.id} onClick={() => onPick(card.id)} style={{
                background: '#13131f',
                border: `0.5px solid ${ringColor}66`,
                borderRadius: 12, padding: 10,
                cursor: 'pointer', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: 3, background: ringColor,
                }} />
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                  <Avatar src={card.face || card.avatar} emoji={card.emoji} size={56} radius={10} />
                </div>
                <div style={{
                  color: '#fff', fontSize: 12, fontWeight: 500,
                  textAlign: 'center', marginTop: 8,
                }}>{card.name}</div>
                <div style={{
                  color: ringColor, fontSize: 9, textAlign: 'center',
                  textTransform: 'uppercase', letterSpacing: 1, marginTop: 2,
                }}>{card.rarity}</div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', gap: 4,
                  marginTop: 8, fontSize: 10, fontVariantNumeric: 'tabular-nums',
                }}>
                  <span style={{ color: RED }}>ATK {atkOf(card, upgrades)}</span>
                  <span style={{ color: '#4a9eff' }}>DEF {defOf(card, upgrades)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={onCancel}>
        Close
      </button>
    </>
  )
}

