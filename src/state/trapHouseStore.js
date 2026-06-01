// Trap House store — the gang's grow-and-sell operation (Phase 1: solo loop).
//
// Plant a card you own on a plot. It grows over a rarity-based timer, then you
// harvest it into your STASH (unsold product). Sell the stash for Hustle, which
// is banked and safe. Uncollected stash is what becomes raidable in a later phase.
//
// Plant stats derive from the card's rarity × its level — no per-card authoring,
// and the existing 20-stack merge (which raises a card's level) now also raises
// its grow yield. Persisted to localStorage.

import { useEffect, useState } from 'react'
import { CARDS_COLLECTION } from '../data/gameData'
import { addHustle } from './profileStore'

const KEY = 'pe_traphouse_v1'

// ---- tuning knobs ---------------------------------------------------
const START_PLOTS   = 3
export const PLOT_MAX = 9
const SELL_PRICE     = 5          // Hustle per stash unit
const PLOT_BASE_COST = 5000       // Hustle for the 4th plot, ×growth each after
const PLOT_GROWTH    = 1.8
export const YIELD_PER_LVL = 0.10 // +10% yield per upgrade level
export const SPEED_PER_LVL = 0.08 // −8% grow time per upgrade level
const YIELD_MAX = 10
const SPEED_MAX = 6
const UP_BASE = { yield: 3000, speed: 4000 }
const UP_GROWTH = 1.8

// Per-rarity plant stats: base yield (units/harvest) and grow time (seconds).
export const STRAIN = {
  common:    { yield: 10,  grow: 60 },
  uncommon:  { yield: 18,  grow: 90 },
  rare:      { yield: 32,  grow: 150 },
  epic:      { yield: 60,  grow: 300 },
  legendary: { yield: 110, grow: 600 },
}

// ---- state ----------------------------------------------------------
// { plots: [ null | { cardId, cardLevel, plantedAt } ], stash, yieldLvl, speedLvl }
let state = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        plots: Array.isArray(p.plots) ? p.plots : Array(START_PLOTS).fill(null),
        stash: p.stash || 0,
        yieldLvl: p.yieldLvl || 0,
        speedLvl: p.speedLvl || 0,
        // Automated interior model:
        tables: Array.isArray(p.tables) ? p.tables : Array(TABLE_START).fill(null),
        bank: p.bank || 0,
      }
    }
  } catch {}
  return { plots: Array(START_PLOTS).fill(null), stash: 0, yieldLvl: 0, speedLvl: 0, tables: Array(TABLE_START).fill(null), bank: 0 }
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

// ---- derived helpers ------------------------------------------------
export const SELL_PRICE_PER_UNIT = SELL_PRICE

function cardOf(cardId) { return CARDS_COLLECTION.find(c => c.id === cardId) }
function strainOf(card) { return STRAIN[card?.rarity] || STRAIN.common }

// Grow time (ms) for a planted card, after the speed upgrade.
export function growMs(plot) {
  const card = cardOf(plot.cardId)
  const secs = strainOf(card).grow * (1 - SPEED_PER_LVL * state.speedLvl)
  return Math.max(5, secs) * 1000
}

// Yield (stash units) a planted card produces per harvest, after upgrades + level.
export function yieldOf(plot) {
  const card = cardOf(plot.cardId)
  const base = strainOf(card).yield * (plot.cardLevel || 1)
  return Math.round(base * (1 + YIELD_PER_LVL * state.yieldLvl))
}

export function isReady(plot, now = Date.now()) {
  return !!plot && now >= plot.plantedAt + growMs(plot)
}
export function readyAt(plot) { return plot.plantedAt + growMs(plot) }

export function plotCost() {
  const extra = state.plots.length - START_PLOTS   // plots bought beyond the free ones
  return Math.round(PLOT_BASE_COST * Math.pow(PLOT_GROWTH, Math.max(0, extra)))
}
export function upgradeCost(kind) {
  const lvl = kind === 'yield' ? state.yieldLvl : state.speedLvl
  return Math.round(UP_BASE[kind] * Math.pow(UP_GROWTH, lvl))
}
export function upgradeMax(kind) { return kind === 'yield' ? YIELD_MAX : SPEED_MAX }

export function sellValue(stash = state.stash) { return Math.round(stash * SELL_PRICE) }

// ---- reads ----------------------------------------------------------
export function getTrapHouse() { return state }
export function useTrapHouse() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}

// ---- writes ---------------------------------------------------------
export function plant(plotIndex, card) {
  if (plotIndex < 0 || plotIndex >= state.plots.length) return false
  const plots = state.plots.slice()
  plots[plotIndex] = { cardId: card.cardId ?? card.id, cardLevel: card.level || card.cardLevel || 1, plantedAt: Date.now() }
  commit({ ...state, plots })
  return true
}

// Harvest a ready plot → add its yield to the stash, then auto-restart the cycle.
export function harvest(plotIndex) {
  const plot = state.plots[plotIndex]
  if (!isReady(plot)) return 0
  const got = yieldOf(plot)
  const plots = state.plots.slice()
  plots[plotIndex] = { ...plot, plantedAt: Date.now() }   // replant same card, new cycle
  commit({ ...state, plots, stash: state.stash + got })
  return got
}

// Harvest every ready plot in one pass. Returns total units harvested.
export function harvestAll() {
  const now = Date.now()
  let got = 0
  const plots = state.plots.map(plot => {
    if (isReady(plot, now)) { got += yieldOf(plot); return { ...plot, plantedAt: now } }
    return plot
  })
  if (got > 0) commit({ ...state, plots, stash: state.stash + got })
  return got
}

