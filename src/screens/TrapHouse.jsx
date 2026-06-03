import React, { useState, useEffect } from 'react'
import { sfx } from '../sounds'
import { PLANTS, plantCashValue, RARITY_COLORS } from '../data/gameData'
import { getOwnedPlantTuples } from '../state/plantCardsStore'
import { Avatar } from '../components/Avatar'

const GOLD = '#c9a84c'
const GREEN = '#2ecc71'
const BLUE = '#4a9eff'
const DIM = '#7a7468'

function isLandscape() {
  if (typeof window === 'undefined') return false
  try { if (window.matchMedia) return window.matchMedia('(orientation: landscape)').matches } catch {}
  return window.innerWidth > window.innerHeight
}

// The operation, front-to-back. Product flows front-ward (grow → pack → shelf);
// the player walks back-ward with the arrows to manage it. Each room has its own
// full-screen art; rooms without art yet render a styled placeholder scene.
const ROOMS = [
  { key: 'shop', name: 'Shop Front', art: '/shop-front.webp', accent: GOLD, hint: 'Customers buy here. Sales bank cash.' },
  { key: 'pack', name: 'Packing',    art: '/packing-room.webp', accent: BLUE, hint: 'Raw product gets cut & packed into sellable units.' },
  { key: 'grow', name: 'Grow Room',  art: '/grow-room.webp',  accent: GREEN, hint: 'Plants grow product that travels down to the bins.' },
]

