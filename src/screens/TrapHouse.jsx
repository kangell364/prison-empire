import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { sfx } from '../sounds'
import { PLANTS, plantCashValue, RARITY_COLORS } from '../data/gameData'
import { getOwnedPlantTuples } from '../state/plantCardsStore'
import { Avatar } from '../components/Avatar'

const GOLD = '#c9a84c'
const GREEN = '#2ecc71'
const BLUE = '#4a9eff'
const DIM = '#7a7468'

// ---- Room layering contract -----------------------------------------
// Within a room (the zIndex:0 backdrop), z-index orders the scenery. The skater
// monkey must paint ABOVE every room prop in EVERY room — present and future — so
// give him a dominant z and keep all room props (counters, jars, bins, plants…)
// at or below PROP_Z. Add new room art below SKATER_Z and the monkey stays on top
// automatically. (The room backdrop is its own stacking context, so this z never
// escapes it — the top bar, arrows, and picker modal still float over the monkey.)
const PROP_Z = 10     // ceiling for any room prop / counter / jar
const SKATER_Z = 50   // the monkey — always above PROP_Z, in every room

// The room screen's operating state (plants, bank, bud + packed counts) is kept
// in this one localStorage blob so the whole line resumes across reloads.
const SAVE_KEY = 'pe_traphouse_room_v2'
function loadSaved() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) return JSON.parse(raw) || {} } catch {}
  return {}
}

// ---- Idle production model -------------------------------------------
// GENERATION runs on wall-clock TIME: each planted plant pours buds into its
// table's grow box, even while the app is closed (on load we fast-forward by the
// elapsed time, capped at 8h). HAULING is NOT automatic — the skater monkey only
// moves buds to packing when the player taps him (he empties each grow counter as
// he passes it, then deposits the haul into the right packing box). The packing
// machine then turns every 5 raw buds into one jar. So grow boxes are the single
// source of truth for generation; the monkey + machine move product downstream.
const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000   // credit at most 8h of time away
const BUD_PER_PLANT_SECS = 25.6              // one bud per plant every ~25.6s (matches BUD_SECS)
const MACHINE_MS = 2000                      // machine pops one jar per strain every 2s
const plantsOnTable = (table, planted) => planted.filter(id => id.startsWith(`T${table}-`)).length