export function uproot(plotIndex) {
  const plots = state.plots.slice()
  plots[plotIndex] = null
  commit({ ...state, plots })
}

// Sell the whole stash for Hustle (banked + safe).
export function sellStash() {
  const value = sellValue()
  if (value <= 0) return 0
  addHustle(value)
  commit({ ...state, stash: 0 })
  return value
}

// Buy another plot (caller passes a spend fn that charges Hustle).
export function buyPlot(spend) {
  if (state.plots.length >= PLOT_MAX) return false
  const cost = plotCost()
  if (!spend(cost)) return false
  commit({ ...state, plots: [...state.plots, null] })
  return true
}

export function buyUpgrade(kind, spend) {
  const lvl = kind === 'yield' ? state.yieldLvl : state.speedLvl
  if (lvl >= upgradeMax(kind)) return false
  const cost = upgradeCost(kind)
  if (!spend(cost)) return false
  commit({ ...state, [kind === 'yield' ? 'yieldLvl' : 'speedLvl']: lvl + 1 })
  return true
}

// =====================================================================
// AUTOMATED INTERIOR MODEL (the landscape "inside the trap house" view)
//
// Tables grow product into a container; one worker hauls full containers down
// the line and the sale credits the trap house BANK. The bank funds upgrades
// (buy tables, +plants). Surplus later moves to a stash house (raidable).
// =====================================================================
const TABLE_START = 1                 // one free table
export const TABLE_MAX = 5
export const PLANTS_PER_LEVEL = 4     // each +plants upgrade adds 4 plant slots
const CONTAINER_PER_PLANT = 6         // container holds this many units per plant
const BANK_SELL_PRICE = 5             // bank cash per unit the worker hauls out
const TABLE_COST_BASE = 400, TABLE_COST_GROWTH = 2.2
const PLANTS_COST_BASE = 250, PLANTS_COST_GROWTH = 1.8

function tCard(t) { return t && CARDS_COLLECTION.find(c => c.id === t.cardId) }
function tStrain(t) { return STRAIN[tCard(t)?.rarity] || STRAIN.common }
export function tablePlants(t) { return (t?.plantLevel || 1) * PLANTS_PER_LEVEL }
export function tableCapacity(t) { return tablePlants(t) * CONTAINER_PER_PLANT }
// units/sec a planted table produces (one strain.yield × plantLevel per grow cycle).
function tableRate(t) { const s = tStrain(t); return (s.yield * (t.plantLevel || 1)) / s.grow }

// Pour elapsed-time production into every table's container (capped).
function accrue(now) {
  let changed = false
  const tables = state.tables.map(t => {
    if (!t) return t
    const cap = tableCapacity(t)
    const dt = Math.max(0, (now - (t.lastTick || now)) / 1000)
    const container = Math.min(cap, (t.container || 0) + dt * tableRate(t))
    if (container !== t.container) changed = true
    return { ...t, container, lastTick: now }
  })
  return { tables, changed }
}

// ---- reads ----
export function getBank() { return state.bank || 0 }
export function tableFillPct(t) { return t ? Math.min(100, ((t.container || 0) / tableCapacity(t)) * 100) : 0 }
export function tableCost() {
  const bought = state.tables.length - TABLE_START
  return Math.round(TABLE_COST_BASE * Math.pow(TABLE_COST_GROWTH, Math.max(0, bought)))
}
export function plantsCost(t) { return Math.round(PLANTS_COST_BASE * Math.pow(PLANTS_COST_GROWTH, (t.plantLevel || 1) - 1)) }

// ---- ticks + worker ----
// Call ~1/s while the interior is open to advance the live container fills.
export function tickProduction() {
  const now = Date.now()
  const { tables, changed } = accrue(now)
  if (changed) commit({ ...state, tables })
}

// The worker empties the single fullest container → bank. Returns
// { units, gain, tableIndex } so the UI can animate the haul, or 0 if nothing ready.
export function workerHaul() {
  const now = Date.now()
  const { tables } = accrue(now)
  let bi = -1, best = 0
  tables.forEach((t, i) => { if (t && (t.container || 0) > best) { best = t.container; bi = i } })
  if (bi < 0 || best < 1) { commit({ ...state, tables }); return 0 }
  const units = Math.floor(tables[bi].container)
  tables[bi] = { ...tables[bi], container: tables[bi].container - units, lastTick: now }
  const gain = units * BANK_SELL_PRICE
  commit({ ...state, tables, bank: (state.bank || 0) + gain })
  return { units, gain, tableIndex: bi }
}

// ---- actions ----
export function plantTable(i, card) {
  if (i < 0 || i >= state.tables.length) return false
  const tables = state.tables.slice()
  tables[i] = { cardId: card.cardId ?? card.id, cardLevel: card.level || card.cardLevel || 1, plantLevel: 1, container: 0, lastTick: Date.now() }
  commit({ ...state, tables })
  return true
}
export function uprootTable(i) {
  const tables = state.tables.slice()
  tables[i] = null
  commit({ ...state, tables })
}
export function buyTable() {
  if (state.tables.length >= TABLE_MAX) return false
  const cost = tableCost()
  if ((state.bank || 0) < cost) return false
  commit({ ...state, tables: [...state.tables, null], bank: state.bank - cost })
  return true
}
export function upgradePlants(i) {
  const t = state.tables[i]
  if (!t) return false
  const cost = plantsCost(t)
  if ((state.bank || 0) < cost) return false
  const tables = state.tables.slice()
  tables[i] = { ...t, plantLevel: (t.plantLevel || 1) + 1 }
  commit({ ...state, tables, bank: state.bank - cost })
  return true
}