// `isOwner` is the owner-vs-visitor split. Only the owner walks the back rooms;
// the visitor view is a separate build (coming later). For now always owner.
export default function TrapHouse({ onBack, isOwner = true }) {
  const [room, setRoom] = useState(0)
  const [land, setLand] = useState(isLandscape())
  const [rotated, setRotated] = useState(false)  // manual CSS rotate (works even with iOS orientation-lock on)
  const [planted, setPlanted] = useState([])     // which plant slots are placed (each brings its bud + path)
  const [bank, setBank] = useState(200000)       // this store's bank balance ($) — full bank for testing
  // Running tally of buds delivered into each table's bin. One bud "drops" each
  // time its path animation completes a loop; the counter on the box reflects it.
  const [budCounts, setBudCounts] = useState({ 1: 0, 2: 0, 3: 0 })
  const countBud = (table) => setBudCounts(c => ({ ...c, [table]: (c[table] || 0) + 1 }))
  // Which Grow Card is planted on each table (the card the player added).
  const [tableCards, setTableCards] = useState({})
  // Which table the "+ Add" slot was tapped for — opens the card picker.
  const [picking, setPicking] = useState(null)

  // Place a plant slot, charging the bank (no-op if you can't afford it).
  const placeSlot = (slot, cost) => {
    if (bank < cost || planted.includes(slot)) return
    setBank(b => b - cost)
    setPlanted(p => [...p, slot])
    sfx.buy?.()
  }

  // Add a chosen Grow Card to a table — fills its first (P4) plant slot and
  // records the card. Triggered by picking a card in the "+ Add" picker.
  const addPlant = (table, plant) => {
    const slot = firstSlot(table)
    if (planted.includes(slot)) return
    setTableCards(tc => ({ ...tc, [table]: plant.id }))
    setPlanted(p => [...p, slot])
    setPicking(null)
    sfx.buy?.()
  }

  // True landscape — either the browser actually rotated, or we forced it via CSS.
  const wide = land || rotated

  // Track orientation — the room art is a landscape scene, so turning the phone
  // sideways lets it fill the whole screen for a bigger view. (No gate; the room
  // is always usable, it just grows when you rotate.)
  useEffect(() => {
    const f = () => setLand(isLandscape())
    const delayed = () => setTimeout(f, 250)   // mobile dims settle a beat late
    window.addEventListener('resize', f)
    window.addEventListener('orientationchange', delayed)
    let mq
    try { mq = window.matchMedia('(orientation: landscape)'); mq.addEventListener ? mq.addEventListener('change', f) : mq.addListener(f) } catch {}
    return () => {
      window.removeEventListener('resize', f)
      window.removeEventListener('orientationchange', delayed)
      try { mq && (mq.removeEventListener ? mq.removeEventListener('change', f) : mq.removeListener(f)) } catch {}
    }
  }, [])

  const cur = ROOMS[room]
  const go = (dir) => {
    const next = room + dir
    if (next < 0 || next >= ROOMS.length) return
    sfx.tap?.(); setRoom(next)
  }

  // When the phone won't auto-rotate (iOS orientation lock), the rotate button
  // CSS-spins the whole interior 90° and swaps its dimensions, so holding the
  // phone sideways shows a true fullscreen landscape room.
  const containerStyle = rotated
    ? { position: 'fixed', zIndex: 400, background: '#0c0a08', overflow: 'hidden',
        width: '100vh', height: '100vw', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%) rotate(90deg)', transformOrigin: 'center center' }
    : { position: 'fixed', inset: 0, zIndex: 400, background: '#0c0a08', overflow: 'hidden' }

  return (
    <div style={containerStyle}>
      <Keyframes />

      {/* Room fills the whole screen as a backdrop — so it grows to fill the
          display when the phone is turned sideways. Controls float on top. */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {cur.key === 'shop' && <ShopFront art={cur.art} />}
        {cur.key === 'pack' && <PackingRoom />}
        {cur.key === 'grow' && <GrowRoom planted={planted} bank={bank} onPlace={placeSlot} budCounts={budCounts} onBud={countBud} tableCards={tableCards} onAdd={setPicking} />}
      </div>

      {/* Arrows — step between rooms. Left = toward the front, right = deeper. */}
      {room > 0 && <RoomArrow side="left"  label={ROOMS[room - 1].name} onClick={() => go(-1)} />}
      {room < ROOMS.length - 1 && <RoomArrow side="right" label={ROOMS[room + 1].name} onClick={() => go(1)} />}

      {/* Floating top bar — padded for the notch / Dynamic Island + side cutout. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(8px + env(safe-area-inset-top)) calc(14px + env(safe-area-inset-right)) 10px calc(14px + env(safe-area-inset-left))',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 100%)' }}>
        <button className="btn btn-dark" onClick={onBack} style={{ padding: '6px 11px', fontSize: 12 }}>
          <i className="ti ti-arrow-left" /> Out
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: cur.accent, fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textShadow: '0 1px 3px #000' }}>TRAP HOUSE</div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, lineHeight: 1.1, textShadow: '0 1px 4px #000' }}>{cur.name}</div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Rotate to fullscreen landscape — only when the browser isn't already
            landscape (otherwise it'd double-rotate). Works with iOS lock on. */}
        {!land && (
          <button onClick={() => { sfx.tap?.(); setRotated(r => !r) }}
            title={rotated ? 'Exit fullscreen' : 'Rotate to fullscreen'}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9,
              background: rotated ? GOLD : 'rgba(26,21,16,0.85)', border: `0.5px solid ${GOLD}55`, cursor: 'pointer' }}>
            <i className={rotated ? 'ti ti-minimize' : 'ti ti-device-mobile-rotated'} style={{ color: rotated ? '#0a0a0f' : GOLD, fontSize: 17 }} />
          </button>
        )}
        {/* Bank balance for this store. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', background: 'rgba(26,21,16,0.85)', border: `0.5px solid ${GOLD}55`, borderRadius: 10, padding: '4px 11px' }}>
          <span style={{ color: DIM, fontSize: 8, fontWeight: 700, letterSpacing: 1 }}>BANK</span>
          <span style={{ color: GREEN, fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>${bank.toLocaleString()}</span>
        </div>
      </div>

      {/* Floating room dots + hint — padded for the home indicator + side cutout. */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '14px calc(14px + env(safe-area-inset-right)) calc(9px + env(safe-area-inset-bottom)) calc(14px + env(safe-area-inset-left))',
        background: 'linear-gradient(0deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)' }}>
        <div style={{ display: 'flex', gap: 7 }}>
          {ROOMS.map((r, i) => (
            <button key={r.key} onClick={() => { sfx.tap?.(); setRoom(i) }}
              style={{ width: i === room ? 18 : 7, height: 7, borderRadius: 4, border: 'none', cursor: 'pointer', transition: 'all .2s',
                background: i === room ? r.accent : '#3a352c' }} aria-label={r.name} />
          ))}
        </div>
        {/* Hint only when not in the big landscape view (portrait, upright). */}
        {!wide && (
          <div style={{ color: DIM, fontSize: 10.5, textAlign: 'center', lineHeight: 1.4, maxWidth: 340, textShadow: '0 1px 3px #000' }}>
            {cur.hint} <span style={{ color: '#9a8' }}>· tap ⟳ then turn the phone sideways for a bigger view</span>
          </div>
        )}
      </div>

      {/* Grow Card picker — opens from a box's "+ Add" slot; picking a card
          plants it in that table's first (P4) slot. */}
      {picking != null && (
        <PlantPicker
          table={picking}
          onPick={(plant) => addPlant(picking, plant)}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}

// A full-bleed room arrow pinned to the screen edge.
function RoomArrow({ side, label, onClick }) {
  const isLeft = side === 'left'
  return (
    <button onClick={onClick}
      style={{ position: 'absolute', [side]: `calc(10px + env(safe-area-inset-${side}))`, top: '50%', transform: 'translateY(-50%)', zIndex: 6,
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
      {/* Aspect-locked room box so the clerk lines up with the counter at any size. */}
      <div style={{ position: 'relative', aspectRatio: '1600 / 905', maxWidth: '100%', maxHeight: '100%' }}>
        <img src={art} alt="Shop Front" style={{ display: 'block', width: '100%', height: '100%' }} />
        {/* Nodding clerk standing BEHIND the counter — clipped at the counter
            top so his body is hidden; only his head/shoulders nod above it. */}
        <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(0 0 50% 0)', pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute', left: '50%', bottom: '5%',
            transform: 'translateX(-50%)',
            height: '59%', aspectRatio: '229 / 581',
            filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.45))',
          }}>
            <img src="/thug-4-body.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
            <img src="/thug-4-head.png" alt="" style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
              transformOrigin: '50% 30%', animation: 'thugNod 2.6s ease-in-out infinite',
            }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- PACKING -----------------------------------------------------------
