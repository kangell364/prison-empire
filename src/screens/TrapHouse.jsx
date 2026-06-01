import React, { useState, useEffect, useRef } from 'react'
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
const DIM = '#666'

const isLandscape = () => (typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : true)
function cardOf(id) { return CARDS_COLLECTION.find(c => c.id === id) }

export default function TrapHouse({ onBack }) {
  const house = useTrapHouse()
  const [land, setLand] = useState(isLandscape())
  const [picking, setPicking] = useState(null)   // table index being planted
  const [crates, setCrates] = useState([])
  const crateId = useRef(0)

  // Orientation gate — the interior is a landscape "side view".
  useEffect(() => {
    const f = () => setLand(isLandscape())
    window.addEventListener('resize', f)
    window.addEventListener('orientationchange', f)
    return () => { window.removeEventListener('resize', f); window.removeEventListener('orientationchange', f) }
  }, [])

  // Live container fills.
  useEffect(() => { const t = setInterval(tickProduction, 1000); return () => clearInterval(t) }, [])

  // The worker: every cycle, haul the fullest container → bank, and slide a
  // crate down the conveyor toward packaging.
  useEffect(() => {
    if (!land) return
    const iv = setInterval(() => {
      const r = workerHaul()
      if (r && r.gain) {
        const id = crateId.current++
        setCrates(cs => [...cs, { id }])
        setTimeout(() => setCrates(cs => cs.filter(c => c.id !== id)), 2400)
      }
    }, 3500)
    return () => clearInterval(iv)
  }, [land])

  if (!land) return <RotateGate onBack={onBack} />

  const tables = house.tables || []
  const planted = tables.filter(Boolean).length

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#0c0a08', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Keyframes />
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'rgba(0,0,0,0.55)', zIndex: 5 }}>
        <button className="btn btn-dark" onClick={onBack} style={{ padding: '6px 11px', fontSize: 12 }}>
          <i className="ti ti-arrow-left" /> Out
        </button>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>Trap House</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1a1510', border: `0.5px solid ${GOLD}55`, borderRadius: 10, padding: '6px 12px' }}>
          <i className="ti ti-cash" style={{ color: GOLD, fontSize: 15 }} />
          <span style={{ color: GOLD, fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{getBank().toLocaleString()}</span>
          <span style={{ color: DIM, fontSize: 10 }}>bank</span>
        </div>
      </div>

      {/* The floor — three rooms side by side */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', minHeight: 0,
        background: 'linear-gradient(180deg, #14110d 0%, #14110d 42%, #1c1812 42%, #100d0a 100%)' }}>

        {/* GROW ROOM */}
        <Room flex={2.1} label="GROW ROOM" accent={GREEN}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start', padding: '4px 6px', overflowY: 'auto', height: '100%' }}>
            {tables.map((t, i) => (
              <TableSlot key={i} table={t} index={i} onPlant={() => { sfx.tap?.(); setPicking(i) }} />
            ))}
            {tables.length < TABLE_MAX && (
              <button onClick={() => { if (buyTable()) sfx.buy?.(); else sfx.deny?.() }}
                style={{ width: 86, height: 104, borderRadius: 10, border: '1px dashed #3a3a44', background: 'rgba(0,0,0,0.25)', color: DIM, fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <i className="ti ti-plus" style={{ fontSize: 18 }} />
                <span>Buy Table</span>
                <span style={{ color: GOLD }}>{tableCost().toLocaleString()}</span>
              </button>
            )}
          </div>

          {/* Conveyor along the bottom — crates ride it toward packaging. */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 16, background: 'repeating-linear-gradient(90deg, #2a2a2a 0 10px, #1e1e1e 10px 20px)', borderTop: '1px solid #333' }}>
            {crates.map(c => (
              <div key={c.id} style={{ position: 'absolute', top: -8, left: 0, animation: 'crateRide 2.4s linear forwards', fontSize: 16 }}>📦</div>
            ))}
          </div>

          {/* The worker — paces the grow floor hauling product. */}
          <div style={{ position: 'absolute', bottom: 18, animation: 'workerPace 4s ease-in-out infinite', fontSize: 26, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.6))' }}>🧍‍♂️</div>
        </Room>

        {/* PACKAGING */}
        <Room flex={1.1} label="PACKAGING" accent="#4a9eff">
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: DIM }}>
            <div style={{ fontSize: 30 }}>🏭</div>
            <div style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.4 }}>Crates arrive here.<br />Packaging line — soon.</div>
          </div>
        </Room>

        {/* FRONT COUNTER */}
        <Room flex={1.4} label="FRONT COUNTER" accent={GOLD} last>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, position: 'relative' }}>
            <div style={{ fontSize: 28 }}>🛒</div>
            <div style={{ width: '70%', height: 8, background: '#2a2418', borderRadius: 3, border: `0.5px solid ${GOLD}44` }} />
            <div style={{ color: DIM, fontSize: 10, textAlign: 'center', lineHeight: 1.4 }}>Customers buy here.<br />Sales bank cash.</div>
            {/* A customer pacing up to the counter. */}
            <div style={{ position: 'absolute', bottom: 10, animation: 'customerPace 5s ease-in-out infinite', fontSize: 22 }}>🚶</div>
          </div>
        </Room>
      </div>

      {/* Hint strip */}
      <div style={{ padding: '5px 14px', background: 'rgba(0,0,0,0.5)', color: DIM, fontSize: 10, textAlign: 'center' }}>
        {planted === 0 ? 'Plant a card on a table to start growing. The worker hauls full containers to the bank.' : 'Growing — the worker auto-hauls full containers. Spend the bank on tables & +plants.'}
      </div>

      {picking != null && (
        <PlantPicker onClose={() => setPicking(null)} onPick={(card) => { plantTable(picking, card); sfx.buy?.(); setPicking(null) }} />
      )}
    </div>
  )
}

