import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { sfx } from '../sounds'
import { PLANTS, plantCashValue, RARITY_COLORS } from '../data/gameData'
import { getOwnedPlantTuples } from '../state/plantCardsStore'
import { getPlantUpgrade, PLANT_YIELD_PER_LEVEL } from '../state/plantUpgradesStore'
import { setRoomBank } from '../state/roomBankStore'
import { useActiveRaids } from '../state/raidsStore'
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
const SAVE_KEY = 'pe_traphouse_room_v3'
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

// Product ONE bud of this strain is worth — EXACTLY the card's "YIELD / LV" tile
// value: base perLevelYield + each yield upgrade's +3. So the grow-box counter, the
// haul into packing, and the number printed on the card all agree (a +7 card adds 7
// per bud). `cardLevel` is only used to look up that level's upgrade total — it does
// NOT multiply the yield, so a merged card never drifts away from its printed value.
function budYield(plantId, cardLevel = 1) {
  const plant = PLANTS.find(p => p.id === plantId)
  if (!plant) return 1
  const up = getPlantUpgrade(plantId, cardLevel).yield || 0
  return Math.max(1, (plant.perLevelYield || 0) + up * PLANT_YIELD_PER_LEVEL)
}

// ---- Sales economy ---------------------------------------------------
// REPUTATION (0–100) is one shop-wide number. Good sales raise it, gouging and empty
// shelves lower it; it drives how fast customers arrive. Deltas use diminishing
// returns (see adjustRep) so rep settles at an equilibrium set by your sale mix.
const REP_START = 50
const REP_DELTA = { cheap: 0.5, happy: 0.7, grumble: -0.5, refuse: -0.8, nostock: -1.4 }
// Customer arrival, customers/min, scaled by reputation (dead shop ~3/min → hot ~20/min).
// Used by BOTH the visible queue's spawn timer and the idle (offline) accrual so the
// money you earn watching ≈ the money you earn away.
const demandPerMin = (rep) => 3 + (Math.max(0, Math.min(100, rep)) / 100) * 17
const SALES_OFFLINE_CAP_MS = 2 * 60 * 60 * 1000   // bank at most ~2h of idle sales on return
// Basket: most buy 1 jar, some 2–3.
const rollBasket = () => 1 + (Math.random() < 0.3 ? 1 : 0) + (Math.random() < 0.1 ? 1 : 0)
// Offline accept probability from price/street ratio (mirrors the live tolerance roll).
const acceptProb = (ratio) => Math.max(0, Math.min(0.95, 0.95 - (ratio - 1) * 2))

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
  { key: 'dust', name: 'Dust Room',  art: '/dust-room.webp',  accent: '#b06ad0', hint: 'Premium dust — coming soon.' },
]