// Raw product feeds the line on the left, runs through the machine, and drops
// as packed units on the right. Real art now; the packing mechanic is next.
function PackingRoom() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Aspect-locked room box so the skater stays glued to the floor at any
          screen size / orientation. */}
      <div style={{ position: 'relative', aspectRatio: '1600 / 905', maxWidth: '100%', maxHeight: '100%' }}>
        <img src="/packing-room.webp" alt="Packing Room" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
        {/* Thug-life monkey riding a skateboard — the board + rider glide back
            and forth across the floor as one group. */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', animation: 'skateGlide 6.5s ease-in-out infinite' }}>
          {/* Skateboard under the feet */}
          <div style={{ position: 'absolute', bottom: '5%', left: '50%', transform: 'translateX(-50%)', width: '16%' }}>
            <Skateboard />
          </div>
          {/* Monkey standing on the deck */}
          <img src="/thug-6.png" alt="" style={{
            position: 'absolute', bottom: '8%', left: '50%', transform: 'translateX(-50%)',
            height: '60%', width: 'auto', objectFit: 'contain',
            filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.55))',
          }} />
        </div>
      </div>
    </div>
  )
}

// A cartoon skateboard (side view) drawn to match the bold-outline art style:
// a colored deck with kicked-up nose/tail on two trucks of cream wheels.
function Skateboard() {
  return (
    <svg viewBox="0 0 200 64" style={{ display: 'block', width: '100%', height: 'auto',
      filter: 'drop-shadow(0 5px 6px rgba(0,0,0,0.5))' }}>
      {/* Deck — slightly upturned ends */}
      <path d="M10 30 Q10 20 26 21 L174 21 Q190 20 190 30 Q190 39 174 38 L26 38 Q10 39 10 30 Z"
        fill="#c0392b" stroke="#140d06" strokeWidth="4" strokeLinejoin="round" />
      {/* Top griptape highlight */}
      <rect x="28" y="23.5" width="144" height="4.5" rx="2.25" fill="#7c1f17" opacity="0.7" />
      {/* Trucks */}
      <rect x="50" y="36" width="9" height="9" rx="1.5" fill="#8a857a" stroke="#140d06" strokeWidth="2.5" />
      <rect x="141" y="36" width="9" height="9" rx="1.5" fill="#8a857a" stroke="#140d06" strokeWidth="2.5" />
      {/* Wheels — two per truck */}
      {[46, 63, 137, 154].map((cx, i) => (
        <circle key={i} cx={cx} cy="50" r="10.5" fill="#f1e7c9" stroke="#140d06" strokeWidth="3.5" />
      ))}
    </svg>
  )
}

