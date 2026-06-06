// Property ownership store — how many of each property you own, plus the idle
// Hustle income they earn.
//
// Persisted to localStorage so your holdings survive leaving the Property screen
// (and app refreshes). Each property earns `perHr` Hustle/hr; that income is
// banked into your Hustle balance continuously while the app runs AND caught up
// for the time you were away (offline accrual on mount). Migrates to a Supabase
// own_property table in a later phase.

import { useEffect, useState } from 'react'
import { PROPERTIES } from '../data/gameData'
import { addHustle } from './profileStore'

const KEY = 'pe_properties_v1'

// Every new player starts owning 1 Soup Cup — a guaranteed first property so
// that even if they fumble their Hustle, they still hold something earning in
// the Property screen. Only seeded for brand-new saves (no stored holdings yet).
const STARTER_OWNED = { soup_cup: 1 }

// id → Hustle/hr, for fast rate lookups during accrual.
const PER_HR = Object.fromEntries(PROPERTIES.map(p => [p.id, p.perHr]))

// state: { owned: { [id]: count }, lastAccrued: ms, frac: carried sub-Hustle }
let state = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { owned: p.owned || {}, lastAccrued: p.lastAccrued || Date.now(), frac: p.frac || 0 }
    }
  } catch {}
  return { owned: { ...STARTER_OWNED }, lastAccrued: Date.now(), frac: 0 }
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }

// Notify React subscribers — only used when `owned` actually changes (a buy), so
// the per-second accrual tick doesn't re-render every consumer needlessly. The
// Hustle balance UI updates through addHustle's own subscribers.
function commitOwned(owned) { state = { ...state, owned }; persist(); listeners.forEach(fn => fn(state)) }

export function getOwnedProperties() { return state.owned }
export function ownedCount(id) { return state.owned[id] || 0 }

// Total Hustle/hr across everything owned. Drives both the Property tracker and
// the accrual loop, so the displayed rate and the banked income always match.
export function propertyPerHr() {
  return Object.entries(state.owned).reduce((sum, [id, n]) => sum + (PER_HR[id] || 0) * n, 0)
}

export function useOwnedProperties() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s.owned
}

// Bank the Hustle earned since the last settle. Whole Hustle is credited; the
// fractional remainder carries forward so even a 5/hr property eventually pays
// out. Always advances `lastAccrued` so a later rate change can't double-count.
export function runDuePropertyPayout(now = Date.now()) {
  const dtHr = Math.max(0, (now - state.lastAccrued) / 3_600_000)
  const earned = propertyPerHr() * dtHr + state.frac
  const whole = Math.floor(earned)
  if (whole > 0) addHustle(whole)
  state = { ...state, lastAccrued: now, frac: earned - whole }
  persist()
}

// Add `qty` units of a property to your holdings (the caller charges Hustle).
// Settle accrual at the OLD rate first so the new property only earns from now.
export function buyProperty(id, qty) {
  const n = Math.max(0, Math.floor(qty || 0))
  if (!n) return
  runDuePropertyPayout()
  commitOwned({ ...state.owned, [id]: (state.owned[id] || 0) + n })
}

// Drive the idle income: catch up on mount (covers time spent away) then tick
// once a second while the app is open. Mirrors useBlockPayoutTicker.
export function usePropertyPayoutTicker() {
  useEffect(() => {
    runDuePropertyPayout()
    const iv = setInterval(() => runDuePropertyPayout(), 1000)
    return () => clearInterval(iv)
  }, [])
}