function Room({ flex, label, accent, last, children }) {
  return (
    <div style={{ flex, position: 'relative', borderRight: last ? 'none' : '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ padding: '4px 8px', fontSize: 9, fontWeight: 800, letterSpacing: 1, color: accent, background: 'rgba(0,0,0,0.4)' }}>{label}</div>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>{children}</div>
    </div>
  )
}

function TableSlot({ table, index, onPlant }) {
  if (!table) {
    return (
      <button onClick={onPlant} style={{ width: 86, height: 104, borderRadius: 10, border: '1px dashed #2f3a2f', background: 'rgba(20,30,20,0.4)', color: '#4a6a4a', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <i className="ti ti-seeding" style={{ fontSize: 20 }} />
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
    <div style={{ width: 86, height: 104, borderRadius: 10, border: `0.5px solid ${color}66`, background: 'rgba(0,0,0,0.35)', padding: 6, position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button onClick={() => { uprootTable(index); sfx.tap?.() }} title="Uproot"
        style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 5, background: '#1e1e2a', border: '0.5px solid #2a2a3a', color: DIM, fontSize: 9, cursor: 'pointer', zIndex: 1 }}>
        <i className="ti ti-x" />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Avatar src={card?.avatar} emoji={card?.emoji} size={26} radius={6} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 44 }}>{card?.name}</div>
          <div style={{ color: GREEN, fontSize: 8 }}>🌿 {plants}</div>
        </div>
      </div>
      {/* container fill */}
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

function RotateGate({ onBack }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 30 }}>
      <div style={{ fontSize: 56, animation: 'rotateHint 2s ease-in-out infinite' }}>📱</div>
      <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginTop: 18 }}>Turn your phone sideways</div>
      <div style={{ color: DIM, fontSize: 13, marginTop: 8, lineHeight: 1.5, maxWidth: 280 }}>
        Step inside the Trap House. Rotate to landscape to walk the floor.
      </div>
      <button className="btn btn-dark" onClick={onBack} style={{ marginTop: 26, padding: '10px 18px' }}>
        <i className="ti ti-arrow-left" /> Back
      </button>
      <Keyframes />
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
      @keyframes workerPace { 0%{left:6%} 50%{left:46%} 100%{left:6%} }
      @keyframes customerPace { 0%{transform:translateX(-22px)} 50%{transform:translateX(22px)} 100%{transform:translateX(-22px)} }
      @keyframes crateRide { 0%{left:4%;opacity:1} 90%{opacity:1} 100%{left:98%;opacity:0} }
      @keyframes rotateHint { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(90deg)} }
    `}</style>
  )
}