// ---- GROW ROOM ---------------------------------------------------------
// The working production floor. The room art shows the grow benches; the
// interactive tables dock along the bottom over a scrim so they stay readable.
// Tables grow product into containers; the worker hauls full ones to the bank.

// Grow tables, named Table 1 (far left) → Table 2 (middle) → Table 3 (far
// right). Each table has 4 plant slots numbered front-to-back: Plant 1 is
// nearest the viewer (front of the table), Plant 4 is at the back by the window.
// {x,y} = pot-base position as % of the room-art box (1600x905), read off the
// marked art. Reference any slot as "Table X, Plant Y" (id `TX-PY`).
const GROW_TABLES = [
  { table: 1, slots: [
    { plant: 1, x: 17.1, y: 62.7 }, { plant: 2, x: 20.3, y: 56.9 },
    { plant: 3, x: 22.8, y: 52.0 }, { plant: 4, x: 25.1, y: 47.6 } ] },
  { table: 2, slots: [
    { plant: 1, x: 44.5, y: 64.3 }, { plant: 2, x: 45.7, y: 57.1 },
    { plant: 3, x: 46.8, y: 51.5 }, { plant: 4, x: 47.4, y: 46.6 } ] },
  { table: 3, slots: [
    { plant: 1, x: 76.4, y: 64.7 }, { plant: 2, x: 74.3, y: 57.7 },
    { plant: 3, x: 72.3, y: 51.6 }, { plant: 4, x: 70.4, y: 46.6 } ] },
]

// Flattened slots, each tagged with its id; sorted back-to-front so nearer
// plants paint over farther ones. (To add plants one at a time later, filter
// this list by which slots are actually planted.)
const PLANT_SLOTS = GROW_TABLES
  .flatMap(t => t.slots.map(s => ({ ...s, table: t.table, id: `T${t.table}-P${s.plant}` })))
  .sort((a, b) => a.y - b.y)
const plantW = (y) => 9.8 + 0.26 * (y - 47)    // plant width %, front (higher y) bigger

// Which slots are planted is held in TrapHouse state (`planted`) and passed down,
// so the FREE button (and future actions) can place plants at runtime. Each
// placed slot brings its plant art + its bud + its bud-path.

// Per-plant bud path — keyed by plant slot id, so each plant is self-contained:
// One bud path per TABLE (the marked red line) — every plant on a table shares
// it; buds are staggered by plant number so they don't overlap. [x%, y%]
// waypoints: back of belt → down the belt → into the bin.
const BUD_PATHS = {
  1: [[30.0, 47.8], [27.1, 55.2], [23.9, 62.6], [21.1, 69.9], [20.6, 77.3], [20.1, 84.7]],
  2: [[52.4, 48.0], [52.4, 55.4], [52.3, 62.8], [52.3, 70.2], [52.3, 77.6], [52.2, 85.0]],
  3: [[75.2, 47.4], [78.3, 54.8], [81.8, 62.2], [85.2, 69.6], [85.3, 77.0], [85.3, 84.4]],
}
const BUD_W = 5.7       // bud width, % of room-art box width (rotated art, 25% smaller)
const BUD_SECS = 25.6   // seconds for one full run down the path (higher = slower)
// Keyframe % for the 6 waypoints. Belt travel (pts 0–3) takes ~98.9% of the run
// (slow); the drop into the box (pts 3→4→5) is squeezed into the last ~1.1% so
// the bud snaps into the box fast once it hits the belt edge.
const BUD_PCTS = [0, 33, 66, 98.9, 99.45, 100]