// Advance generation to `now`: pour each plant's output into its grow box. Returns
// the next { budCounts, lastTick }. Runs live (~1/s) and once on mount for the
// offline catch-up — identical math, so no double counting.
function advanceProduction({ planted, budCounts, lastTick }, now) {
  if (now - lastTick > OFFLINE_CAP_MS) lastTick = now - OFFLINE_CAP_MS   // cap time away
  const bc = { ...budCounts }
  const dtSec = Math.max(0, (now - lastTick) / 1000)
  for (const t of [1, 2, 3]) {
    const plants = plantsOnTable(t, planted)
    if (plants) bc[t] = (bc[t] || 0) + (plants / BUD_PER_PLANT_SECS) * dtSec
  }
  return { budCounts: bc, lastTick: now }
}

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
  // Persisted operating state — lazy-loaded from localStorage so the line resumes.
  const [saved] = useState(loadSaved)
  const [planted, setPlanted] = useState(() => Array.isArray(saved.planted) ? saved.planted : [])  // placed plant slots (each brings its bud + path)
  const [bank, setBank] = useState(() => typeof saved.bank === 'number' ? saved.bank : 200000)      // this store's bank balance ($) — full bank for testing
  // Running tally of buds delivered into each table's bin. One bud "drops" each
  // time its path animation completes a loop; the counter on the box reflects it.
  // The ONE source of truth for the grow-box tally — a wall-clock accumulator that
  // keeps filling whether or not you're watching (other room, app closed, logged
  // out). The counter shows floor(budCounts); the monkey hauls budCounts. The belt
  // buds are phase-locked to this clock (see BeltBud) so a bud visibly lands in the
  // box at the exact moment the count ticks up — but the count never depends on the
  // animation running, so it's correct everywhere.
  const [budCounts, setBudCounts] = useState(() => saved.budCounts || { 1: 0, 2: 0, 3: 0 })
  // Bumped whenever a box is emptied (haul) so the belt buds re-lock their phase to
  // the freshly-reset count.
  const [budResync, setBudResync] = useState(0)
  // Which Grow Card is planted on each table (the card the player added).
  const [tableCards, setTableCards] = useState(() => saved.tableCards || {})
  // The card LEVEL each planted strain is at, keyed by plant id. Drives a jar's
  // cash value in the packing room (value = plantCashValue(card, level) × JAR_FILL).
  const [cardLevels, setCardLevels] = useState(() => saved.cardLevels || {})
  // RIGHT packing box — raw buds the monkey has deposited, per strain (keyed by
  // plant id). Climbs on deposit, drops by JAR_FILL each time the machine pops a jar.
  const [packCounts, setPackCounts] = useState(() => saved.packCounts || {})
  // LEFT packing box — finished jars per strain. The box's $ value is jars ×
  // (card cash value × JAR_FILL); see PackingRoom.
  const [jarCounts, setJarCounts] = useState(() => saved.jarCounts || {})
  // Which table the "+ Add" slot was tapped for — opens the card picker.
  const [picking, setPicking] = useState(null)

  // Skater-monkey journey — purely COSMETIC (production runs on its own wall-clock
  // via advanceProduction(), not on his trips). He sits idle at his spot in the
  // packing room until the player taps him; a tap sends him on ONE round trip,
  // then he returns to idle and waits to be tapped again. The view does NOT
  // follow, so you navigate rooms to catch him passing through:
  //   A: packing, roll off the right     B: grow room, roll right → off left
  //   C: packing, roll right → off left  D: packing, roll in from left → home → idle
  // Phases advance on a timer (same rolling speed everywhere); the Skater syncs to
  // elapsed time so switching in mid-phase shows him at his real position.
  const [skate, setSkate] = useState({ phase: 'idle', start: 0 })
  const startSkate = () => setSkate(s => (s.phase === 'idle' ? { phase: 'A', start: Date.now() } : s))
  useEffect(() => {
    if (skate.phase === 'idle') return
    const next = skate.phase === 'A' ? 'B' : skate.phase === 'B' ? 'C' : skate.phase === 'C' ? 'D' : 'idle'
    const t = setTimeout(() => setSkate({ phase: next, start: Date.now() }), SKATE_MS[skate.phase])
    return () => clearTimeout(t)
  }, [skate.phase])

  // Live refs so the timers/intervals read current values without re-subscribing.
  const plantedRef = useRef(planted)
  useEffect(() => { plantedRef.current = planted }, [planted])
  const budCountsRef = useRef(budCounts)
  useEffect(() => { budCountsRef.current = budCounts }, [budCounts])
  const tableCardsRef = useRef(tableCards)
  useEffect(() => { tableCardsRef.current = tableCards }, [tableCards])
  const lastTickRef = useRef(typeof saved.lastTick === 'number' ? saved.lastTick : Date.now())

  // GENERATION: advance the wall-clock accumulator to `now`. Runs on mount (offline
  // catch-up), on a 1s live ticker, when the app returns to the foreground, AND the
  // instant a bud's belt animation lands in the box — that last call makes the
  // displayed floor() tick at the exact frame the bud drops in, while the ticker
  // keeps it counting when no one's watching.
  const advanceNow = useCallback(() => {
    const now = Date.now()
    const next = advanceProduction(
      { planted: plantedRef.current, budCounts: budCountsRef.current, lastTick: lastTickRef.current },
      now,
    )
    lastTickRef.current = next.lastTick
    setBudCounts(next.budCounts)
  }, [])
  useEffect(() => {
    advanceNow()                                  // immediate catch-up for time away
    const id = setInterval(advanceNow, 1000)      // then advance live
    // Also catch up the instant the tab/app returns to the foreground (mobile
    // throttles timers while backgrounded, so the interval may have stalled).
    const onVis = () => { if (!document.hidden) advanceNow() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [advanceNow])

  // HAULING: the skater's trip carries each grow box's buds to the right packing
  // box. carryRef holds the current trip's haul, banked per strain.
  //   phase A: new trip — empty his hands
  //   phase B: as he rolls right→left through the grow room he passes each box;
  //            at the moment he reaches it, that box's counter empties into carry
  //   phase C: rolling past the right packing box, he deposits the whole haul
  const carryRef = useRef({})
  useEffect(() => {
    if (skate.phase === 'A') { carryRef.current = {}; return }      // new trip — empty hands
    if (skate.phase === 'B') {
      const timers = [3, 2, 1].map(tbl => {                         // right → left
        const [x0, x1] = BINS[tbl]
        return setTimeout(() => {
          const id = tableCardsRef.current[tbl]
          const n = budCountsRef.current[tbl] || 0
          if (id && n) carryRef.current[id] = (carryRef.current[id] || 0) + n
          setBudCounts(c => ({ ...c, [tbl]: 0 }))                   // empty the grow counter on pass
          setBudResync(r => r + 1)                                  // re-lock belt-bud phase to 0
        }, passTimeMs((x0 + x1) / 2, SKATE_MS.B))
      })
      return () => timers.forEach(clearTimeout)
    }
    if (skate.phase === 'C') {
      const [x0, x1] = PACK_RIGHT_BIN
      const t = setTimeout(() => {
        const haul = carryRef.current
        carryRef.current = {}
        setPackCounts(pc => {
          const next = { ...pc }
          for (const id in haul) next[id] = (next[id] || 0) + haul[id]
          return next
        })
      }, passTimeMs((x0 + x1) / 2, SKATE_MS.C))
      return () => clearTimeout(t)
    }
  }, [skate.phase])

  // MACHINE: turns raw buds into jars. Every tick, each strain holding ≥ JAR_FILL
  // raw buds in the right box pops ONE jar — the right counter drops by JAR_FILL
  // and a jar count is banked (the belt-jar animation + left $ counter follow it
  // in PackingRoom). One jar per strain per tick so they come out one at a time.
  // The two setters are kept separate (no nested setState) — decide which strains
  // pop from a ref, then update each counter with its own pure updater.
  const packCountsRef = useRef(packCounts)
  useEffect(() => { packCountsRef.current = packCounts }, [packCounts])
  useEffect(() => {
    const id = setInterval(() => {
      const pc = packCountsRef.current
      const popped = []
      for (const strain in pc) { if ((pc[strain] || 0) >= JAR_FILL) popped.push(strain) }
      if (!popped.length) return
      setPackCounts(prev => {
        const next = { ...prev }
        popped.forEach(s => { if ((next[s] || 0) >= JAR_FILL) next[s] -= JAR_FILL })
        return next
      })
      setJarCounts(prev => {
        const nj = { ...prev }
        popped.forEach(s => { nj[s] = (nj[s] || 0) + 1 })
        return nj
      })
    }, MACHINE_MS)
    return () => clearInterval(id)
  }, [])

  // Persist the operating state on every change so a reload resumes the line:
  // plants, bank, grow-box buds, table cards/levels, right-box raw buds, left-box
  // jars, and the generation clock. budCounts changes ~1/s so the clock stays fresh.
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        planted, bank, budCounts, tableCards, cardLevels, packCounts, jarCounts,
        lastTick: lastTickRef.current,
      }))
    } catch {}
  }, [planted, bank, budCounts, tableCards, cardLevels, packCounts, jarCounts])

  // Place a plant slot, charging the bank (no-op if you can't afford it).
  const placeSlot = (slot, cost) => {
    if (bank < cost || planted.includes(slot)) return
    setBank(b => b - cost)
    setPlanted(p => [...p, slot])
    sfx.buy?.()
  }

  // Add a chosen Grow Card to a table — fills its first (P4) plant slot and
  // records the card. Triggered by picking a card in the "+ Add" picker.
  const addPlant = (table, plant, level = 1) => {
    const slot = firstSlot(table)
    if (planted.includes(slot)) return
    setTableCards(tc => ({ ...tc, [table]: plant.id }))
    setCardLevels(cl => ({ ...cl, [plant.id]: Math.max(cl[plant.id] || 1, level) }))
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
          display when the phone is turned sideways. Controls float on top.
          zIndex:0 makes this its own stacking context, so the monkey's high
          z-index keeps him above the room art/counters but still under the UI
          chrome (top bar, arrows) that floats over everything. */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        {cur.key === 'shop' && <ShopFront art={cur.art} jarCounts={jarCounts} tableCards={tableCards} />}
        {cur.key === 'pack' && <PackingRoom skatePhase={skate.phase} skateStart={skate.start} onSkateClick={startSkate} packCounts={packCounts} jarCounts={jarCounts} tableCards={tableCards} cardLevels={cardLevels} />}
        {cur.key === 'grow' && <GrowRoom planted={planted} bank={bank} onPlace={placeSlot} budCounts={budCounts} budResync={budResync} onBudLand={advanceNow} tableCards={tableCards} onAdd={setPicking} skatePhase={skate.phase} skateStart={skate.start} />}
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
        {/* Bank balance for this store — sits left of the rotate button, sized up
            so the take reads at a glance. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', background: 'rgba(26,21,16,0.85)', border: `0.5px solid ${GOLD}55`, borderRadius: 13, padding: '7px 18px' }}>
          <span style={{ color: DIM, fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>BANK</span>
          <span style={{ color: GREEN, fontWeight: 800, fontSize: 26, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>${bank.toLocaleString()}</span>
        </div>
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
          onPick={(plant, level) => addPlant(picking, plant, level)}
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
// The customer-facing storefront and the LAST stop in the grow → pack → shelf
// flow: the finished jars the packing line banks (jarCounts) are stocked on the
// back shelves here, each tinted to its strain's jarColor (Purple Haze = purple).
// Slots are read off shop-front.webp — three shelf rows × three bays × three jars
// — and fill front-to-back (top row, left→right) as production banks jars.
const SHELF_ROWS = [31.6, 39.8, 48.0]                      // jar-bottom baseline, % of room box
const SHELF_BAYS = [[38.2, 48.0], [49.9, 59.9], [62.4, 72.3]]
const SHELF_FRAC = [0.18, 0.5, 0.82]                       // jar centers within a bay
const SHELF_JAR_W = 2.9                                    // jar width, % of room box
const SHELF_SLOTS = SHELF_ROWS.flatMap(y =>               // all slot centers, in stock order
  SHELF_BAYS.flatMap(([b0, b1]) => SHELF_FRAC.map(f => ({ x: b0 + (b1 - b0) * f, y }))))

function ShopFront({ art, jarCounts = {}, tableCards = {} }) {
  // One tinted jar per banked unit, in the order strains were planted, capped at
  // the shelf's slot count so the stock never overflows the cabinet.
  const placedIds = [...new Set(Object.values(tableCards))].filter(id => PLANTS.find(p => p.id === id))
  const stock = []
  for (const id of placedIds) {
    const color = PLANTS.find(p => p.id === id)?.jarColor || '#8e44ad'
    const n = Math.floor(jarCounts[id] || 0)
    for (let i = 0; i < n && stock.length < SHELF_SLOTS.length; i++) stock.push(color)
    if (stock.length >= SHELF_SLOTS.length) break
  }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Aspect-locked room box so the clerk lines up with the counter at any size. */}
      <div style={{ position: 'relative', aspectRatio: '1600 / 905', maxWidth: '100%', maxHeight: '100%' }}>
        <img src={art} alt="Shop Front" style={{ display: 'block', width: '100%', height: '100%' }} />
        {/* Finished jars stocked on the back shelves (grow → pack → shelf). */}
        {stock.map((color, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${SHELF_SLOTS[i].x}%`, top: `${SHELF_SLOTS[i].y}%`,
            width: `${SHELF_JAR_W}%`, transform: 'translate(-50%, -100%)',
            zIndex: PROP_Z, pointerEvents: 'none',
            filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.45))',
          }}>
            <Jar color={color} />
          </div>
        ))}
        {/* Nodding clerk standing BEHIND the counter — clipped at the counter
            top so his body is hidden; only his head/shoulders nod above it.
            Sits above the shelved jars (he's in front of the cabinet). */}
        <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(0 0 50% 0)', zIndex: PROP_Z + 1, pointerEvents: 'none' }}>
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
// Skater journey timing — same rolling SPEED everywhere (a full room cross is
// twice the distance of center↔edge, so it takes twice as long). Phase durations
// (ms) drive the parent timer; the seconds match each phase's CSS animation.
const SKATE_MS = { A: 2600, B: 5200, C: 5200, D: 2600 }
const SKATE_ANIM = {
  A: { name: 'rollExitRight',   secs: 2.6 },
  B: { name: 'rollRightToLeft', secs: 5.2 },
  C: { name: 'rollRightToLeft', secs: 5.2 },
  D: { name: 'rollEnterLeft',   secs: 2.6 },
}
// The group translateX runs from +ROLL_EDGE% to −ROLL_EDGE% across a room (must
// match the 85% in the roll keyframes). The monkey's on-screen center is therefore
// (50 + ROLL_EDGE)% at a right→left phase start, sweeping to (50 − ROLL_EDGE)%.
const ROLL_EDGE = 85
// Milliseconds into a right→left phase at which the monkey's center passes a given
// on-screen x (% of the room box). Used to time grow-box collection + the deposit.
const passTimeMs = (centerPct, durMs) => Math.round((50 + ROLL_EDGE - centerPct) * durMs / (2 * ROLL_EDGE))
// Packing room's two collection boxes: [x0, x1, yTop] as % of the room box (read
// off packing-room.webp). The RIGHT box banks the raw packed buds the line makes;
// every JAR_FILL buds mints one finished jar that rides the conveyor belt down
// into the LEFT box. Both boxes carry a per-strain counter, tied to the same set
// of planted strains so they appear/disappear together with the plant.
const PACK_RIGHT_BIN = [70.5, 87.2, 44.5]
const PACK_LEFT_BIN  = [8.0, 23.6, 70.0]
const JAR_FILL = 5   // raw packed buds needed to fill one jar

// A small per-strain tally pill — strain name with its count beside it. Used on
// both packing boxes (raw buds on the right, finished jars on the left).
function CounterPill({ label, value, prefix = '', color = GREEN }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'rgba(10,8,5,0.82)', border: `1px solid ${GOLD}66`, borderRadius: 999,
      padding: '2px 9px', boxShadow: '0 2px 7px rgba(0,0,0,0.55)',
    }}>
      <span style={{
        color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
        textShadow: '0 1px 2px #000', whiteSpace: 'nowrap', textTransform: 'uppercase',
      }}>{label}</span>
      <span key={value} style={{
        color, fontWeight: 900, fontSize: 13, fontVariantNumeric: 'tabular-nums',
        lineHeight: 1, animation: 'budTick 0.35s ease-out',
      }}>{prefix}{value.toLocaleString()}</span>
    </div>
  )
}

// A capped glass jar full of product, drawn in the room's bold-outline style and
// tinted to the strain's jarColor (Purple Haze = purple).
function Jar({ color = '#8e44ad' }) {
  return (
    <svg viewBox="0 0 40 56" style={{ display: 'block', width: '100%', height: 'auto' }}>
      <rect x="9"  y="2"  width="22" height="9"  rx="2.5" fill="#cfc7b4" stroke="#140d06" strokeWidth="2.5" />
      <rect x="6"  y="10" width="28" height="44" rx="6"   fill={color}   stroke="#140d06" strokeWidth="3" />
      <rect x="10" y="15" width="6"  height="32" rx="3"   fill="rgba(255,255,255,0.35)" />
    </svg>
  )
}

function PackingRoom({ skatePhase = 'idle', skateStart = 0, onSkateClick, packCounts = {}, jarCounts = {}, tableCards = {}, cardLevels = {} }) {
  const [rx0, rx1, ryTop] = PACK_RIGHT_BIN
  const [lx0, lx1, lyTop] = PACK_LEFT_BIN
  // Strains currently planted on a table — BOTH box counters are tied to these,
  // so a counter appears the moment a plant is placed and vanishes if it's removed.
  const placedIds = [...new Set(Object.values(tableCards))].filter(id => PLANTS.find(p => p.id === id))
  const strainOf = (id) => PLANTS.find(p => p.id === id)
  const packedOf = (id) => Math.floor(packCounts[id] || 0)   // raw buds in the right box
  const jarsOf   = (id) => Math.floor(jarCounts[id] || 0)    // finished jars in the left box
  // Each jar is worth the card's current cash value × JAR_FILL (e.g. a $25 Lvl-1
  // card → $125/jar); the left box shows the running $ value of all banked jars.
  const jarValueOf = (id) => plantCashValue(strainOf(id), cardLevels[id] || 1) * JAR_FILL
  const valueOf    = (id) => jarsOf(id) * jarValueOf(id)

  // Spawn a jar travelling down the belt each time the machine pops one (a strain's
  // jar total ticks up). The baseline is seeded on mount so re-entering the room
  // doesn't replay every jar already made; the left counter reads jarCounts
  // directly, so the animation is purely the cosmetic delivery of that increment.
  const [jars, setJars] = useState([])
  const prevJarsRef = useRef(null)
  const jarKeyRef = useRef(0)
  useEffect(() => {
    const cur = {}
    placedIds.forEach(id => { cur[id] = jarsOf(id) })
    if (prevJarsRef.current === null) { prevJarsRef.current = cur; return }
    const spawned = []
    for (const id of placedIds) {
      if ((cur[id] || 0) > (prevJarsRef.current[id] || 0)) {
        // One delivery animation even if several jars pop at once.
        spawned.push({ key: ++jarKeyRef.current, color: strainOf(id)?.jarColor || '#8e44ad' })
      }
    }
    prevJarsRef.current = cur
    if (spawned.length) { sfx.tap?.(); setJars(j => [...j, ...spawned]) }
  }, [jarCounts, tableCards])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Aspect-locked room box so the skater stays glued to the floor at any
          screen size / orientation. */}
      <div style={{ position: 'relative', aspectRatio: '1600 / 905', maxWidth: '100%', maxHeight: '100%' }}>
        <img src="/packing-room.webp" alt="Packing Room" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />

        {/* RIGHT box — raw packed buds, one running tally per planted strain. */}
        {placedIds.length > 0 && (
          <div style={{
            position: 'absolute', left: `${(rx0 + rx1) / 2}%`, top: `${ryTop}%`,
            transform: 'translate(-50%, 14%)', zIndex: 4, pointerEvents: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            {placedIds.map(id => (
              <CounterPill key={id} label={strainOf(id).name} value={packedOf(id)} />
            ))}
          </div>
        )}

        {/* LEFT box — finished jars, tied to the same strains, tinted per strain. */}
        {placedIds.length > 0 && (
          <div style={{
            position: 'absolute', left: `${(lx0 + lx1) / 2}%`, top: `${lyTop}%`,
            transform: 'translate(-50%, 14%)', zIndex: 4, pointerEvents: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            {placedIds.map(id => (
              <CounterPill key={id} label={strainOf(id).name} value={valueOf(id)} prefix="$"
                color={strainOf(id).jarColor || GOLD} />
            ))}
          </div>
        )}

        {/* Jars riding the belt down into the left box (cosmetic deliveries). */}
        {jars.map(j => (
          <div key={j.key} onAnimationEnd={() => setJars(list => list.filter(x => x.key !== j.key))}
            style={{
              position: 'absolute', width: '4.6%', zIndex: PROP_Z, pointerEvents: 'none',
              transform: 'translate(-50%, -50%)',
              filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
              animation: 'jarRun 1.9s ease-in forwards',
            }}>
            <Jar color={j.color} />
          </div>
        ))}

        {/* Skater monkey lives in the packing room for every phase except B
            (when he's rolling through the grow room). */}
        {skatePhase !== 'B' && (
          <Skater phase={skatePhase} start={skateStart} onClick={onSkateClick} />
        )}
      </div>
    </div>
  )
}

// The skater monkey + his board, moving as one group. Each phase plays a
// constant-speed roll:
//   A: center → off right    B/C: in from right → off left    D: in from left → center
// The animation is offset by a negative delay = time already elapsed in the
// phase, so mounting mid-phase (you just switched into the room) shows him at
// his true position on the path rather than restarting. SKATER_Z keeps the whole
// monkey ABOVE every room layer — the art, the counters, the jars, and the bins —
// in every room, so no part of him is ever painted behind the scenery. Stationary
// at center when `phase` is 'idle'; tap him then (only then) to start a trip.
function Skater({ phase = 'idle', start = 0, onClick }) {
  const rolling = phase !== 'idle'
  const anim = useMemo(() => {
    const conf = SKATE_ANIM[phase]
    if (!conf) return 'none'
    const elapsed = Math.max(0, (Date.now() - start) / 1000)
    return `${conf.name} ${conf.secs}s linear ${(-elapsed).toFixed(2)}s forwards`
  }, [phase, start])
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: SKATER_Z, animation: anim }}>
      {/* Skateboard under the feet — wheels spin only while rolling. */}
      <div style={{ position: 'absolute', bottom: '5%', left: '50%', transform: 'translateX(-50%)', width: '16%' }}>
        <Skateboard spinning={rolling} />
      </div>
      {/* Monkey standing on the deck — tap (only when idle) to send him rolling. */}
      <img src="/thug-6.png" alt="Skater monkey"
        onClick={() => { if (phase === 'idle') { sfx.tap?.(); onClick && onClick() } }}
        style={{
          position: 'absolute', bottom: '8%', left: '50%', transform: 'translateX(-50%)',
          height: '60%', width: 'auto', objectFit: 'contain',
          filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.55))',
          pointerEvents: phase === 'idle' ? 'auto' : 'none',
          cursor: phase === 'idle' ? 'pointer' : 'default',
        }} />
    </div>
  )
}

// A cartoon skateboard (side view) drawn to match the bold-outline art style:
// a colored deck with kicked-up nose/tail on two trucks of cream wheels.
// `spinning` toggles the wheel rotation (on while the monkey is rolling).
function Skateboard({ spinning = false }) {
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
      {/* Wheels — one per truck (side view). Each wheel group spins (outer ring
          is symmetric, so the hub + spokes are what make the rotation visible). */}
      {[54, 146].map((cx, i) => (
        <g key={i} style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: spinning ? 'wheelSpin 0.5s linear infinite' : 'none' }}>
          <circle cx={cx} cy="50" r="11" fill="#f1e7c9" stroke="#140d06" strokeWidth="3.5" />
          {/* spokes (X) + hub */}
          <line x1={cx - 7} y1={50 - 7} x2={cx + 7} y2={50 + 7} stroke="#140d06" strokeWidth="1.6" />
          <line x1={cx - 7} y1={50 + 7} x2={cx + 7} y2={50 - 7} stroke="#140d06" strokeWidth="1.6" />
          <circle cx={cx} cy="50" r="2.7" fill="#140d06" />
        </g>
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

// A vine strung across the FULL width of the grow room with a sloth worker hanging
// from it over each table, its claws grazing the plant tops. Pure scenery — kept
// under the skater's z (≤ PROP_Z) so the monkey still rolls in front, and above the
// plants so the claws read as resting on them. All values are % of the room box.
const VINE_Y = 7.0          // vine vertical center
const VINE_H = 4.6          // vine thickness (% of room height)
const SLOTH_W = 14.5        // sloth width (% of room width)
const SLOTH_TOP = 4.5       // sloth top — its hands grip the vine here
const SLOTH_CENTERS = [27.0, 51.5, 78.0]   // one sloth per table (over the plants)

function GrowRoom({ planted, bank, onPlace, budCounts = {}, budResync = 0, onBudLand, tableCards = {}, onAdd, skatePhase = 'idle', skateStart = 0 }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Aspect-locked room box so the plant overlays stay glued to the benches
          at any screen size / orientation. */}
      <div style={{ position: 'relative', aspectRatio: '1600 / 905', maxWidth: '100%', maxHeight: '100%' }}>
        <img src="/grow-room.webp" alt="Grow Room" style={{ display: 'block', width: '100%', height: '100%' }} />
        {/* Vine across the full width, tiled at a fixed thickness. */}
        <div aria-hidden style={{
          position: 'absolute', left: 0, right: 0, top: `${VINE_Y - VINE_H / 2}%`, height: `${VINE_H}%`,
          backgroundImage: 'url(/vine.webp)', backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%',
          zIndex: 2, pointerEvents: 'none',
        }} />
        {/* A sloth worker hanging over each table, claws grazing the plant tops. */}
        {SLOTH_CENTERS.map((cx, i) => (
          <img key={`sloth${i}`} src="/sloth-worker.webp" alt="" aria-hidden
            style={{ position: 'absolute', left: `${cx}%`, top: `${SLOTH_TOP}%`, width: `${SLOTH_W}%`,
              transform: 'translateX(-50%)', zIndex: 3, pointerEvents: 'none',
              filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.35))' }} />
        ))}
        {/* The skater monkey passes through the grow room during phase B. */}
        {skatePhase === 'B' && <Skater phase="B" start={skateStart} />}
        <BeltBud planted={planted} budCounts={budCounts} resyncKey={budResync} onBudLand={onBudLand} />
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
          const n = Math.floor(budCounts[tbl] || 0)   // wall-clock truth; a bud lands as it ticks
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
                <button key={plant.id} onClick={() => { sfx.tap?.(); onPick(plant, level) }} style={{
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
// with perspective → into the bin). Each table's PLANTED buds are spread EVENLY in
// time — one bud lands every BUD_SECS/n seconds (n = plants on that table) — and
// the whole set is PHASE-LOCKED to the wall-clock count: the negative animation
// delay is solved so a bud reaches the box at the exact instant budCounts crosses
// the next integer. So the buds stay evenly spaced for any plant count, and each
// drop coincides with the counter ticking up. onAnimationIteration nudges the
// wall-clock forward at that frame so the displayed floor() updates on the drop.
// Re-locks (recomputes delays) only when the plant set changes or a box is hauled
// (resyncKey) — never every tick, so the animation runs smoothly.
function BeltBud({ planted, budCounts = {}, resyncKey = 0, onBudLand }) {
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

  // Snapshot budCounts via a ref so the delay solve reads the CURRENT count when it
  // (re)runs, without making the count a dep that would recompute every tick.
  const bcRef = useRef(budCounts)
  bcRef.current = budCounts
  const plantedSig = PLANT_SLOTS.filter(s => planted.includes(s.id) && BUD_PATHS[s.table]).map(s => s.id).join(',')
  const buds = useMemo(() => {
    const bc = bcRef.current
    const byTable = { 1: [], 2: [], 3: [] }
    PLANT_SLOTS.forEach(s => { if (planted.includes(s.id) && BUD_PATHS[s.table]) byTable[s.table].push(s) })
    const out = []
    for (const t of [1, 2, 3]) {
      const list = byTable[t].sort((a, b) => a.plant - b.plant)
      const n = list.length
      if (!n) continue
      const c0 = bc[t] || 0
      const step = BUD_SECS / n                       // even spacing between drops
      const tNext = (Math.floor(c0) + 1 - c0) * step  // secs until the next integer crossing (lane 0 drops)
      list.forEach((s, j) => {
        let remaining = tNext + j * step              // secs until THIS bud drops
        remaining = ((remaining % BUD_SECS) + BUD_SECS) % BUD_SECS
        out.push({ ...s, delay: -(BUD_SECS - remaining) })  // negative delay → lands at `remaining`
      })
    }
    return out
  }, [plantedSig, resyncKey])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{kf}</style>
      {buds.map(s => (
        <img key={s.id} src="/bud.webp" alt="" aria-hidden data-bud={s.id}
          onAnimationIteration={onBudLand ? () => onBudLand(s.table) : undefined}
          style={{ position: 'absolute', width: `${BUD_W}%`,
            animation: `bud${s.table} ${BUD_SECS}s linear ${s.delay.toFixed(2)}s infinite`,
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
      /* Skater roll phases (group translateX; % of the room-box width). */
      @keyframes rollExitRight   { from { transform: translateX(0);    } to { transform: translateX(85%);  } }
      @keyframes rollRightToLeft { from { transform: translateX(85%);  } to { transform: translateX(-85%); } }
      @keyframes rollEnterLeft   { from { transform: translateX(-85%); } to { transform: translateX(0);    } }
      @keyframes wheelSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      /* A finished jar appears at the machine end of the belt, slides down to the
         belt's far end, then drops into the left box (left/top in % of room box). */
      @keyframes jarRun {
        0%   { left: 32%;   top: 59%; opacity: 0; }
        12%  { opacity: 1; }
        60%  { left: 15.8%; top: 67%; opacity: 1; }
        100% { left: 15.8%; top: 74%; opacity: 1; }
      }
    `}</style>
  )
}