// `isOwner` is the owner-vs-visitor split. Only the owner walks the back rooms;
// the visitor view is a separate build (coming later). For now always owner.
export default function TrapHouse({ onBack, isOwner = true }) {
  // Incoming raids where I'm the defender = the trap house is under attack.
  const raids = useActiveRaids()
  const underAttack = (raids.incoming?.length || 0) > 0
  const [room, setRoom] = useState(0)
  const [land, setLand] = useState(isLandscape())
  const [rotated, setRotated] = useState(false)  // manual CSS rotate (works even with iOS orientation-lock on)
  // Persisted operating state — lazy-loaded from localStorage so the line resumes.
  const [saved] = useState(loadSaved)
  const [planted, setPlanted] = useState(() => Array.isArray(saved.planted) ? saved.planted : [])  // placed plant slots (each brings its bud + path)
  const [bank, setBank] = useState(() => typeof saved.bank === 'number' ? saved.bank : 200000)      // this store's bank balance ($) — full bank for testing
  // Mirror the bank to roomBankStore so the home-screen trap-house card shows the same number.
  useEffect(() => { setRoomBank(bank) }, [bank])
  // Shop reputation (0–100) — drives the customer arrival rate.
  const [rep, setRep] = useState(() => typeof saved.rep === 'number' ? saved.rep : REP_START)
  // Per-strain popularity multiplier (a rotating "hot strain" sits above 1) — weights
  // which strain customers reach for and how much shelf space it front-faces.
  const [popularity, setPopularity] = useState(() => saved.popularity || {})
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
  // (card cash value × JAR_FILL); see PackingRoom. The shelf shows up to its slot count;
  // anything beyond that is back-room storage (kept, not capped). A sale flies a jar off
  // the shelf and the slot refills from the back-room.
  const [jarCounts, setJarCounts] = useState(() => saved.jarCounts || {})
  // Which table the "+ Add" slot was tapped for — opens the card picker.
  const [picking, setPicking] = useState(null)
  // Player-set SELL PRICE per strain ($/jar). Unset ⇒ defaults to the strain's street
  // price (its card value × JAR_FILL). The MENU board edits these; customers compare
  // the price to the street price (and their own tolerance) to decide whether to buy.
  const [prices, setPrices] = useState(() => saved.prices || {})

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
  // SYNCHRONOUS source of truth for the accumulator. advanceNow + haul write it
  // immediately (not via an effect) so several bud-landings firing in the same frame
  // each build on the latest value instead of a stale render snapshot — otherwise
  // back-to-back landings would overwrite each other and the counter would stall.
  const budCountsRef = useRef(budCounts)
  const tableCardsRef = useRef(tableCards)
  useEffect(() => { tableCardsRef.current = tableCards }, [tableCards])
  const lastTickRef = useRef(typeof saved.lastTick === 'number' ? saved.lastTick : Date.now())

  // SHOP SALE: a customer at the counter buys one finished jar. Sell the strain with
  // the most jars in stock; drop one from the shelf and bank its cash value (the same
  // value the packing room shows). Returns the $ earned, or 0 if the shelf is empty
  // (the customer leaves angry). Reads live via a ref so the customer's timer sees the
  // current stock. (jarCounts/cardLevels mutate seldom, so a per-render ref is fine.)
  const jarCountsRef = useRef(jarCounts); jarCountsRef.current = jarCounts
  const cardLevelsRef = useRef(cardLevels); cardLevelsRef.current = cardLevels
  const pricesRef = useRef(prices); pricesRef.current = prices
  const popRef = useRef(popularity); popRef.current = popularity
  const repRef = useRef(rep)   // synchronous source of truth (adjustRep is the only writer)
  // Nudge reputation with diminishing returns (gains slow near 100, losses near 0).
  const adjustRep = useCallback((delta) => {
    const r = repRef.current
    const next = Math.max(0, Math.min(100, delta >= 0 ? r + delta * (1 - r / 100) : r + delta * (r / 100)))
    repRef.current = next
    setRep(next)
  }, [])
  // Edit a strain's sell price (the MENU board calls this). Clamped to a $1 floor.
  const setStrainPrice = useCallback((id, price) => {
    setPrices(p => ({ ...p, [id]: Math.max(1, Math.round(price)) }))
  }, [])
  // A customer (with a personal price `tolerance`, 1.0 = pays street price) buys a
  // basket of 1–3 jars of an in-stock strain (weighted by stock × popularity) at its
  // set price. Applies the reputation delta for the reaction. Returns { value, reaction,
  // color, qty }; reaction ∈ cheap | happy | grumble | refuse | nostock.
  const sellJar = useCallback((tolerance = 1.2) => {
    const jc = jarCountsRef.current
    const inStock = Object.keys(jc).filter(id => Math.floor(jc[id] || 0) >= 1)
    if (!inStock.length) { adjustRep(REP_DELTA.nostock); return { value: 0, reaction: 'nostock', color: null } }
    const wOf = (id) => Math.floor(jc[id] || 0) * (popRef.current[id] || 1)
    let roll = Math.random() * inStock.reduce((s, id) => s + wOf(id), 0)
    let best = inStock[0]
    for (const id of inStock) { roll -= wOf(id); if (roll <= 0) { best = id; break } }
    const strain = PLANTS.find(p => p.id === best)
    if (!strain) return { value: 0, reaction: 'nostock', color: null }
    const street = plantCashValue(strain, cardLevelsRef.current[best] || 1) * JAR_FILL
    const price = pricesRef.current[best] != null ? pricesRef.current[best] : street
    if (price > street * tolerance) { adjustRep(REP_DELTA.refuse); return { value: 0, reaction: 'refuse', color: strain.jarColor } }
    const qty = Math.min(rollBasket(), Math.floor(jc[best] || 0))
    jarCountsRef.current = { ...jc, [best]: Math.floor(jc[best] || 0) - qty }   // sync
    setJarCounts(j => ({ ...j, [best]: Math.max(0, Math.floor(j[best] || 0) - qty) }))
    const value = price * qty
    setBank(b => b + value)
    const ratio = price / street
    const reaction = ratio <= 0.95 ? 'cheap' : ratio <= 1.05 ? 'happy' : 'grumble'
    adjustRep(REP_DELTA[reaction])
    return { value, reaction, color: strain.jarColor, qty }
  }, [adjustRep])

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
    budCountsRef.current = next.budCounts   // synchronous — next call builds on this
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
          // Each bud is worth the strain's YIELD in raw product (see budYield) — the
          // grow counter tracks BUDS, but the monkey hauls buds × yield into packing.
          if (id && n) carryRef.current[id] = (carryRef.current[id] || 0) + n * budYield(id, cardLevelsRef.current[id] || 1)
          budCountsRef.current = { ...budCountsRef.current, [tbl]: 0 }  // empty (sync) so advanceNow sees 0
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

  // MACHINE: turns raw buds into jars. Each tick it pops just ONE jar, cycling
  // round-robin through the strains that have ≥ JAR_FILL raw buds — so jars come off
  // the belt one at a time, ALTERNATING colours instead of several at once. (One
  // strain per tick means lower total throughput, which is the intended trade.)
  const packCountsRef = useRef(packCounts)
  useEffect(() => { packCountsRef.current = packCounts }, [packCounts])
  const machineCursorRef = useRef(0)
  useEffect(() => {
    const id = setInterval(() => {
      const pc = packCountsRef.current
      const strains = Object.keys(pc)
      if (!strains.length) return
      // Next eligible strain starting from the cursor, so it alternates evenly.
      let pick = null
      for (let i = 0; i < strains.length; i++) {
        const idx = (machineCursorRef.current + i) % strains.length
        if ((pc[strains[idx]] || 0) >= JAR_FILL) { pick = strains[idx]; machineCursorRef.current = (idx + 1) % strains.length; break }
      }
      if (!pick) return
      setPackCounts(prev => { const next = { ...prev }; if ((next[pick] || 0) >= JAR_FILL) next[pick] -= JAR_FILL; return next })
      setJarCounts(prev => ({ ...prev, [pick]: (prev[pick] || 0) + 1 }))
    }, MACHINE_MS)
    return () => clearInterval(id)
  }, [])

  // IDLE SALES: the bank keeps earning while you're NOT watching the shop (other rooms
  // or away/closed), at the same demand rate the visible queue uses — so watching and
  // idling pay about the same. Each "customer" buys a basket of an in-stock strain if
  // they accept the price; empty shelf = lost sale + a rep ding. Capped at ~2h on
  // return. When you ARE on the shop screen the visible queue does the selling, so the
  // idle clock is just reset (no double counting). Offline jars only deplete existing
  // stock (hauling is manual, so no new jars are packed while away).
  const roomRef = useRef(room)
  useEffect(() => { roomRef.current = room }, [room])
  const idleTsRef = useRef(typeof saved.lastSaleTs === 'number' ? saved.lastSaleTs : Date.now())
  const accrueIdleSales = useCallback(() => {
    const now = Date.now()
    let elapsed = Math.min(now - idleTsRef.current, SALES_OFFLINE_CAP_MS)
    idleTsRef.current = now
    if (elapsed <= 0) return
    let nCust = Math.min(2000, Math.floor((elapsed / 1000) * (demandPerMin(repRef.current) / 60)))
    if (nCust <= 0) return
    const jc = { ...jarCountsRef.current }
    let bankGain = 0, repAccum = 0
    for (let i = 0; i < nCust; i++) {
      const inStock = Object.keys(jc).filter(id => Math.floor(jc[id] || 0) >= 1)
      if (!inStock.length) { repAccum += REP_DELTA.nostock; continue }
      const wOf = (id) => Math.floor(jc[id] || 0) * (popRef.current[id] || 1)
      let roll = Math.random() * inStock.reduce((s, id) => s + wOf(id), 0); let best = inStock[0]
      for (const id of inStock) { roll -= wOf(id); if (roll <= 0) { best = id; break } }
      const strain = PLANTS.find(p => p.id === best); if (!strain) continue
      const street = plantCashValue(strain, cardLevelsRef.current[best] || 1) * JAR_FILL
      const price = pricesRef.current[best] != null ? pricesRef.current[best] : street
      if (Math.random() < acceptProb(price / street)) {
        const qty = Math.min(rollBasket(), Math.floor(jc[best] || 0))
        jc[best] = Math.floor(jc[best] || 0) - qty
        bankGain += price * qty
        repAccum += price <= street * 1.05 ? REP_DELTA.happy : REP_DELTA.grumble
      } else { repAccum += REP_DELTA.refuse }
    }
    if (bankGain > 0) setBank(b => b + bankGain)
    jarCountsRef.current = jc; setJarCounts(jc)
    if (repAccum) adjustRep(Math.max(-8, Math.min(8, repAccum * 0.15)))   // dampen the aggregate swing
  }, [adjustRep])
  useEffect(() => {
    accrueIdleSales()                                   // mount: credit the time away
    const id = setInterval(() => {
      if (roomRef.current === 0) { idleTsRef.current = Date.now(); return }  // on the shop screen → live queue sells
      accrueIdleSales()
    }, 3000)
    const onVis = () => { if (!document.hidden) accrueIdleSales() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [accrueIdleSales])

  // HOT STRAIN: every few minutes a random planted strain trends (popularity 1.6×),
  // so it sells faster and front-faces more shelf space. Recomputed on mount + timer.
  useEffect(() => {
    const pickHot = () => {
      const ids = [...new Set(Object.values(tableCardsRef.current))].filter(id => PLANTS.find(p => p.id === id))
      if (!ids.length) { setPopularity({}); return }
      const hot = ids[Math.floor(Math.random() * ids.length)]
      const pop = {}; ids.forEach(id => { pop[id] = id === hot ? 1.6 : 1 })
      setPopularity(pop)
    }
    pickHot()
    const id = setInterval(pickHot, 3 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Persist the operating state on every change so a reload resumes the line:
  // plants, bank, grow-box buds, table cards/levels, right-box raw buds, left-box
  // jars, the generation clock, prices, reputation, popularity, and the sales clock.
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        planted, bank, budCounts, tableCards, cardLevels, packCounts, jarCounts, prices, rep, popularity,
        lastTick: lastTickRef.current, lastSaleTs: idleTsRef.current,
      }))
    } catch {}
  }, [planted, bank, budCounts, tableCards, cardLevels, packCounts, jarCounts, prices, rep, popularity])

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

  // Uproot a table — clear its plants + strain + any un-hauled buds so you can replant
  // (the grow CARD stays owned; planting only assigns it to a table). Targets one table.
  const uprootTable = (table) => {
    setPlanted(p => p.filter(id => !id.startsWith(`T${table}-`)))
    setTableCards(tc => { const next = { ...tc }; delete next[table]; return next })
    setBudCounts(c => ({ ...c, [table]: 0 }))
    budCountsRef.current = { ...budCountsRef.current, [table]: 0 }
    setBudResync(r => r + 1)
    sfx.tap?.()
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

  // Swipe left/right to step between rooms (like the arrows / dots). When the
  // interior is CSS-rotated for fullscreen, the room reads sideways, so a
  // horizontal room swipe is a vertical drag in page coords — map to the right
  // axis. Ignore short or mostly-cross-axis drags so taps/scrolls don't fire.
  const swipe = useRef(null)
  const onTouchStart = (e) => { const t = e.touches[0]; swipe.current = { x: t.clientX, y: t.clientY } }
  const onTouchEnd = (e) => {
    if (!swipe.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - swipe.current.x
    const dy = t.clientY - swipe.current.y
    swipe.current = null
    const along = rotated ? dy : dx          // displacement along the room's horizontal axis
    const cross = rotated ? dx : dy
    if (Math.abs(along) < 45 || Math.abs(along) < Math.abs(cross)) return
    go(along < 0 ? 1 : -1)                   // swipe left → deeper room, right → toward the front
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
    <div style={containerStyle} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <Keyframes />

      {/* Status banner — first room (Shop Front) only, centered at the top of
          the screen. Red UNDER FIRE while a raid targets you (incoming raids),
          green SAFE otherwise. zIndex above the top bar so it reads clearly. */}
      {cur.key === 'shop' && (
        <div style={{
          position: 'absolute', top: 'calc(8px + env(safe-area-inset-top))',
          left: '50%', transform: 'translateX(-50%)', zIndex: 6,
          display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
          background: underAttack ? 'rgba(120,20,20,0.92)' : 'rgba(18,70,40,0.9)',
          border: `1px solid ${underAttack ? '#e74c3c' : GREEN}`,
          borderRadius: 12, padding: '7px 14px',
          color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: 1,
          boxShadow: '0 2px 12px rgba(0,0,0,0.55)',
        }}>
          {underAttack ? (
            <>
              <i className="ti ti-alert-triangle-filled" style={{ color: '#ffd24a', fontSize: 15 }} />
              TRAP HOUSE UNDER FIRE
            </>
          ) : (
            <>
              <i className="ti ti-shield-check-filled" style={{ color: GREEN, fontSize: 15 }} />
              TRAP HOUSE SAFE
            </>
          )}
        </div>
      )}

      {/* Room fills the whole screen as a backdrop — so it grows to fill the
          display when the phone is turned sideways. Controls float on top.
          zIndex:0 makes this its own stacking context, so the monkey's high
          z-index keeps him above the room art/counters but still under the UI
          chrome (top bar, arrows) that floats over everything. */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        {cur.key === 'shop' && <ShopFront art={cur.art} jarCounts={jarCounts} tableCards={tableCards} cardLevels={cardLevels} prices={prices} popularity={popularity} rep={rep} onSetPrice={setStrainPrice} onSell={sellJar} />}
        {cur.key === 'pack' && <PackingRoom skatePhase={skate.phase} skateStart={skate.start} onSkateClick={startSkate} packCounts={packCounts} jarCounts={jarCounts} tableCards={tableCards} cardLevels={cardLevels} />}
        {cur.key === 'grow' && <GrowRoom planted={planted} bank={bank} onPlace={placeSlot} budCounts={budCounts} budResync={budResync} onBudLand={advanceNow} tableCards={tableCards} cardLevels={cardLevels} onAdd={setPicking} onUproot={uprootTable} skatePhase={skate.phase} skateStart={skate.start} onSkateClick={startSkate} />}
        {cur.key === 'dust' && <DustRoom art={cur.art} />}
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
        {/* Shop reputation + bank — only shown in the shop, where they apply.
            The back rooms (packing, grow) hide them to keep the focus on
            production. */}
        {cur.key === 'shop' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(26,21,16,0.85)', border: `0.5px solid ${GOLD}55`, borderRadius: 13, padding: '7px 12px' }}>
            <span style={{ color: DIM, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>REP</span>
            <span style={{ color: rep >= 66 ? GREEN : rep >= 33 ? '#e0a93f' : '#c0392b', fontWeight: 800, fontSize: 20, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              <i className="ti ti-star-filled" style={{ fontSize: 13 }} /> {Math.round(rep)}
            </span>
          </div>
        )}
        {/* Bank balance for this store — sits left of the rotate button, sized up
            so the take reads at a glance. */}
        {cur.key === 'shop' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', background: 'rgba(26,21,16,0.85)', border: `0.5px solid ${GOLD}55`, borderRadius: 13, padding: '7px 18px' }}>
            <span style={{ color: DIM, fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>BANK</span>
            <span style={{ color: GREEN, fontWeight: 800, fontSize: 26, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>${bank.toLocaleString()}</span>
          </div>
        )}
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
const SHELF_ROWS = [31.4, 38.6, 45.6]                      // jar-bottom baseline, % of room box
const SHELF_BAYS = [[38.0, 47.5], [50.8, 60.3], [63.6, 73.6]]
const SHELF_FRAC = [0.18, 0.5, 0.82]                       // jar centers within a bay
const SHELF_JAR_W = 2.52                                   // jar width, % of room box
const SHELF_SLOTS = SHELF_ROWS.flatMap(y =>               // all slot centers, in stock order
  SHELF_BAYS.flatMap(([b0, b1]) => SHELF_FRAC.map(f => ({ x: b0 + (b1 - b0) * f, y }))))

// CUSTOMERS — a queue of shoppers come in the front door and line up on the RIGHT.
// Each is anchored by its FEET (bottom-center) at these % points of the room box,
// scaled by width %. A customer joins at the BACK of the line and shifts forward a
// spot each time the front leaves. The front only buys once someone is in line behind
// it. SALES_ENABLED gates buying — off for now so the line just stacks up.
const SALES_ENABLED = true
const CUST_DOOR = { x: 14, y: 73, w: 5.2 }     // entry, at the left doorway (small/far)
const CUST_OUT  = { x: 3,  y: 67, w: 4.6 }     // exit, back out the door (fades)
// The line on the RIGHT, FRONT first → back, each spot a touch smaller/farther.
// Two rows so the line never runs onto the display case: row 1 (back) is 5 spots on
// the right; row 2 (front, lower/closer + a touch bigger) is 5 more directly below it.
// CUST_ROW_LEN spots make a row; a new customer only heads to a later row once every
// earlier row is fully ARRIVED (so nobody takes the 2nd-line path until line 1 is up).
const CUST_ROW_LEN = 5
const QUEUE_SPOTS = [
  { x: 44,   y: 78.5, w: 7.0 },   // 0 — front / serving (row 1, back)
  { x: 51.5, y: 78.5, w: 6.7 },   // 1
  { x: 59,   y: 78.5, w: 6.5 },   // 2
  { x: 66,   y: 78.5, w: 6.3 },   // 3
  { x: 73,   y: 78.5, w: 6.1 },   // 4 — end of row 1
  // Row 2 SNAKES back the other way (right → left), and starts under spot 1 (not spot
  // 0) so the served customer stays in clear view. Snaking keeps every advance a short
  // step: 4→ turn the corner down, then walk left along the front row.
  { x: 73,   y: 90,   w: 6.8 },   // 5 — corner, below spot 4
  { x: 66,   y: 90,   w: 7.0 },   // 6
  { x: 59,   y: 90,   w: 7.2 },   // 7
  { x: 51.5, y: 90,   w: 7.5 },   // 8 — back of the line (below spot 1)
]
const CUST_SPEED = 11          // walk speed, % of room width per second (constant pace)
const moveSecs = (ax, bx) => Math.max(0.6, Math.abs(ax - bx) / CUST_SPEED)
// Paying customers for the line pool. GNOME 10 is NOT here — he's the bum (below).
const CUSTOMER_SPRITES = ['/gnome.webp', '/gnome-2.webp', '/gnome-3.webp', '/gnome-4.webp', '/gnome-5.webp', '/gnome-6.webp', '/gnome-7.webp', '/gnome-8.webp', '/gnome-9.webp', '/gnome-11.webp', '/gnome-12.webp', '/gnome-13.webp', '/gnome-14.webp', '/gnome-15.webp', '/gnome-16.webp', '/gnome-17.webp', '/gnome-18.webp', '/gnome-21.webp', '/gnome-23.webp']
// Sprites split into a body + a separate head layer so the head can bobble like a
// bobblehead toy. The base sprite (in CUSTOMER_SPRITES) is the body; the head
// image overlays it and rotates around the neck `pivot`. GNOME 13's big
// caricature head is built for it.
const HEAD_OVERLAY = {
  '/gnome-13.webp': { src: '/gnome-13-head.webp', pivot: '50% 45%' },
}
const CUST_SIZE = {                            // per-sprite size multipliers
  '/gnome-2.webp': 1,
  '/gnome-5.webp': 1.2,
  '/gnome-6.webp': 1.1,
  '/gnome-7.webp': 1.1,
  '/gnome-8.webp': 1.2,
  '/gnome-9.webp': 2,
  '/gnome-14.webp': 1.2,                       // tall, lanky sprite — 2× the prior 0.6 size
  '/gnome-16.webp': 0.83,                      // clown — 3× smaller than the prior 2.5
  '/gnome-18.webp': 1.5,                       // baby-outfit — 2× smaller than the prior 3
}
// A customer's personal price tolerance (1.0 = pays the street price exactly). ~95%
// happily pay street or more; ~5% are picky and balk even at street price.
function rollTolerance() {
  if (Math.random() < 0.05) return 0.85 + Math.random() * 0.15   // picky 5%: [0.85, 1.0)
  return 1.0 + Math.random() * 0.6                                // the rest: [1.0, 1.6]
}

// THE BUM (GNOME 10) — a recurring gag, separate from the paying line. He shuffles up
// to the counter, begs the cashier for free buds (holding everyone up), gets told to
// get lost, and storms off mad. BEG_SPOT is his foreground spot at the register.
const BUM_SPRITE = '/gnome-10.webp'
const BEG_SPOT = { x: 36, y: 88, w: 6.6 }      // at the register, in the foreground
const BEG_EVERY = [22, 45]                     // seconds between bum visits [min, max]
// Dialog, alternating bum ↔ cashier; the last bum line is his exit huff.
const BEG_DIALOG = [
  { who: 'bum',    text: "Ayo, spare one free nug?", ms: 2100 },
  { who: 'clerk',  text: "This ain't a charity, dawg.", ms: 2000 },
  { who: 'bum',    text: "C'mon, just a lil' crumb!", ms: 2100 },
  { who: 'clerk',  text: "Pay up or step off.", ms: 1900 },
  { who: 'bum',    text: "I'll get you back next week, swear!", ms: 2300 },
  { who: 'clerk',  text: "GET LOST, bum!", ms: 1900 },
  { who: 'bum',    text: "Y'all trash anyway! 😤", ms: 2000 },
]

function ShopFront({ art, jarCounts = {}, tableCards = {}, cardLevels = {}, prices = {}, popularity = {}, rep = 50, onSetPrice, onSell }) {
  const [menuOpen, setMenuOpen] = useState(false)
  // One tinted jar per banked unit, in the order strains were planted, capped at
  // the shelf's slot count so the stock never overflows the cabinet.
  const placedIds = [...new Set(Object.values(tableCards))].filter(id => PLANTS.find(p => p.id === id))
  // The shelf FRONT-FACES your inventory: its slots are split between the strains in
  // proportion to each one's share of stock (× demand weight — uniform for now), then
  // interleaved so the colors are mixed across the shelf rather than blocked together.
  // Anything past the shelf's capacity sits in back storage. So if you mostly hold
  // Purple Haze with a little Golden Mist, the shelf is mostly purple with some gold.
  const stock = (() => {
    const cap = SHELF_SLOTS.length
    const inv = placedIds
      .map(id => ({ id, color: PLANTS.find(p => p.id === id)?.jarColor || '#8e44ad',
        weight: Math.floor(jarCounts[id] || 0) * (popularity[id] || 1) }))   // stock × demand
      .filter(x => x.weight > 0)
    const total = inv.reduce((s, x) => s + x.weight, 0)
    if (!total) return []
    const shown = Math.min(total, cap)
    // Proportional slot allocation, largest-remainder rounded to exactly `shown`.
    inv.forEach(x => { const exact = shown * x.weight / total; x.n = Math.floor(exact); x.frac = exact - x.n })
    let rem = shown - inv.reduce((s, x) => s + x.n, 0)
    inv.slice().sort((a, b) => b.frac - a.frac).forEach(x => { if (rem > 0) { x.n++; rem-- } })
    // Highest-averages interleave so each strain's jars spread evenly across the slots.
    const out = []
    const placed = {}; inv.forEach(x => { placed[x.id] = 0 })
    for (let i = 0; i < shown; i++) {
      let best = null, bestP = -1
      for (const x of inv) {
        if (placed[x.id] >= x.n) continue
        const p = x.n / (placed[x.id] + 1)
        if (p > bestP) { bestP = p; best = x }
      }
      if (!best) break
      out.push(best.color); placed[best.id]++
    }
    return out
  })()
  // Live mirrors of the shelf so a sale (which fires from a child timer) can read the
  // current top jar without going stale.
  const stockRef = useRef(stock); stockRef.current = stock

  // On each sale, fly a jar off the top of the shelf to the customer at the counter,
  // then the slot refills from the back-room (jarCounts beyond the shelf's capacity).
  const [flying, setFlying] = useState([])
  const flyKey = useRef(0)
  const handleSell = useCallback((tolerance) => {
    const res = onSell ? onSell(tolerance) : { value: 0, reaction: 'nostock' }
    if (res.value > 0) {
      const s = stockRef.current
      const slot = SHELF_SLOTS[Math.max(0, s.length - 1)] || SHELF_SLOTS[0]
      const key = ++flyKey.current
      setFlying(f => [...f, { key, color: res.color || s[s.length - 1] || '#8e44ad', x: slot.x, y: slot.y, to: false }])
      setTimeout(() => setFlying(f => f.map(j => j.key === key ? { ...j, to: true } : j)), 30)
      setTimeout(() => setFlying(f => f.filter(j => j.key !== key)), 850)
    }
    return res
  }, [onSell])

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Aspect-locked room box so the clerk lines up with the counter at any size. */}
      <div style={{ position: 'relative', aspectRatio: '1600 / 900', maxWidth: '100%', maxHeight: '100%' }}>
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
        {/* Jars sold — fly from the shelf top down to the customer at the counter. */}
        {flying.map(j => (
          <div key={j.key} style={{
            position: 'absolute', left: `${j.to ? 43 : j.x}%`, top: `${j.to ? 64 : j.y}%`,
            width: `${SHELF_JAR_W * 1.15}%`, transform: 'translate(-50%, -100%)',
            zIndex: 23, pointerEvents: 'none', opacity: j.to ? 0 : 1,
            transition: 'left 0.8s ease-in, top 0.8s cubic-bezier(.45,0,.7,1), opacity 0.8s ease-in',
            filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.5))',
          }}>
            <Jar color={j.color} />
          </div>
        ))}
        {/* Nodding clerk standing BEHIND the counter — clipped at the counter
            top so his body is hidden; only his head/shoulders nod above it.
            Sits above the shelved jars (he's in front of the cabinet). */}
        <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(0 0 50% 0)', zIndex: PROP_Z + 1, pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute', left: '50%', bottom: '20%',
            transform: 'translateX(-50%)',
            height: '53.1%', aspectRatio: '229 / 581',
            filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.45))',
          }}>
            <img src="/thug-4-body.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
            <img src="/thug-4-head.png" alt="" style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
              transformOrigin: '50% 30%', animation: 'thugNod 2.6s ease-in-out infinite',
            }} />
          </div>
        </div>

        {/* Customer queue — shoppers walk in the door, line up, and buy jars. */}
        <ShopCustomers onSell={handleSell} rep={rep} />

        {/* The MENU board on the wall is the price editor — tap to set sell prices.
            A bold pulsing gold outline frames the board + a bobbing "Set Prices"
            chip below it, so it's obvious you can tap it. Always shown (drawing the
            eye to the sign) regardless of whether strains are placed yet. */}
        <button onClick={() => setMenuOpen(true)} aria-label="Edit menu prices"
          style={{ position: 'absolute', left: '28.4%', top: '18.8%', width: '10.6%', height: '26%',
            zIndex: 6, background: 'transparent', border: 'none', cursor: 'pointer' }} />
        {/* Pulsing outline ring (decorative; clicks pass through to the button under it). */}
        <div aria-hidden style={{ position: 'absolute', left: '28.4%', top: '18.8%', width: '10.6%', height: '26%',
          zIndex: 6, border: `2px solid ${GOLD}`, borderRadius: 5, pointerEvents: 'none',
          animation: 'menuGlow 1.5s ease-in-out infinite' }} />
        {/* Hint chip moved to top-center, just under the bank / top bar. */}
        <div onClick={() => setMenuOpen(true)}
          style={{ position: 'absolute', left: '50%', top: '2.5%', transform: 'translate(-50%, 0)',
            zIndex: 7, cursor: 'pointer', whiteSpace: 'nowrap',
            background: GOLD, color: '#1a1206', fontSize: 10, fontWeight: 900, letterSpacing: 0.5,
            padding: '3px 9px', borderRadius: 999, boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', gap: 4,
            animation: 'menuBob 1.1s ease-in-out infinite' }}>
          <i className="ti ti-tag" style={{ fontSize: 11 }} /> Set Prices
        </div>
      </div>

      {menuOpen && (
        <MenuEditor placedIds={placedIds} cardLevels={cardLevels} prices={prices} popularity={popularity}
          onSetPrice={onSetPrice} onClose={() => setMenuOpen(false)} />
      )}
    </div>
  )
}