// Per-table box ladders, in placement order. The FIRST slot (P4) is filled by
// adding a Grow Card via the "+ Add" slot (see GrowRoom) — no cost. The
// remaining slots are paid UPGRADE steps (need the funds in the bank). Once all
// four are placed, the box shows nothing.
const TABLE_STEPS = {
  1: [
    { slot: 'T1-P4' },
    { slot: 'T1-P3', cost: 2000 },
    { slot: 'T1-P2', cost: 4000 },
    { slot: 'T1-P1', cost: 6000 },
  ],
  2: [
    { slot: 'T2-P4' },
    { slot: 'T2-P3', cost: 8000 },
    { slot: 'T2-P2', cost: 10000 },
    { slot: 'T2-P1', cost: 12000 },
  ],
  3: [
    { slot: 'T3-P4' },
    { slot: 'T3-P3', cost: 30000 },
    { slot: 'T3-P2', cost: 36000 },
    { slot: 'T3-P1', cost: 42000 },
  ],
}
// First (P4) slot of a table — filled by the "+ Add" card pick.
const firstSlot = (table) => TABLE_STEPS[table][0].slot
const tableStarted = (table, planted) => planted.includes(firstSlot(table))
// A table is complete once all four of its plant slots are placed. Table N's
// box (the "+ Add" slot and beyond) only appears once Table N-1 is complete.
const tableComplete = (table, planted) => TABLE_STEPS[table].every(s => planted.includes(s.slot))

// The collection bins (yellow boxes) at the front of each table: [x0, x1, yTop]
// as % of the room-art box. A pile of buds fills each one when it's full.
const BINS = { 1: [7.7, 24.6, 70.7], 2: [42.1, 57.3, 71.0], 3: [76.4, 92.4, 71.2] }
// Pile layout (back→front so nearer buds paint on top): [x-fraction across box,
// dy% from rim, width as fraction of box width].
const BIN_PILE = [
  [0.18, -3.0, 0.34], [0.50, -3.4, 0.36], [0.82, -3.0, 0.34],
  [0.34, -1.2, 0.40], [0.66, -1.2, 0.40],
  [0.16, 0.6, 0.42], [0.50, 0.4, 0.46], [0.84, 0.6, 0.42],
  [0.30, 2.4, 0.46], [0.70, 2.4, 0.46],
  [0.50, 4.0, 0.48],
]
const BINS_FULL = false  // preview: show every bin heaped with buds

