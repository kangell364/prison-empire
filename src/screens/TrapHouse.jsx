import React, { useState, useEffect } from 'react'
import { CARDS_COLLECTION, RARITY_COLORS } from '../data/gameData'
import { useCardCounts, getOwnedTuples } from '../state/cardsStore'
import {
  useTrapHouse, tickProduction, workerHaul,
  plantTable, uprootTable, buyTable, upgradePlants,
  tableCost, plantsCost, tableCapacity, tablePlants, tableFillPct, getBank,
  TABLE_MAX, STRAIN,
} from '../state/trapHouseStore'
import { sfx } from '../sounds'
import { Avatar } from '../components/Avatar'

const GOLD = '#c9a84c'
const GREEN = '#2ecc71'
const BLUE = '#4a9eff'
const DIM = '#7a7468'

function cardOf(id) { return CARDS_COLLECTION.find(c => c.id === id) }

// The operation, front-to-back. Product flows front-ward (grow → pack → shelf);
// the player walks back-ward with the arrows to manage it. Each room has its own
// full-screen art; rooms without art yet render a styled placeholder scene.
const ROOMS = [
  { key: 'shop', name: 'Shop Front', art: '/shop-front.webp', accent: GOLD, hint: 'Customers buy here. Sales bank cash.' },
  { key: 'pack', name: 'Packing',    art: '/packing-room.webp', accent: BLUE, hint: 'Raw product gets cut & packed into sellable units.' },
  { key: 'grow', name: 'Grow Room',  art: '/grow-room.webp',  accent: GREEN, hint: 'Plant a card on a table to grow product. The worker hauls full containers to the bank.' },
]

// `isOwner` is the owner-vs-visitor split. Only the owner walks the back rooms;
// the visitor view is a separate build (coming later). For now always owner.
export default function TrapHouse({ onBack, isOwner = true }) {
  const house = useTrapHouse()
  const [room, setRoom] = useState(0)
  const [picking, setPicking] = useState(null)   // table index being planted

  // Keep the economy live the whole time the interior is open, regardless of
  // which room you're standing in.
  useEffect(() => { const t = setInterval(tickProduction, 1000); return () => clearInterval(t) }, [])
  useEffect(() => { const t = setInterval(() => { workerHaul() }, 3500); return () => clearInterval(t) }, [])

  const cur = ROOMS[room]
  const go = (dir) => {
    const next = room + dir
    if (next < 0 || next >= ROOMS.length) return
    sfx.tap?.(); setRoom(next)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#0c0a08', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Keyframes />

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'rgba(0,0,0,0.6)', zIndex: 5 }}>
        <button className="btn btn-dark" onClick={onBack} style={{ padding: '6px 11px', fontSize: 12 }}>
          <i className="ti ti-arrow-left" /> Out
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: cur.accent, fontSize: 9, fontWeight: 800, letterSpacing: 1.5 }}>TRAP HOUSE</div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>{cur.name}</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1a1510', border: `0.5px solid ${GOLD}55`, borderRadius: 10, padding: '6px 12px' }}>
          <i className="ti ti-cash" style={{ color: GOLD, fontSize: 15 }} />
          <span style={{ color: GOLD, fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{getBank().toLocaleString()}</span>
          <span style={{ color: DIM, fontSize: 10 }}>bank</span>
        </div>
      </div>

      {/* Room stage */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {cur.key === 'shop' && <ShopFront art={cur.art} />}
        {cur.key === 'pack' && <PackingRoom />}
        {cur.key === 'grow' && <GrowRoom house={house} onPlant={(i) => { sfx.tap?.(); setPicking(i) }} />}

        {/* Arrows — step between rooms. Left = toward the front, right = deeper. */}
        {room > 0 && <RoomArrow side="left"  label={ROOMS[room - 1].name} onClick={() => go(-1)} />}
        {room < ROOMS.length - 1 && <RoomArrow side="right" label={ROOMS[room + 1].name} onClick={() => go(1)} />}
      </div>

      {/* Room dots + hint */}
      <div style={{ padding: '7px 14px 9px', background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', gap: 7 }}>
          {ROOMS.map((r, i) => (
            <button key={r.key} onClick={() => { sfx.tap?.(); setRoom(i) }}
              style={{ width: i === room ? 18 : 7, height: 7, borderRadius: 4, border: 'none', cursor: 'pointer', transition: 'all .2s',
                background: i === room ? r.accent : '#3a352c' }} aria-label={r.name} />
          ))}
        </div>
        <div style={{ color: DIM, fontSize: 10.5, textAlign: 'center', lineHeight: 1.4, maxWidth: 340 }}>{cur.hint}</div>
      </div>

      {picking != null && (
        <PlantPicker onClose={() => setPicking(null)} onPick={(card) => { plantTable(picking, card); sfx.buy?.(); setPicking(null) }} />
      )}
    </div>
  )
}

// A full-bleed room arrow pinned to the screen edge.
function RoomArrow({ side, label, onClick }) {
  const isLeft = side === 'left'
  return (
    <button onClick={onClick}
      style={{ position: 'absolute', [side]: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 6,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        background: 'rgba(0,0,0,0.55)', border: '0.5px solid rgba(255,255,255,0.18)', borderRadius: 14,
        padding: '12px 9px', cursor: 'pointer', backdropFilter: 'blur(2px)', animation: 'arrowPulse 2.4s ease-in-out infinite' }}>
      <i className={`ti ti-chevron-${isLeft ? 'left' : 'right'}`} style={{ color: '#fff', fontSize: 22 }} />
      <span style={{ color: '#fff', fontSize: 8, fontWeight: 700, letterSpacing: 0.5, writingMode: 'vertical-rl', transform: isLeft ? 'rotate(180deg)' : 'none', maxHeight: 70, overflow: 'hidden' }}>{label}</span>
    </button>
  )
}

// ---- SHOP FRONT --------------------------------------------------------
// The customer-facing storefront. Real art, fit fully into the screen. Stocking
// shelves + customer sales is the next mechanic; for now the room is the anchor.
function ShopFront({ art }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={art} alt="Shop Front" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
    </div>
  )
}

// ---- PACKING -----------------------------------------------------------
// Raw product feeds the line on the left, runs through the machine, and drops
// as packed units on the right. Real art now; the packing mechanic is next.
function PackingRoom() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src="/packing-room.webp" alt="Packing Room" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
    </div>
  )
}