// The price editor behind the MENU board: one row per strain you sell, with its street
// price (what ~95% will pay) and −/＋ to set your price. Pricing above street loses
// customers; below it leaves money on the table.
function MenuEditor({ placedIds, cardLevels, prices, popularity = {}, onSetPrice, onClose }) {
  const rows = placedIds.map(id => PLANTS.find(p => p.id === id)).filter(Boolean)
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,5,3,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'calc(18px + env(safe-area-inset-top)) 18px calc(18px + env(safe-area-inset-bottom))',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 420, background: '#13110d', border: `1px solid ${GOLD}55`,
        borderRadius: 16, padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: 1 }}>MENU — Set Prices</div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
            border: '0.5px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><i className="ti ti-x" /></button>
        </div>
        <div style={{ color: DIM, fontSize: 11, marginBottom: 12 }}>$ per jar. Most customers pay the street price; charge more and some walk.</div>
        {rows.length === 0 ? (
          <div style={{ background: '#1a1712', border: '0.5px solid #2a2722', borderRadius: 12, padding: 20, textAlign: 'center', color: '#7a766a', fontSize: 12 }}>
            Plant a strain in the grow room first.
          </div>
        ) : rows.map(strain => {
          const street = plantCashValue(strain, cardLevels[strain.id] || 1) * JAR_FILL
          const price = prices[strain.id] != null ? prices[strain.id] : street
          const step = Math.max(1, Math.round(street * 0.05))
          const pct = Math.round((price / street) * 100)
          const tone = price > street ? '#e0a93f' : price < street ? '#4a9eff' : GREEN
          return (
            <div key={strain.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1a1712',
              border: `1px solid ${(strain.jarColor || GOLD)}55`, borderRadius: 12, padding: '9px 11px', marginBottom: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: strain.jarColor || GOLD, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
                  {strain.shortName || strain.name}
                  {(popularity[strain.id] || 1) > 1.2 && <span style={{ color: '#ff7a3d', fontSize: 10, fontWeight: 800, marginLeft: 6 }}>🔥 HOT</span>}
                </div>
                <div style={{ color: DIM, fontSize: 10 }}>street ${street.toLocaleString()} · <span style={{ color: tone }}>{pct}%</span></div>
              </div>
              <button onClick={() => onSetPrice(strain.id, price - step)} style={priceBtn}>−</button>
              <div style={{ color: tone, fontWeight: 900, fontSize: 16, minWidth: 64, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>${price.toLocaleString()}</div>
              <button onClick={() => onSetPrice(strain.id, price + step)} style={priceBtn}>＋</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
const priceBtn = {
  width: 32, height: 32, borderRadius: 8, background: '#2a2620', color: '#fff',
  border: '0.5px solid #4a443a', fontSize: 18, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
}

// The keyframes that move a customer between the door / line / front / exit spots.
// Each is fill-forwards and its 0% matches the previous move's end, so swapping the
// animation on the same element (e.g. line→front) is seamless. The inner img runs
// `custWaddle` while walking. Built from the CUST_* constants so they stay in sync.
// Keyframes for every move between the door / queue spots / exit, generated from the
// constants. Each is fill-forwards and its 0% matches the previous move's end, so
// swapping the animation on the same element (advance, leave) is seamless.
//   custIn{k}  : door → queue spot k        (a customer joining at the back)
//   custAdv{k} : spot k+1 → spot k          (shifting one place forward)
//   custOut    : spot 0 → exit (fades)
function CustomerKeyframes() {
  const f = (p) => `left:${p.x}%; top:${p.y}%; width:${p.w}%;`
  let kf = ''
  QUEUE_SPOTS.forEach((spot, k) => {
    kf += `@keyframes custIn${k} { 0% { ${f(CUST_DOOR)} } 100% { ${f(spot)} } }\n`
    if (k > 0) kf += `@keyframes custAdv${k - 1} { 0% { ${f(QUEUE_SPOTS[k])} } 100% { ${f(QUEUE_SPOTS[k - 1])} } }\n`
  })
  kf += `@keyframes custOut { 0% { ${f(QUEUE_SPOTS[0])}; opacity:1; } 80% { opacity:1; } 100% { ${f(CUST_OUT)}; opacity:0; } }\n`
  kf += `@keyframes custBegIn  { 0% { ${f(CUST_DOOR)} } 100% { ${f(BEG_SPOT)} } }\n`
  kf += `@keyframes custBegOut { 0% { ${f(BEG_SPOT)}; opacity:1; } 80% { opacity:1; } 100% { ${f(CUST_OUT)}; opacity:0; } }\n`
  kf += `@keyframes custWaddle { 0%,50%,100% { transform: translateY(0) rotate(0deg); } 25% { transform: translateY(-4%) rotate(2.5deg); } 75% { transform: translateY(-4%) rotate(-2.5deg); } }\n`
  kf += `@keyframes custBubblePop { 0% { transform: translate(-50%,-100%) scale(0.5); opacity:0; } 100% { transform: translate(-50%,-100%) scale(1); opacity:1; } }\n`
  // Bobblehead rock — a damped wobble that overshoots then settles, on loop.
  kf += `@keyframes bobbleHead { 0% { transform: rotate(0deg); } 20% { transform: rotate(6deg); } 45% { transform: rotate(-5deg); } 65% { transform: rotate(3deg); } 82% { transform: rotate(-1.5deg); } 100% { transform: rotate(0deg); } }`
  return <style>{kf}</style>
}

// One customer sprite. The outer layer carries it between spots via `c.anim` (over
// `c.dur` seconds at a constant pace); a middle layer scales the whole sprite for the
// per-sprite size override (GNOME 2 = 2×); the inner img waddles while walking. The
// closer to the front (lower pos), the higher it paints so the line overlaps right.
function CustomerSprite({ c }) {
  const walking = c.phase === 'enter' || c.phase === 'leave'
  const ease = c.anim === 'custOut' ? 'ease-in' : c.anim.startsWith('custAdv') ? 'ease-in-out' : 'ease-out'
  const size = CUST_SIZE[c.sprite] || 1
  const head = HEAD_OVERLAY[c.sprite]
  // Later rows are nearer the viewer, so they paint IN FRONT of earlier rows; within a
  // row the front-of-line sits on top. A leaving customer crosses in front of everyone.
  const inLine = typeof c.pos === 'number'
  const row = inLine ? Math.floor(c.pos / CUST_ROW_LEN) : 0
  const z = c.phase === 'leave' ? 50 : 20 + row * 5 - (inLine ? c.pos % CUST_ROW_LEN : 0)
  return (
    <div style={{
      position: 'absolute', transform: 'translate(-50%, -100%)', zIndex: z, pointerEvents: 'none',
      filter: 'drop-shadow(0 6px 9px rgba(0,0,0,0.4))',
      animation: `${c.anim} ${c.dur}s ${ease} forwards`,
    }}>
      {(c.phase === 'buy' || c.phase === 'angry') && <CustomerBubble reaction={c.reaction} value={c.value} size={size} />}
      <div style={{ width: '100%', transform: `scale(${size})`, transformOrigin: '50% 100%' }}>
        {/* Body + (optional) bobbling head waddle together while walking; the head
            additionally rocks on its neck pivot like a bobblehead toy. */}
        <div style={{ position: 'relative', width: '100%', transformOrigin: '50% 100%',
          animation: walking ? 'custWaddle 0.5s ease-in-out infinite' : 'none' }}>
          <img src={c.sprite} alt="" aria-hidden style={{ display: 'block', width: '100%' }} />
          {head && <img src={head.src} alt="" aria-hidden style={{
            position: 'absolute', left: 0, top: 0, width: '100%', transformOrigin: head.pivot,
            animation: 'bobbleHead 1.7s ease-in-out infinite',
          }} />}
        </div>
      </div>
    </div>
  )
}

// Speech bubble over a customer's head — the 4-tier price reaction (+ stock-out).
// Sized in px so it stays readable regardless of the sprite scale.
const REACTIONS = {
  cheap:   { color: '#2e9bff', text: (v) => `🤑 +$${v.toLocaleString()}` },   // underpriced steal
  happy:   { color: '#1f7a33', text: (v) => `🛒 +$${v.toLocaleString()}` },   // ideal
  grumble: { color: '#d9881f', text: (v) => `😒 +$${v.toLocaleString()}` },   // overpriced but pays
  refuse:  { color: '#c0392b', text: () => `😤 Too high!` },                   // walks
  nostock: { color: '#c0392b', text: () => `😠 No jars?!` },                   // empty shelf
}
function CustomerBubble({ reaction = 'happy', value = 0, size = 1 }) {
  const r = REACTIONS[reaction] || REACTIONS.happy
  return (
    <div style={{
      position: 'absolute', left: '50%', top: `${-4 - (size - 1) * 100}%`, transformOrigin: '50% 100%',
      background: '#fff', border: '2px solid #1a1206', borderRadius: 10, padding: '4px 9px',
      whiteSpace: 'nowrap', zIndex: 21, boxShadow: '0 3px 7px rgba(0,0,0,0.45)',
      animation: 'custBubblePop 0.25s ease-out forwards',
    }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: r.color }}>{r.text(value)}</span>
      <div style={{
        position: 'absolute', left: '50%', bottom: -7, transform: 'translateX(-50%)', width: 0, height: 0,
        borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '8px solid #1a1206',
      }} />
    </div>
  )
}

// The bum shuffling to the counter and out again (its own walk anims; waddles while
// moving). Painted above the line so he's clearly the one holding things up.
function Beggar({ b }) {
  const walking = b.phase === 'in' || b.phase === 'out'
  const anim = b.phase === 'out'
    ? `custBegOut ${moveSecs(BEG_SPOT.x, CUST_OUT.x)}s ease-in forwards`
    : `custBegIn ${moveSecs(CUST_DOOR.x, BEG_SPOT.x)}s ease-out forwards`
  return (
    <div style={{
      position: 'absolute', transform: 'translate(-50%, -100%)', zIndex: 40, pointerEvents: 'none',
      filter: 'drop-shadow(0 7px 10px rgba(0,0,0,0.45))', animation: anim,
    }}>
      <img src={BUM_SPRITE} alt="" aria-hidden style={{
        display: 'block', width: '100%', transformOrigin: '50% 100%',
        animation: walking ? 'custWaddle 0.5s ease-in-out infinite' : 'none',
      }} />
    </div>
  )
}

// A line of dialog — over the BUM (red) or over the CASHIER (dark), one at a time.
function DialogBubble({ line }) {
  const fromBum = line.who === 'bum'
  const x = fromBum ? BEG_SPOT.x : 52      // over the bum, or over the clerk at the counter
  const y = fromBum ? 44 : 37
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -100%)',
      transformOrigin: '50% 100%', zIndex: 42, pointerEvents: 'none', width: '26%', maxWidth: 220,
      background: '#fff', border: '2px solid #1a1206', borderRadius: 12, padding: '6px 11px',
      boxShadow: '0 4px 9px rgba(0,0,0,0.5)', animation: 'custBubblePop 0.2s ease-out forwards',
    }}>
      <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.25, display: 'block', textAlign: 'center',
        color: fromBum ? '#b23b2e' : '#1a1206' }}>{line.text}</span>
      <div style={{
        position: 'absolute', left: '50%', bottom: -9, transform: 'translateX(-50%)', width: 0, height: 0,
        borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid #1a1206',
      }} />
    </div>
  )
}

