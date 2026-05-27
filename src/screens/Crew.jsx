import React, { useMemo, useState } from 'react'
import { CARDS_COLLECTION, RARITY_COLORS } from '../data/gameData'
import { Avatar } from '../components/Avatar'
import { sfx } from '../sounds'
import { CrewBattleModal } from '../components/CrewBattleModal'
import { buildPracticeCrew } from '../data/opponentCrews'
import {
  useCrew, setLeader, setMember, clearSlot, upgradeStat,
  atkOf, defOf, upgradeLevels,
  MAX_UPGRADE_LEVEL, HUSTLE_COST_PER_LEVEL,
  ATK_PER_LEVEL, DEF_PER_LEVEL,
} from '../state/crewStore'
import { useHustle, spendHustle, addHustle } from '../state/playerStore'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#555'

// Quick lookup for card-by-id
const CARD_BY_ID = new Map(CARDS_COLLECTION.map(c => [c.id, c]))

export default function Crew() {
  const crew    = useCrew()
  const hustle  = useHustle()
  const [editing, setEditing] = useState(null)  // { kind: 'leader'|'member', slotIndex?: number }
  const [battling, setBattling] = useState(null)  // opponent object when modal is open

  const leaderCard = crew.leader != null ? CARD_BY_ID.get(crew.leader) : null
  const memberCards = crew.members.map(id => id != null ? CARD_BY_ID.get(id) : null)

  // Combined totals — sum of all 12 cards' ATK/DEF
  const totals = useMemo(() => {
    let atk = 0, def = 0, filled = 0
    const all = [leaderCard, ...memberCards].filter(Boolean)
    all.forEach(c => { atk += atkOf(c, crew.upgrades); def += defOf(c, crew.upgrades); filled++ })
    return { atk, def, filled, total: 12 }
  }, [leaderCard, memberCards, crew.upgrades])

  // Owned cards not currently in any slot — for the picker
  const benchCards = useMemo(() => {
    const inUse = new Set([crew.leader, ...crew.members].filter(x => x != null))
    return CARDS_COLLECTION.filter(c => c.owned && !inUse.has(c.id))
  }, [crew.leader, crew.members])

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

  const onUpgrade = (cardId, stat) => {
    const u = upgradeLevels(cardId, crew.upgrades)
    const current = u[stat] || 0
    if (current >= MAX_UPGRADE_LEVEL) return
    const cost = HUSTLE_COST_PER_LEVEL(current)
    if (spendHustle(cost)) {
      upgradeStat(cardId, stat)
      sfx.buy()
    } else {
      sfx.deny()
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
      {/* Header: combined stats + Hustle balance */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Stat label="Crew ATK"  value={totals.atk.toLocaleString()} color={RED} />
          <Stat label="Crew DEF"  value={totals.def.toLocaleString()} color="#4a9eff" />
          <Stat label="Hustle"    value={hustle.toLocaleString()}     color={GOLD} />
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
          upgrades={crew.upgrades}
          onClick={() => setEditing({ kind: 'leader' })}
        />
      </div>

      {/* 11 Member Slots */}
      <div className="section">
        <div className="section-label">Crew Members</div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        }}>
          {memberCards.map((c, i) => (
            <MemberTile
              key={i}
              card={c}
              upgrades={crew.upgrades}
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
            upgrades: crew.upgrades,
          }}
          opponent={battling}
          onClose={() => setBattling(null)}
          onWin={onBattleWin}
        />
      )}

      {editing && (
        <SlotEditor
          editing={editing}
          card={
            editing.kind === 'leader'
              ? leaderCard
              : memberCards[editing.slotIndex]
          }
          upgrades={crew.upgrades}
          hustle={hustle}
          benchCards={benchCards}
          onPick={onPick}
          onRemove={onRemove}
          onUpgrade={onUpgrade}
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
        <Avatar src={card.avatar} emoji={card.emoji} size={72} radius={12} />
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
        minHeight: 110,
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
        <Avatar src={card.avatar} emoji={card.emoji} size={44} radius={8} />
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
// Slot Editor — full-viewport overlay with two modes:
//   - Empty slot: card picker
//   - Filled slot: detail + upgrade panel + Replace/Remove actions
// ---------------------------------------------------------------------

function SlotEditor({ editing, card, upgrades, hustle, benchCards, onPick, onRemove, onUpgrade, onClose }) {
  const [pickerOpen, setPickerOpen] = useState(card == null)

  // Switch to picker if the slot becomes empty (e.g., right after Remove)
  if (card == null && !pickerOpen) setPickerOpen(true)

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

        {pickerOpen ? (
          <CardPicker
            benchCards={benchCards}
            onPick={onPick}
            onCancel={() => card == null ? onClose() : setPickerOpen(false)}
            canCancel={card != null}
          />
        ) : (
          <UpgradePanel
            card={card}
            upgrades={upgrades}
            hustle={hustle}
            onUpgrade={onUpgrade}
            onReplace={() => setPickerOpen(true)}
            onRemove={onRemove}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

function CardPicker({ benchCards, onPick, onCancel, canCancel }) {
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
                  <Avatar src={card.avatar} emoji={card.emoji} size={56} radius={10} />
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
                  <span style={{ color: RED }}>ATK {atkOf(card)}</span>
                  <span style={{ color: '#4a9eff' }}>DEF {defOf(card)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={onCancel}>
        {canCancel ? 'Back' : 'Close'}
      </button>
    </>
  )
}

function UpgradePanel({ card, upgrades, hustle, onUpgrade, onReplace, onRemove, onClose }) {
  const ringColor = RARITY_COLORS[card.rarity] || GOLD
  const u = upgradeLevels(card.id, upgrades)

  return (
    <>
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${ringColor}33 0%, #13131f 70%)`,
        border: `0.5px solid ${ringColor}66`,
        borderRadius: 16, padding: 16, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <Avatar src={card.avatar} emoji={card.emoji} size={84} radius={14} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>{card.name}</div>
          <div style={{
            color: ringColor, fontSize: 10, textTransform: 'uppercase',
            letterSpacing: 1.5, marginTop: 2,
          }}>{card.rarity}</div>
          {card.special && (
            <div style={{
              color: GOLD, fontSize: 11, marginTop: 6,
              background: `${GOLD}18`, border: `0.5px solid ${GOLD}44`,
              padding: '3px 8px', borderRadius: 6, display: 'inline-block',
            }}>{card.special}</div>
          )}
        </div>
      </div>

      {/* Stats + upgrade */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <UpgradeRow
          label="ATTACK"
          color={RED}
          card={card}
          stat="atk"
          value={atkOf(card, upgrades)}
          level={u.atk || 0}
          perLevel={ATK_PER_LEVEL}
          hustle={hustle}
          onUpgrade={onUpgrade}
        />
        <UpgradeRow
          label="DEFENSE"
          color="#4a9eff"
          card={card}
          stat="def"
          value={defOf(card, upgrades)}
          level={u.def || 0}
          perLevel={DEF_PER_LEVEL}
          hustle={hustle}
          onUpgrade={onUpgrade}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
        <button className="btn btn-dark btn-full" style={{ padding: 12 }} onClick={onReplace}>
          <i className="ti ti-arrows-exchange" /> Replace
        </button>
        <button className="btn btn-dark btn-full" style={{ padding: 12, color: RED }} onClick={onRemove}>
          <i className="ti ti-trash" /> Remove from Crew
        </button>
        <button className="btn btn-gold btn-full" style={{ padding: 14 }} onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}

function UpgradeRow({ label, color, card, stat, value, level, perLevel, hustle, onUpgrade }) {
  const maxed = level >= MAX_UPGRADE_LEVEL
  const cost  = maxed ? null : HUSTLE_COST_PER_LEVEL(level)
  const canAfford = cost != null && hustle >= cost

  return (
    <div style={{
      background: '#13131f',
      border: `0.5px solid ${color}33`,
      borderRadius: 12, padding: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ color, fontSize: 11, letterSpacing: 2, fontWeight: 600 }}>{label}</div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>LVL</div>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
            {level}/{MAX_UPGRADE_LEVEL}
          </div>
        </div>
      </div>

      <button
        onClick={() => !maxed && canAfford && onUpgrade(card.id, stat)}
        disabled={maxed || !canAfford}
        className="btn btn-full"
        style={{
          padding: 10,
          background: maxed ? '#1e1e2a' : canAfford ? `${color}22` : '#1e1e2a',
          border: `0.5px solid ${maxed ? '#2a2a3a' : canAfford ? color + '66' : '#2a2a3a'}`,
          color: maxed ? DIM : canAfford ? color : DIM,
          fontSize: 12, fontWeight: 500,
          opacity: !maxed && !canAfford ? 0.55 : 1,
        }}
      >
        {maxed
          ? 'MAXED OUT'
          : <>+{perLevel} {label} <span style={{ opacity: 0.7, marginLeft: 8 }}>— {cost.toLocaleString()} Hustle</span></>
        }
      </button>
    </div>
  )
}
