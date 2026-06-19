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
import { addHustle, ensureAuth } from './profileStore'

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

// Property income pays out on the SAME global hourly clock as block income —
// aligned to the top of every UTC hour, so its countdown is identical to the
// block payout (and the "pays every hour" copy is finally literal). At each hour
// boundary we bank one hour of income per bucket crossed (capped at 24h of
// backlog for time spent away), so the Property screen's timer has a real payout
// moment instead of income trickling in continuously.
const PAYOUT_PERIOD_MS  = 3_600_000               // 1 hour (matches blocksStore)
const PAYOUT_BUCKET_KEY = 'pe_property_payout_bucket_v1'

// ms remaining until the next top-of-hour payout — same instant as blocks.
export function msToNextPropertyPayout() { return PAYOUT_PERIOD_MS - (Date.now() % PAYOUT_PERIOD_MS) }

// Income that will bank at the next boundary: grows 0 → propertyPerHr over the
// hour so the "PAYING OUT +N" readout climbs like the block one.
export function propertyPending() {
  const elapsed = 1 - msToNextPropertyPayout() / PAYOUT_PERIOD_MS
  return Math.round(propertyPerHr() * elapsed)
}

export function runDuePropertyPayout(now = Date.now()) {
  let last = null
  try { const raw = localStorage.getItem(PAYOUT_BUCKET_KEY); if (raw != null) last = parseInt(raw, 10) } catch {}
  const bucket = Math.floor(now / PAYOUT_PERIOD_MS)
  if (last == null || Number.isNaN(last)) {           // first run — start the clock, no payout
    try { localStorage.setItem(PAYOUT_BUCKET_KEY, String(bucket)) } catch {}
    return 0
  }
  if (bucket <= last) return 0
  const hours = Math.min(bucket - last, 24)            // cap offline backlog at 24h
  const paid = Math.round(propertyPerHr() * hours)
  if (paid > 0) addHustle(paid)
  try { localStorage.setItem(PAYOUT_BUCKET_KEY, String(bucket)) } catch {}
  return paid
}

// Add `qty` units of a property to your holdings (the caller charges Hustle).
export function buyProperty(id, qty) {
  const n = Math.max(0, Math.floor(qty || 0))
  if (!n) return
  runDuePropertyPayout()
  commitOwned({ ...state.owned, [id]: (state.owned[id] || 0) + n })
}

// Live-ticking countdown to the next property payout — re-renders each second.
export function usePropertyPayoutCountdown() {
  const [ms, setMs] = useState(msToNextPropertyPayout())
  useEffect(() => {
    const iv = setInterval(() => setMs(msToNextPropertyPayout()), 1000)
    return () => clearInterval(iv)
  }, [])
  return ms
}

// Drive the idle income: catch up on mount (covers time spent away) then tick
// once a second while the app is open. Mirrors useBlockPayoutTicker.
//
// CRITICAL: the first catch-up must wait for ensureAuth() to resolve. Otherwise
// it races the Supabase profile load — the offline Hustle gets added locally,
// but `userId` is still null so it never pushes to the server, and then
// loadProfileForSession() overwrites `state.hustle` back to the pre-accrual
// server value (profileStore: "adopt server state as authoritative"). The
// payout bucket has already advanced, so the away income is lost for good.
// Waiting for auth means the catch-up runs on the hydrated balance and pushes.
export function usePropertyPayoutTicker() {
  useEffect(() => {
    let iv = null
    let cancelled = false
    ensureAuth().then(() => {
      if (cancelled) return
      runDuePropertyPayout()                       // catch up AFTER the profile is hydrated
      iv = setInterval(() => runDuePropertyPayout(), 1000)
    })
    return () => { cancelled = true; if (iv) clearInterval(iv) }
  }, [])
}
