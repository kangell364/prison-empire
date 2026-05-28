// Vitals store — health + stamina with time-based regeneration.
//
// Both pools refill on a timer. Persisted to localStorage with a per-pool
// "last settled" timestamp, so regen accrues even while the app is closed
// (open the app after an hour and your stamina has refilled accordingly).
//
// A single shared stamina pool feeds Profile, the PvP fight screen, and the
// boss battle screen — previously each had its own local useState(78), which
// is why stamina behaved inconsistently and the Profile bar read "78/30".
//
// localStorage-only for now; migrates to Supabase with the rest of the
// player vitals in a later phase.

import { useEffect, useState } from 'react'

const KEY = 'pe_vitals_v1'

export const STAMINA_MAX = 100
export const HEALTH_MAX   = 1875   // toughness(75) × 25; trait-driven once Supabase lands

// Regen rates as milliseconds-per-point.
const STAMINA_MS_PER_POINT = 5 * 60 * 1000                       // +1 every 5 min (full in ~8.3h)
const HEALTH_MS_PER_POINT  = Math.round((60 * 60 * 1000) / HEALTH_MAX)  // full heal in ~1h

let state = readInitial()
const listeners = new Set()
let ticker = null

// ---- persistence + regen settle ------------------------------------

function readInitial() {
  const now = Date.now()
  let saved = null
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) saved = JSON.parse(raw)
  } catch {}
  const seed = {
    stamina:   saved?.stamina   ?? STAMINA_MAX,
    staminaAt: saved?.staminaAt ?? now,
    health:    saved?.health    ?? HEALTH_MAX,
    healthAt:  saved?.healthAt  ?? now,
  }
  return settleAll(seed, now)
}

// Advance a pool's value by however many regen points have accrued since its
// last-settled timestamp, carrying the leftover time forward so no fractional
// progress is lost. Clamps at max and parks the timestamp at `now` when full.
function settlePool(value, at, max, msPerPoint, now) {
  if (value >= max) return { value: Math.min(value, max), at: now }
  const elapsed = now - at
  if (elapsed <= 0) return { value, at }
  const gained = Math.floor(elapsed / msPerPoint)
  if (gained <= 0) return { value, at }
  const next = Math.min(max, value + gained)
  const nextAt = next >= max ? now : at + gained * msPerPoint
  return { value: next, at: nextAt }
}

function settleAll(s, now = Date.now()) {
  const st = settlePool(s.stamina, s.staminaAt, STAMINA_MAX, STAMINA_MS_PER_POINT, now)
  const hp = settlePool(s.health,  s.healthAt,  HEALTH_MAX,  HEALTH_MS_PER_POINT,  now)
  return { stamina: st.value, staminaAt: st.at, health: hp.value, healthAt: hp.at }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
}

function commit(next) {
  state = next
  persist()
  listeners.forEach(fn => fn(state))
}

// Settle regen against the wall clock and notify if anything changed.
function tick() {
  const next = settleAll(state)
  if (next.stamina !== state.stamina || next.health !== state.health) {
    commit(next)
  }
}

// ---- public API ----------------------------------------------------

export function getStamina() { return settleAll(state).stamina }
export function getHealth()  { return settleAll(state).health }

// Spend stamina. Returns false (and changes nothing) if you can't afford it.
export function spendStamina(cost) {
  const s = settleAll(state)
  if (cost > s.stamina) { commit(s); return false }
  // Spending below max (re)starts the regen clock from now.
  commit({ ...s, stamina: s.stamina - cost, staminaAt: Date.now() })
  return true
}

export function spendHealth(amount) {
  const s = settleAll(state)
  const next = Math.max(0, s.health - amount)
  commit({ ...s, health: next, healthAt: Date.now() })
}

export function addStamina(amount) {
  const s = settleAll(state)
  commit({ ...s, stamina: Math.min(STAMINA_MAX, s.stamina + amount) })
}

// ms until the next +1 regen tick for a pool (0 when full). For countdowns.
export function msToNextStamina() {
  const s = settleAll(state)
  if (s.stamina >= STAMINA_MAX) return 0
  return STAMINA_MS_PER_POINT - ((Date.now() - s.staminaAt) % STAMINA_MS_PER_POINT)
}
export function msToNextHealth() {
  const s = settleAll(state)
  if (s.health >= HEALTH_MAX) return 0
  return HEALTH_MS_PER_POINT - ((Date.now() - s.healthAt) % HEALTH_MS_PER_POINT)
}

// Subscribe-with-ticker hook. While any component is mounted, a 1s interval
// settles regen so bars + countdowns advance live.
export function useVitals() {
  const [s, setS] = useState(state)
  useEffect(() => {
    listeners.add(setS)
    if (!ticker) ticker = setInterval(tick, 1000)
    return () => {
      listeners.delete(setS)
      if (listeners.size === 0 && ticker) { clearInterval(ticker); ticker = null }
    }
  }, [])
  return s
}