// The customer pipeline — an N-deep queue (N = QUEUE_SPOTS.length). A customer joins
// at the back, and when the front leaves everyone shifts one spot forward and a new
// one fills the back. The front only buys once someone is in line behind it; a sale
// banks the jar value and the front leaves. SALES_ENABLED off ⇒ nobody buys, so the
// line just stacks to full. Each on-screen customer gets a DISTINCT sprite. State is
// a ref (single source of truth for the timer machine); `bump` forces a re-render.
function ShopCustomers({ onSell, rep = 50 }) {
  const [, bump] = useState(0)
  const modelRef = useRef([])
  const beggarRef = useRef(null)                 // the bum's current state, or null
  const onSellRef = useRef(onSell); onSellRef.current = onSell
  const repRef = useRef(rep); repRef.current = rep

  useEffect(() => {
    let alive = true
    const N = QUEUE_SPOTS.length
    const timers = new Set()
    const after = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn() }, ms); timers.add(t) }
    modelRef.current = []
    let n = 0, spawnPending = false
    const commit = () => { if (alive) bump(v => v + 1) }
    const lined = () => modelRef.current.filter(c => typeof c.pos === 'number')
    const at = (pos) => modelRef.current.find(c => c.pos === pos)
    const byKey = (key) => modelRef.current.find(c => c.key === key)

    // The next open spot, scanning front → back, so the line always fills in order.
    const firstEmpty = () => { for (let i = 0; i < N; i++) if (!at(i)) return i; return -1 }
    // A spot may only be filled once EVERY spot in the rows before it holds an arrived
    // customer — so a customer never takes the 2nd-line path until line 1 is fully up.
    const rowsAheadReady = (idx) => {
      const before = Math.floor(idx / CUST_ROW_LEN) * CUST_ROW_LEN
      for (let i = 0; i < before; i++) { const c = at(i); if (!c || c.phase !== 'wait') return false }
      return true
    }
    // A sprite not currently anywhere in the room (in line OR walking out) — we never
    // show two of the same customer at once, so if none is free we simply don't spawn.
    const freeSprite = () => {
      const used = new Set(modelRef.current.map(c => c.sprite))
      const pool = CUSTOMER_SPRITES.filter(s => !used.has(s))
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
    }
    const maybeSpawn = () => {
      if (spawnPending) return
      const idx = firstEmpty()
      if (idx < 0 || !rowsAheadReady(idx) || !freeSprite()) return  // full / row not up / no unique sprite
      spawnPending = true
      let sec
      if (SALES_ENABLED) {
        // Arrival rate tracks REPUTATION (same demand curve the idle engine uses), so
        // a well-run shop draws crowds and a low-rep one trickles.
        const base = 60 / demandPerMin(repRef.current)         // avg seconds between arrivals
        sec = Math.max(1.6, base * (0.7 + Math.random() * 0.6))
      } else {
        sec = 3 + Math.random() * 3                          // sales off: steady trickle to watch it stack
      }
      after(sec * 1000, () => { spawnPending = false; spawn() })
    }
    const spawn = () => {
      const k = firstEmpty()
      const sprite = freeSprite()
      if (k < 0 || !rowsAheadReady(k) || !sprite) { maybeSpawn(); return }   // nothing to do / no unique sprite
      const key = ++n
      modelRef.current.push({
        key, sprite, pos: k, phase: 'enter', value: 0, reaction: 'happy', tolerance: rollTolerance(),
        anim: `custIn${k}`, dur: moveSecs(CUST_DOOR.x, QUEUE_SPOTS[k].x),
      })
      commit()
      after(modelRef.current[modelRef.current.length - 1].dur * 1000, () => arrive(key))
      maybeSpawn()                                           // keep feeding line 1 in parallel
    }
    const arrive = (key) => {
      const c = byKey(key); if (!c) return
      c.phase = 'wait'; commit()
      tryBuy()
      maybeSpawn()                                           // an arrival may unlock the next row
    }
    const tryBuy = () => {
      if (!SALES_ENABLED) return                             // sales stopped — just stack the line
      if (beggarRef.current && beggarRef.current.phase === 'beg') return  // cashier busy with the bum
      const front = at(0)
      if (front && front.phase === 'wait') {                 // serve as soon as they reach the counter
        front.phase = 'pause'; commit()
        after(900, () => resolveBuy(front.key))              // brief beat, then they transact + react
      }
    }
    const resolveBuy = (key) => {
      const c = byKey(key); if (!c || c.phase !== 'pause') return
      const res = onSellRef.current ? onSellRef.current(c.tolerance) : { value: 0, reaction: 'nostock' }
      c.value = res.value; c.reaction = res.reaction
      c.phase = res.value > 0 ? 'buy' : 'angry'   // 'angry' = refuse or empty shelf (no sale)
      commit()
      after(res.value > 0 ? 1500 : 1600, () => startLeave(key))
    }
    const startLeave = (key) => {
      const c = byKey(key); if (!c) return
      c.phase = 'leave'; c.anim = 'custOut'; c.dur = moveSecs(QUEUE_SPOTS[0].x, CUST_OUT.x); c.pos = 'gone'; commit()
      after(c.dur * 1000, () => { modelRef.current = modelRef.current.filter(x => x.key !== key); commit(); maybeSpawn() })
      lined().filter(x => x.pos > 0).forEach(x => {          // everyone behind shifts one forward
        x.pos -= 1
        x.anim = `custAdv${x.pos}`
        x.dur = moveSecs(QUEUE_SPOTS[x.pos + 1].x, QUEUE_SPOTS[x.pos].x)
        x.phase = 'enter'
        after(x.dur * 1000, () => arrive(x.key))
      })
      commit()
      maybeSpawn()                                           // refill the back
    }

    // --- THE BUM (GNOME 10): recurring gag, independent of the paying line ---
    let bumKey = 0
    const scheduleBeggar = () => {
      const [lo, hi] = BEG_EVERY
      after((lo + Math.random() * (hi - lo)) * 1000, runBeggar)
    }
    const runBeggar = () => {
      const key = ++bumKey
      beggarRef.current = { key, phase: 'in', line: null }
      commit()
      after(moveSecs(CUST_DOOR.x, BEG_SPOT.x) * 1000, () => beg(key, 0))
    }
    const beg = (key, i) => {
      const b = beggarRef.current
      if (!b || b.key !== key) return
      if (i >= BEG_DIALOG.length) {                           // told off — storm out mad
        b.phase = 'out'; b.line = null; commit()
        tryBuy()                                              // cashier's free now — serve the held line
        after(moveSecs(BEG_SPOT.x, CUST_OUT.x) * 1000, () => {
          if (beggarRef.current && beggarRef.current.key === key) { beggarRef.current = null; commit() }
          scheduleBeggar()
        })
        return
      }
      b.phase = 'beg'; b.line = BEG_DIALOG[i]; commit()       // show this dialog line
      after(BEG_DIALOG[i].ms, () => beg(key, i + 1))
    }

    maybeSpawn()                                             // first customer after a short beat
    scheduleBeggar()                                          // and the bum drops by every so often
    return () => { alive = false; timers.forEach(clearTimeout) }
  }, [])

  return (
    <>
      <CustomerKeyframes />
      {modelRef.current.map(c => <CustomerSprite key={c.key} c={c} />)}
      {beggarRef.current && <Beggar b={beggarRef.current} />}
      {beggarRef.current?.line && <DialogBubble line={beggarRef.current.line} />}
    </>
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

        {/* Tap the LEFT box to send the skater monkey on his haul route (same as
            tapping him). Only while idle. */}
        {skatePhase === 'idle' && onSkateClick && (
          <div onClick={() => { sfx.tap?.(); onSkateClick() }}
            style={{ position: 'absolute', left: `${lx0}%`, top: `${lyTop - 3}%`,
              width: `${lx1 - lx0}%`, height: '24%', zIndex: 3, cursor: 'pointer' }} />
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
// Keyframe % for the 6 waypoints. The waypoints are equally spaced down the path,
// so spacing them evenly in time (every 20%) gives CONSTANT speed all the way into
// the box — no snap/teleport at the end — which keeps the staggered buds evenly
// spaced through the whole run, including the drop into the bin.
const BUD_PCTS = [0, 20, 40, 60, 80, 100]

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
// The sloth is drawn in two layers (sloth-body + sloth-arm) so the dangling clawed
// arm can swing on its own, slicing across the plants below. The arm pivots at its
// shoulder; it starts swinging once the matching table (by index) has its first
// plant, and each sloth runs the same motion at its own phase (independent delay).
const SLOTH_PIVOT = '19.7% 53%'                  // arm shoulder (% of the sloth canvas)
const SLOTH_ARM_DELAYS = ['0s', '-0.55s', '-1.05s']

// Dust Room — the deepest back room (4th). Visual-only placeholder for now: an
// aspect-locked backdrop so it's navigable today, with a "coming soon" tag. The
// production loop (premium dust) gets wired up once the real art lands.
function DustRoom({ art }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', aspectRatio: '1600 / 900', maxWidth: '100%', maxHeight: '100%' }}>
        {/* Layer 1 — room backdrop (ROOM 4). */}
        <img src={art} alt="Dust Room" style={{ display: 'block', width: '100%', height: '100%' }} />
        {/* Barbie — centered, standing on the floor line behind the table. zIndex 0
            keeps her ABOVE the backdrop but BELOW the table (z1) and dust piles (z2),
            so the table occludes her lower body and she reads as standing behind it. */}
        <img src="/barbie.webp" alt="" aria-hidden
          style={{ position: 'absolute', left: '50%', top: '80%', transform: 'translate(-50%, -100%)',
            width: '16.5%', zIndex: 0, pointerEvents: 'none',
            filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.5))' }} />
        {/* Layer 2 — the table, kept as its own overlay so it can be moved or
            swapped independently of the backdrop. Top edge sits ~25% up the back
            wall: floor line ≈ 62.5%, wall top ≈ 21% → 25% up lands its top at 52%. */}
        <img src="/dust-table.webp" alt="" aria-hidden
          style={{ position: 'absolute', left: '50%', top: '52%', transform: 'translateX(-50%)',
            width: '94%', zIndex: 1, pointerEvents: 'none',
            filter: 'drop-shadow(0 8px 10px rgba(0,0,0,0.4))' }} />
        {/* Three INDEPENDENT dust piles resting on the tabletop — each is its own
            element with its own left/top/width so any one can be moved or resized
            without affecting the others. */}
        <img src="/dust.webp" alt="" aria-hidden
          style={{ position: 'absolute', left: '30%', top: '54%', transform: 'translate(-50%, -100%)',
            width: '17%', zIndex: 2, pointerEvents: 'none', filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.5))' }} />
        <img src="/dust.webp" alt="" aria-hidden
          style={{ position: 'absolute', left: '50%', top: '54%', transform: 'translate(-50%, -100%)',
            width: '17%', zIndex: 2, pointerEvents: 'none', filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.5))' }} />
        <img src="/dust.webp" alt="" aria-hidden
          style={{ position: 'absolute', left: '70%', top: '54%', transform: 'translate(-50%, -100%)',
            width: '17%', zIndex: 2, pointerEvents: 'none', filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.5))' }} />
        <div style={{ position: 'absolute', left: '50%', top: '38%', transform: 'translate(-50%, -50%)', zIndex: 3,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
          <i className="ti ti-sparkles" style={{ color: '#d9a8ee', fontSize: 30, filter: 'drop-shadow(0 2px 6px #000)' }} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: 1.5,
            background: 'rgba(10,8,14,0.7)', borderRadius: 999, padding: '6px 16px',
            border: '1px solid #b06ad055', textShadow: '0 1px 3px #000' }}>PREMIUM DUST — COMING SOON</span>
        </div>
      </div>
    </div>
  )
}

function GrowRoom({ planted, bank, onPlace, budCounts = {}, budResync = 0, onBudLand, tableCards = {}, cardLevels = {}, onAdd, onUproot, skatePhase = 'idle', skateStart = 0, onSkateClick }) {
  // Which table is pending an uproot confirmation (null = none). Clicking the
  // trash opens a "are you sure?" prompt instead of clearing the table outright.
  const [confirmUproot, setConfirmUproot] = useState(null)
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
        {/* A sloth worker hanging over each table, claws grazing the plant tops.
            Body + arm are separate layers so the arm can swing (slice) once that
            table (same index) is planted; each runs the same motion at its own phase. */}
        {SLOTH_CENTERS.map((cx, i) => {
          const swinging = tableStarted(i + 1, planted)
          return (
            <div key={`sloth${i}`} style={{
              position: 'absolute', left: `${cx}%`, top: `${SLOTH_TOP}%`, width: `${SLOTH_W}%`,
              transform: 'translateX(-50%)', zIndex: 3, pointerEvents: 'none',
              filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.35))',
            }}>
              <img src="/sloth-body.webp" alt="" aria-hidden style={{ display: 'block', width: '100%' }} />
              <img src="/sloth-arm.webp" alt="" aria-hidden style={{
                position: 'absolute', left: 0, top: 0, width: '100%',
                transformOrigin: SLOTH_PIVOT,
                animation: swinging ? `slothSlice 1.8s ease-in-out ${SLOTH_ARM_DELAYS[i]} infinite` : 'none',
              }} />
            </div>
          )
        })}
        {/* The skater monkey passes through the grow room during phase B. */}
        {skatePhase === 'B' && <Skater phase="B" start={skateStart} />}
        <BeltBud planted={planted} budCounts={budCounts} resyncKey={budResync} onBudLand={onBudLand} tableCards={tableCards} />
        {PLANT_SLOTS.filter(s => planted.includes(s.id)).map((s) => {
          // Each table grows the art of whatever strain is planted on it.
          const strain = PLANTS.find(p => p.id === tableCards[s.table])
          return (
            <img key={s.id} src={strain?.grow || '/plant.webp'} alt="" aria-hidden data-slot={s.id}
              style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: `${plantW(s.y)}%`,
                transform: 'translate(-50%, -100%)', pointerEvents: 'none' }} />
          )
        })}
        {/* Bins heaped full of buds. */}
        {BINS_FULL && Object.values(BINS).flatMap(([x0, x1, yTop], b) => {
          const bw = x1 - x0
          return BIN_PILE.map(([xf, dy, wf], i) => (
            <img key={`bin${b}-${i}`} src="/nug.webp" alt="" aria-hidden
              style={{ position: 'absolute', left: `${x0 + bw * xf}%`, top: `${yTop + dy}%`, width: `${(wf * bw).toFixed(2)}%`,
                transform: 'translate(-50%, -100%)', pointerEvents: 'none' }} />
          ))
        })}

        {/* Tap any of the 3 grow boxes to send the skater monkey on his haul
            route (same as tapping him in the packing room). Only while he's idle;
            sits BELOW the Add/Upgrade buttons (z4) so those still work. */}
        {skatePhase === 'idle' && onSkateClick && [1, 2, 3].map(tbl => {
          const [x0, x1, yTop] = BINS[tbl]
          return (
            <div key={`skatehot${tbl}`} onClick={() => { sfx.tap?.(); onSkateClick() }}
              style={{ position: 'absolute', left: `${x0}%`, top: `${yTop - 3}%`,
                width: `${x1 - x0}%`, height: '22%', zIndex: 3, cursor: 'pointer' }} />
          )
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
          // budCounts is the raw bud tally (drives the drop animation + haul). The
          // counter SHOWS the yielded total — buds × the card's YIELD/LV (budYield) —
          // so a +1 strain reads 1 per bud and a +7 strain reads 7 per bud. The haul
          // already multiplies by the same yield, so packing/cash stay in sync.
          const cardId = tableCards[tbl]
          const n = Math.floor(budCounts[tbl] || 0) * budYield(cardId, cardLevels[cardId] || 1)
          const strain = PLANTS.find(p => p.id === cardId)
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
                <img src={strain?.bud || '/bud.webp'} alt="" style={{ width: 13, height: 13, objectFit: 'contain' }} />
                <span key={n} style={{
                  color: GREEN, fontWeight: 900, fontSize: 13, fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1, animation: 'budTick 0.35s ease-out',
                }}>{n.toLocaleString()}</span>
              </div>
            </div>
          )
        })}

        {/* Uproot button — clear a planted table so you can replant a new strain. The
            grow card stays owned; this just frees the table (and drops un-hauled buds). */}
        {[1, 2, 3].map(tbl => {
          if (!tableStarted(tbl, planted)) return null
          const [, x1, yTop] = BINS[tbl]
          // Tables 1 & 2 sit their trash just past the bin's right edge, where the
          // bench surface still extends. The rightmost bench leans toward the
          // vanishing point, so its surface ends at the bin edge — nudging right
          // there floats the button into the wall corner. Pull it inward so it
          // lands on the table edge like the others.
          const trashX = tbl === 3 ? x1 - 1.5 : x1 + 1.5
          return (
            <button key={`up${tbl}`} onClick={() => { sfx.tap?.(); setConfirmUproot(tbl) }} title={`Uproot table ${tbl}`}
              style={{ position: 'absolute', left: `${trashX}%`, top: `${yTop}%`,
                transform: 'translate(-50%, -150%)', zIndex: 5, padding: 0,
                width: 24, height: 24, borderRadius: '50%',
                background: 'rgba(120,28,22,0.92)', border: '1px solid #e06a5a', color: '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.55)' }}>
              <i className="ti ti-trash" style={{ fontSize: 13 }} />
            </button>
          )
        })}

        {/* Uproot confirmation — a clear "are you sure?" gate so a tap can't wipe
            a planted table by accident. Yes uproots, No just closes. */}
        {confirmUproot != null && (
          <div onClick={() => setConfirmUproot(null)}
            style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#1a1510', border: `1px solid ${GOLD}66`, borderRadius: 14, padding: '20px 22px',
                maxWidth: 320, textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,0.7)' }}>
              <i className="ti ti-trash" style={{ color: '#e06a5a', fontSize: 26 }} />
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: '8px 0 4px' }}>Remove current plants?</div>
              <div style={{ color: DIM, fontSize: 12, lineHeight: 1.4, marginBottom: 16 }}>
                Are you sure you want to remove the current plants? Any un-hauled buds are lost.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setConfirmUproot(null)}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: 'pointer',
                    background: '#2a2722', color: '#fff', border: '1px solid #403c33' }}>
                  No
                </button>
                <button onClick={() => { sfx.tap?.(); const t = confirmUproot; setConfirmUproot(null); onUproot && onUproot(t) }}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: 'pointer',
                    background: 'rgba(120,28,22,0.95)', color: '#fff', border: '1px solid #e06a5a' }}>
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}
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
function BeltBud({ planted, budCounts = {}, resyncKey = 0, onBudLand, tableCards = {} }) {
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
        <img key={s.id} src={PLANTS.find(p => p.id === tableCards[s.table])?.bud || '/bud.webp'}
          alt="" aria-hidden data-bud={s.id}
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
      /* Sloth arm slicing across the plants — pivots at the shoulder. */
      @keyframes slothSlice { 0%,100% { transform: rotate(-9deg); } 50% { transform: rotate(16deg); } }
      /* Subtle glow hinting the MENU board is tappable to set prices. */
      @keyframes menuGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(201,168,76,0); } 50% { box-shadow: 0 0 12px 2px rgba(201,168,76,0.5); } }
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
