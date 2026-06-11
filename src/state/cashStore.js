// cashStore — CASH is the street/empire currency. It is CLIENT-ONLY (never
// pushed to Supabase), so it lives here in its own localStorage blob rather than
// in profileStore (whose every commit hits the server `profiles` row).
//
// Faucets:  Trap House jar sales (the big one) + turf income (blocks + houses).
// Sinks:    the territory/war layer — found a gang, reinforce houses/territory,
//           and anything else on the empire side.
//
// Hustle (profileStore) stays the PROGRESSION currency (crew/cards/skills/pulls).
// Cash is the EMPIRE currency. The two never touch.

import { useEffect, useState } from 'react'

const CASH_KEY        = 'pe_cash_v1'
const LEGACY_ROOM_KEY = 'pe_traphouse_room_v3'   // old home of the Trap House "bank"
const DEFAULT_CASH    = 200000                    // matches the old Trap House starting bank
const listeners = new Set()

// Seed once: prefer our own key, else migrate the Trap House's old `bank` value
// (so existing testers keep their balance), else the default.
function readSeed() {
  try {
    const raw = localStorage.getItem(CASH_KEY)
    if (raw != null) { const n = parseInt(raw, 10); if (Number.isFinite(n)) return n }
  } catch {}
  try {
    const blob = localStorage.getItem(LEGACY_ROOM_KEY)
    if (blob) { const s = JSON.parse(blob); if (typeof s?.bank === 'number') return s.bank }
  } catch {}
  return DEFAULT_CASH
}

let cash = readSeed()

function persist() { try { localStorage.setItem(CASH_KEY, String(cash)) } catch {} }
function notify()  { listeners.forEach(fn => fn(cash)) }

export function getCash() { return cash }

export function setCash(v) {
  v = Math.max(0, Math.floor(v))
  if (v === cash) return
  cash = v
  persist(); notify()
}

export function addCash(delta) { setCash(cash + delta) }

// Synchronous affordability check against the local balance. Returns false if
// the player can't afford it; the caller must NOT apply the effect on false.
export function spendCash(cost) {
  if (cost > cash) return false
  setCash(cash - cost)
  return true
}

export function useCash() {
  const [v, setV] = useState(cash)
  useEffect(() => {
    listeners.add(setV)
    setV(cash)            // re-sync in case it changed before this mount
    return () => listeners.delete(setV)
  }, [])
  return v
}
