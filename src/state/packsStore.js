// Packs store — the player's stash of UNOPENED Commissary Packs plus the
// free-pack timer. One free pack is granted every 24h; when the timer elapses
// the pack is auto-deposited into the stash (no manual claim). Opening a pack
// (see CommissaryPack) decrements the stash. localStorage-only for now — the
// cards a pack yields go through cardsStore, which already syncs to Supabase.
//
// State shape: { unopened: number, lastGrant: ms-timestamp }

import { useEffect, useState } from 'react'

const STORAGE_KEY   = 'pe_packs_v1'
export const FREE_PERIOD_MS = 24 * 60 * 60 * 1000   // one free pack per 24h
export const MAX_STORED      = 5                     // stash cap for auto-granted packs

let state = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        unopened: Math.max(0, p.unopened | 0),
        lastGrant: typeof p.lastGrant === 'number' ? p.lastGrant : Date.now(),
      }
    }
  } catch {}
  // First run: drop the first free pack in immediately, start the 24h clock.
  return { unopened: 1, lastGrant: Date.now() }
}

function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

// Deposit any free packs whose 24h timers have elapsed since the last grant.
// Caps the stash at MAX_STORED; while full, the timer holds (resets to now) so a
// fresh 24h begins only once you open one and drop below the cap.
export function accrueNow() {
  const now = Date.now()
  if (state.unopened >= MAX_STORED) {
    if (now - state.lastGrant >= FREE_PERIOD_MS) commit({ ...state, lastGrant: now })
    return
  }
  const elapsed = now - state.lastGrant
  if (elapsed < FREE_PERIOD_MS) return
  const periods = Math.floor(elapsed / FREE_PERIOD_MS)
  const grant = Math.min(periods, MAX_STORED - state.unopened)
  const unopened = state.unopened + grant
  // Advance the clock by the periods consumed; if now full, hold at `now`.
  const lastGrant = unopened >= MAX_STORED ? now : state.lastGrant + periods * FREE_PERIOD_MS
  commit({ unopened, lastGrant })
}

// ms until the next free pack drops (0 when one is due / being granted).
export function msUntilNextFree() {
  if (state.unopened >= MAX_STORED) return FREE_PERIOD_MS    // stash full — timer held
  return Math.max(0, state.lastGrant + FREE_PERIOD_MS - Date.now())
}

// Consume one unopened pack (called when a pack is torn open). Returns true if
// one was available. Dropping below the cap from full restarts the timer.
export function openOnePack() {
  if (state.unopened <= 0) return false
  const wasFull = state.unopened >= MAX_STORED
  commit({ unopened: state.unopened - 1, lastGrant: wasFull ? Date.now() : state.lastGrant })
  return true
}

export function getPacks() { return state }

export function usePacks() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}