function GrowRoom({ planted, bank, onPlace, budCounts = {}, onBud, tableCards = {}, onAdd }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Aspect-locked room box so the plant overlays stay glued to the benches
          at any screen size / orientation. */}
      <div style={{ position: 'relative', aspectRatio: '1600 / 905', maxWidth: '100%', maxHeight: '100%' }}>
        <img src="/grow-room.webp" alt="Grow Room" style={{ display: 'block', width: '100%', height: '100%' }} />
        <BeltBud planted={planted} onBud={onBud} />
        {PLANT_SLOTS.filter(s => planted.includes(s.id)).map((s) => (
          <img key={s.id} src="/plant.webp" alt="" aria-hidden data-slot={s.id}
            style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: `${plantW(s.y)}%`,
              transform: 'translate(-50%, -100%)', pointerEvents: 'none' }} />
        ))}
        {/* Bins heaped full of buds. */}
        {BINS_FULL && Object.values(BINS).flatMap(([x0, x1, yTop], b) => {
          const bw = x1 - x0
          return BIN_PILE.map(([xf, dy, wf], i) => (
            <img key={`bin${b}-${i}`} src="/nug.webp" alt="" aria-hidden
              style={{ position: 'absolute', left: `${x0 + bw * xf}%`, top: `${yTop + dy}%`, width: `${(wf * bw).toFixed(2)}%`,
                transform: 'translate(-50%, -100%)', pointerEvents: 'none' }} />
          ))
        })}

        {/* Box slots — one per table. An empty table shows a "+ Add" slot that
            opens the Grow Card picker (places the card in the P4 spot). Once
            started, it steps through UPGRADE $X. A finished table shows nothing. */}
        {[1, 2, 3].map(tbl => {
          if (tbl > 1 && !tableComplete(tbl - 1, planted)) return null   // unlock in order
          const [x0, x1] = BINS[tbl]
          const base = {
            position: 'absolute', left: `${(x0 + x1) / 2}%`, top: '84%', transform: 'translate(-50%, -50%)',
            width: `${((x1 - x0) * 0.765).toFixed(1)}%`, padding: '5px 0', borderRadius: 7,
            fontWeight: 900, fontSize: 11, letterSpacing: 1, zIndex: 4,
          }
          // Empty table → "+ Add" card slot (like adding a player card). Bigger
          // and higher-contrast than the upgrade button so it's easy to spot:
          // black fill, white text + border.
          if (!tableStarted(tbl, planted)) {
            return (
              <button key={tbl} onClick={() => onAdd(tbl)}
                style={{ ...base,
                  width: `${((x1 - x0) * 0.95).toFixed(1)}%`, padding: '9px 0',
                  fontSize: 14, letterSpacing: 1.5,
                  background: '#0a0a0a', color: '#fff',
                  border: '1.5px solid #fff', borderRadius: 9, cursor: 'pointer',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  animation: 'btnPulse 1.4s ease-in-out infinite' }}>
                <i className="ti ti-plus" style={{ fontSize: 15 }} /> Add
              </button>
            )
          }
          const step = TABLE_STEPS[tbl].find(s => !planted.includes(s.slot))
          if (!step) return null   // table fully planted — no button
          const afford = bank >= step.cost
          return (
            <button key={tbl} onClick={() => afford && onPlace(step.slot, step.cost)} disabled={!afford}
              style={{ ...base,
                background: afford ? GOLD : '#2a2722', color: afford ? '#1a1206' : '#6a665c',
                border: `1px solid ${afford ? '#8a7330' : '#403c33'}`, cursor: afford ? 'pointer' : 'not-allowed',
                animation: afford ? 'btnPulse 1.4s ease-in-out infinite' : 'none' }}>
              UPGRADE ${step.cost.toLocaleString()}
            </button>
          )
        })}

        {/* Bud counters — one per box, showing the running tally of buds that
            have dropped into it. Only shown once the table has a plant feeding
            it. The number pops each time it ticks (keyed on the count). */}
        {[1, 2, 3].map(tbl => {
          if (!planted.some(id => id.startsWith(`T${tbl}-`))) return null
          const [x0, x1, yTop] = BINS[tbl]
          const n = budCounts[tbl] || 0
          const strain = PLANTS.find(p => p.id === tableCards[tbl])
          return (
            <div key={`cnt${tbl}`} style={{
              position: 'absolute', left: `${(x0 + x1) / 2}%`, top: `${yTop}%`,
              transform: 'translate(-50%, -135%)', zIndex: 4, pointerEvents: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              {strain && (
                <span style={{
                  color: '#fff', fontSize: 8, fontWeight: 800, letterSpacing: 0.6,
                  background: 'rgba(10,8,5,0.78)', borderRadius: 4, padding: '1px 6px',
                  textShadow: '0 1px 2px #000', whiteSpace: 'nowrap',
                }}>{strain.name}</span>
              )}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(10,8,5,0.82)', border: `1px solid ${GOLD}66`, borderRadius: 999,
                padding: '2px 8px', boxShadow: '0 2px 7px rgba(0,0,0,0.55)',
              }}>
                <img src="/bud.webp" alt="" style={{ width: 13, height: 13, objectFit: 'contain' }} />
                <span key={n} style={{
                  color: GREEN, fontWeight: 900, fontSize: 13, fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1, animation: 'budTick 0.35s ease-out',
                }}>{n.toLocaleString()}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Grow Card picker — the "+ Add" slot opens this. Shows the player's owned plant
// cards (one tile per card, best level owned); tapping one plants it. Mirrors the
// crew card-picker pattern (an in-screen chooser, not a navigation away).
function PlantPicker({ table, onPick, onClose }) {
  const byId = new Map()
  getOwnedPlantTuples().forEach(t => {
    const cur = byId.get(t.id)
    if (!cur || t.level > cur.level) byId.set(t.id, t)
  })
  const cards = [...byId.values()]
    .map(t => ({ plant: PLANTS.find(p => p.id === t.id), level: t.level }))
    .filter(x => x.plant)

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 30,
      background: 'rgba(6,5,3,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'calc(18px + env(safe-area-inset-top)) 18px calc(18px + env(safe-area-inset-bottom))',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 420, maxHeight: '90%', overflowY: 'auto',
        background: '#13110d', border: `1px solid ${GOLD}44`, borderRadius: 16, padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>Your Grow Cards</div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
            border: '0.5px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><i className="ti ti-x" /></button>
        </div>
        <div style={{ color: DIM, fontSize: 11, margin: '4px 0 14px' }}>Pick a card to plant on Table {table}.</div>

        {cards.length === 0 ? (
          <div style={{ background: '#1a1712', border: '0.5px solid #2a2722', borderRadius: 12, padding: 20, textAlign: 'center', color: '#7a766a', fontSize: 12 }}>
            No grow cards yet — get one from the Cards screen.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {cards.map(({ plant, level }) => {
              const rc = RARITY_COLORS[plant.rarity] || GOLD
              return (
                <button key={plant.id} onClick={() => { sfx.tap?.(); onPick(plant) }} style={{
                  background: '#1a1712', border: `1px solid ${rc}55`, borderRadius: 12, padding: 10,
                  cursor: 'pointer', textAlign: 'center',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                    <Avatar src={plant.avatar} emoji={plant.emoji} size={74} radius={10} style={{ border: `1px solid ${rc}55` }} />
                  </div>
                  <div style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>
                    {plant.name}{level > 1 && <span style={{ color: rc }}> · LVL {level}</span>}
                  </div>
                  <div style={{ color: '#3fb950', fontSize: 11, fontWeight: 800, marginTop: 2 }}>
                    ${plantCashValue(plant, level).toLocaleString()}
                  </div>
                  <div style={{ marginTop: 8, background: GOLD, color: '#1a1206', borderRadius: 7, padding: '5px 0', fontWeight: 900, fontSize: 11, letterSpacing: 1 }}>
                    PLANT
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

// Buds ride their table's shared bud-path (back of belt → down the belt, growing
// with perspective → into the bin). The path has FOUR evenly-spaced "lanes"
// (phases at 0/25/50/75%); each plant is locked to one lane by its number. ALL
// bud elements are mounted up front (hidden until their plant is placed) so the
// animations stay phase-locked — the buds stay evenly spaced no matter when you
// buy each plant.
function BeltBud({ planted, onBud }) {
  const kf = Object.entries(BUD_PATHS).map(([t, pts]) => {
    const frames = pts.map((p, i) => {
      const pct = BUD_PCTS[i]
      let extra = ''
      if (i === 0) extra = ' transform:translate(-50%,-82%) scale(.45); opacity:0;'
      else if (i === 3) extra = ' transform:translate(-50%,-82%) scale(1);'
      else if (i === 4) extra = ' opacity:1;'
      else if (i === pts.length - 1) extra = ' transform:translate(-50%,-55%) scale(.6); opacity:0;'
      return `${pct}% { left:${p[0]}%; top:${p[1]}%;${extra} }`
    })
    frames.splice(1, 0, '8% { opacity:1; }')   // fade in early
    return `@keyframes bud${t} { ${frames.join(' ')} }`
  }).join('\n')
  return (
    <>
      <style>{kf}</style>
      {PLANT_SLOTS.filter(s => BUD_PATHS[s.table]).map(s => (
        <img key={s.id} src="/bud.webp" alt="" aria-hidden data-bud={s.id}
          // Each loop = one bud delivered into this table's box. All buds are
          // mounted (for phase-lock) even when hidden, so only count planted ones.
          onAnimationIteration={() => { if (onBud && planted.includes(s.id)) onBud(s.table) }}
          style={{ position: 'absolute', width: `${BUD_W}%`,
            visibility: planted.includes(s.id) ? 'visible' : 'hidden',
            // lane = plant number (1-4) → one of four evenly-spaced phases
            animation: `bud${s.table} ${BUD_SECS}s linear ${(-(s.plant - 1) * BUD_SECS / 4).toFixed(2)}s infinite`,
            pointerEvents: 'none' }} />
      ))}
    </>
  )
}

function Keyframes() {
  return (
    <style>{`
      @keyframes arrowPulse { 0%,100%{opacity:.7} 50%{opacity:1} }
      @keyframes btnPulse {
        0%,100% { transform: translate(-50%,-50%) scale(1);    filter: brightness(1); }
        50%     { transform: translate(-50%,-50%) scale(1.07); filter: brightness(1.18); }
      }
      @keyframes budTick {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.45); color: #fff; }
        100% { transform: scale(1); }
      }
      @keyframes skateGlide {
        0%   { transform: translateX(-17%) rotate(-1.5deg); }
        50%  { transform: translateX(17%)  rotate(1.5deg); }
        100% { transform: translateX(-17%) rotate(-1.5deg); }
      }
    `}</style>
  )
}
