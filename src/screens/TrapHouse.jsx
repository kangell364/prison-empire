import React, { useState, useEffect } from 'react'
import { sfx } from '../sounds'

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

  // Place a plant slot, charging the bank (no-op if you can't afford it).
  const placeSlot = (slot, cost) => {
    if (bank < cost || planted.includes(slot)) return
    setBank(b => b - cost)
    setPlanted(p => [...p, slot])
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
        {cur.key === 'grow' && <GrowRoom planted={planted} bank={bank} onPlace={placeSlot} />}
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
      {/* Thug-life character standing on the floor — head split onto its own
          layer so it can nod "yes" (pivot at the neck, ~30% down). */}
      <div style={{
        position: 'absolute', bottom: '4%', left: '50%', transform: 'translateX(-50%)',
        height: '62%', aspectRatio: '229 / 581', pointerEvents: 'none',
        filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.55))',
      }}>
        <img src="/thug-4-body.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
        <img src="/thug-4-head.png" alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
          transformOrigin: '50% 30%', animation: 'thugNod 2.6s ease-in-out infinite',
        }} />
      </div>
    </div>
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

// Per-table box-button ladders, in placement order. Each button shows the next
// unplaced step: FREE places for $0; UPGRADE costs `cost` (needs the funds in the
// bank); once all are placed the button reads TBC. Table N's button only appears
// once Table N-1 is fully unlocked (all 4 of its plants placed).
const TABLE_STEPS = {
  1: [
    { slot: 'T1-P4', cost: 0, free: true },
    { slot: 'T1-P3', cost: 0 },
    { slot: 'T1-P2', cost: 2000 },
    { slot: 'T1-P1', cost: 4000 },
  ],
  2: [
    { slot: 'T2-P4', cost: 6000 },
    { slot: 'T2-P3', cost: 8000 },
    { slot: 'T2-P2', cost: 10000 },
    { slot: 'T2-P1', cost: 12000 },
  ],
  3: [
    { slot: 'T3-P4', cost: 24000 },
    { slot: 'T3-P3', cost: 30000 },
    { slot: 'T3-P2', cost: 36000 },
    { slot: 'T3-P1', cost: 42000 },
  ],
}
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

function GrowRoom({ planted, bank, onPlace }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Aspect-locked room box so the plant overlays stay glued to the benches
          at any screen size / orientation. */}
      <div style={{ position: 'relative', aspectRatio: '1600 / 905', maxWidth: '100%', maxHeight: '100%' }}>
        <img src="/grow-room.webp" alt="Grow Room" style={{ display: 'block', width: '100%', height: '100%' }} />
        <BeltBud planted={planted} />
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

        {/* Box buttons — one per table. Each steps FREE → UPGRADE $X → TBC,
            placing a plant per tap; UPGRADE lights/clicks only when affordable.
            Table N's button appears only once Table N-1 is fully unlocked. */}
        {[1, 2, 3].map(tbl => {
          if (tbl > 1 && !tableComplete(tbl - 1, planted)) return null   // gate
          const [x0, x1] = BINS[tbl]
          const step = TABLE_STEPS[tbl].find(s => !planted.includes(s.slot))
          const base = {
            position: 'absolute', left: `${(x0 + x1) / 2}%`, top: '84%', transform: 'translate(-50%, -50%)',
            width: `${((x1 - x0) * 0.765).toFixed(1)}%`, padding: '5px 0', borderRadius: 7,
            fontWeight: 900, fontSize: 11, letterSpacing: 1, zIndex: 4,
          }
          if (!step) {
            return <button key={tbl} disabled style={{ ...base, background: '#34322c', color: '#7a766a', border: '1px solid #4a463c', cursor: 'not-allowed' }}>TBC</button>
          }
          if (step.free) {
            return <button key={tbl} onClick={() => onPlace(step.slot, 0)}
              style={{ ...base, background: '#2ecc71', color: '#063317', border: '1px solid #1f8a4a', cursor: 'pointer', animation: 'btnPulse 1.4s ease-in-out infinite' }}>FREE</button>
          }
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
function BeltBud({ planted }) {
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
    `}</style>
  )
}