// ---- GROW ROOM ---------------------------------------------------------
// The working production floor. The room art shows the grow benches; the
// interactive tables dock along the bottom over a scrim so they stay readable.
// Tables grow product into containers; the worker hauls full ones to the bank.
function GrowRoom({ house, onPlant }) {
  const tables = house.tables || []
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src="/grow-room.webp" alt="Grow Room" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />

      {/* Interactive tables — docked along the bottom, horizontally scrollable. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 12px 12px',
        background: 'linear-gradient(180deg, rgba(10,15,11,0) 0%, rgba(10,15,11,0.82) 38%)' }}>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', alignItems: 'flex-end', paddingBottom: 2 }}>
          {tables.map((t, i) => <TableSlot key={i} table={t} index={i} onPlant={() => onPlant(i)} />)}
          {tables.length < TABLE_MAX && (
            <button onClick={() => { if (buyTable()) sfx.buy?.(); else sfx.deny?.() }}
              style={{ flex: '0 0 auto', width: 96, height: 116, borderRadius: 12, border: '1px dashed #3a3a44', background: 'rgba(0,0,0,0.45)', color: DIM, fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <i className="ti ti-plus" style={{ fontSize: 20 }} />
              <span>Buy Table</span>
              <span style={{ color: GOLD }}>{tableCost().toLocaleString()}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TableSlot({ table, index, onPlant }) {
  if (!table) {
    return (
      <button onClick={onPlant} style={{ flex: '0 0 auto', width: 96, height: 116, borderRadius: 12, border: '1px dashed #2f3a2f', background: 'rgba(20,30,20,0.55)', color: '#5a7a5a', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <i className="ti ti-seeding" style={{ fontSize: 22 }} />
        <span>Plant</span>
      </button>
    )
  }
  const card = cardOf(table.cardId)
  const color = RARITY_COLORS[card?.rarity] || GOLD
  const pct = tableFillPct(table)
  const plants = tablePlants(table)
  const cap = Math.round(tableCapacity(table))
  return (
    <div style={{ flex: '0 0 auto', width: 96, height: 116, borderRadius: 12, border: `0.5px solid ${color}66`, background: 'rgba(0,0,0,0.55)', padding: 7, position: 'relative', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <button onClick={() => { uprootTable(index); sfx.tap?.() }} title="Uproot"
        style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 5, background: '#1e1e2a', border: '0.5px solid #2a2a3a', color: DIM, fontSize: 9, cursor: 'pointer', zIndex: 1 }}>
        <i className="ti ti-x" />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Avatar src={card?.avatar} emoji={card?.emoji} size={28} radius={6} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 48 }}>{card?.name}</div>
          <div style={{ color: GREEN, fontSize: 8 }}>🌿 {plants}</div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
        <div style={{ flex: 1, height: '100%', background: '#14140f', borderRadius: 4, border: '0.5px solid #2a2a22', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${pct}%`, background: `linear-gradient(180deg, ${GREEN}, #1f8a4a)`, transition: 'height 1s linear' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: '#fff', fontWeight: 700 }}>{Math.floor(table.container || 0)}/{cap}</div>
        </div>
      </div>
      <button onClick={() => { if (upgradePlants(index)) sfx.buy?.(); else sfx.deny?.() }}
        style={{ padding: '3px 0', borderRadius: 6, background: GOLD, color: '#0a0a0f', border: 'none', fontSize: 8, fontWeight: 800, cursor: 'pointer' }}>
        +4🌿 · {plantsCost(table).toLocaleString()}
      </button>
    </div>
  )
}

// Pick a card from your collection to plant on a table.
function PlantPicker({ onClose, onPick }) {
  useCardCounts()
  const owned = getOwnedTuples()
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="card card-pad" style={{ width: '100%', maxWidth: 460, maxHeight: '86%', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Plant a card</div>
        <div style={{ color: DIM, fontSize: 11, marginBottom: 12 }}>Rarer cards grow faster product; higher level grows more.</div>
        {owned.length === 0
          ? <div style={{ color: DIM, fontSize: 13, textAlign: 'center', padding: 24 }}>No cards yet — pull packs to get some.</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {owned.map(t => {
                const card = cardOf(t.id)
                if (!card) return null
                const color = RARITY_COLORS[card.rarity] || GOLD
                const s = STRAIN[card.rarity] || STRAIN.common
                return (
                  <button key={`${t.id}:${t.level}`} onClick={() => onPick({ cardId: t.id, level: t.level })} className="card card-pad"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, textAlign: 'left', border: `0.5px solid ${color}44`, cursor: 'pointer' }}>
                    <Avatar src={card.avatar} emoji={card.emoji} size={32} radius={7} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                      <div style={{ color: GREEN, fontSize: 9, marginTop: 1, textTransform: 'capitalize' }}>{card.rarity} · {s.yield}/cycle</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
      </div>
    </div>
  )
}

function Keyframes() {
  return (
    <style>{`
      @keyframes arrowPulse { 0%,100%{opacity:.7} 50%{opacity:1} }
    `}</style>
  )
}
