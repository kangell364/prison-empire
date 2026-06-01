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
import { getHealthMax, getStaminaMax } from './statsStore'
import { collectBounty } from './bountyStore'
import { recordBountyCollected } from './fightLogStore'
import { getHustle, spendHustle } from './profileStore'

const KEY = 'pe_vitals_v1'

// KO recovery: a knocked-out player is frozen at 0 health (no regen) until a
// 24-hour timer elapses, then auto-revives to full. `?test=1` shortens it to
// 60s so the flow can be exercised quickly. The Nurse view also lets the player
// short-circuit the wait (watch ads / pay Hustle → reviveNow()).
const IS_TEST = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('test') === '1'
const KO_DURATION_MS = IS_TEST ? 60 * 1000 : 24 * 60 * 60 * 1000

// Pool maxes are now TRAIT-DRIVEN (Toughness → Health, Hustle → Stamina) and
// can change as the player allocates points, so they're read live from
// statsStore rather than baked as constants. Components get the current values
// from useVitals().healthMax / .staminaMax.
function staminaMax() { return getStaminaMax() }
function healthMax()  { return getHealthMax() }

// Regen rates. Stamina is a flat +1 every 5 min regardless of pool size (a
// bigger pool just takes longer to top off). Health keeps "full heal in ~1h"
// semantics, so its ms-per-point scales with the (dynamic) max.
const STAMINA_MS_PER_POINT = 5 * 60 * 1000
function healthMsPerPoint() { return Math.max(1, Math.round((60 * 60 * 1000) / Math.max(1, healthMax()))) }

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
    stamina:   saved?.stamina   ?? staminaMax(),
    staminaAt: saved?.staminaAt ?? now,
    health:    saved?.health    ?? healthMax(),
    healthAt:  saved?.healthAt  ?? now,
    koUntil:   saved?.koUntil   ?? null,   // timestamp the KO clears, or null
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
  const st = settlePool(s.stamina, s.staminaAt, staminaMax(), STAMINA_MS_PER_POINT, now)
  let koUntil = s.koUntil ?? null
  let health = s.health, healthAt = s.healthAt
  if (koUntil != null) {
    if (now >= koUntil) {
      // Recovery timer elapsed → back to full health, KO cleared. (This also
      // fires on app load after being away the full 24h.)
      koUntil = null; health = healthMax(); healthAt = now
    } else {
      // Knocked out: health is frozen at 0 — no regen while you're down.
      health = 0; healthAt = now
    }
  } else {
    const hp = settlePool(s.health, s.healthAt, healthMax(), healthMsPerPoint(), now)
    health = hp.value; healthAt = hp.at
  }
  return { stamina: st.value, staminaAt: st.at, health, healthAt, koUntil }
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
  if (next.stamina !== state.stamina || next.health !== state.health || next.koUntil !== state.koUntil) {
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
  commit({ ...s, stamina: Math.min(staminaMax(), s.stamina + amount) })
}

// ---- KO / Nurse ----------------------------------------------------

export const KO_HUSTLE_PER_LEVEL = 5000        // Nurse "pay to heal" = 5,000 × level
export const STAMINA_HUSTLE_PER_LEVEL = 2000   // Nurse "refuel stamina" baseline × level

// Top stamina back to full (the Nurse's watch-ads / pay-Hustle refuel options).
export function refillStamina() {
  const s = settleAll(state)
  commit({ ...s, stamina: staminaMax(), staminaAt: Date.now() })
}

// Restore health UP TO `frac` of max (never lowers it). Used for a boss win so
// you don't walk away on empty after grinding it down. No-op while KO'd.
export function restoreHealthTo(frac) {
  const s = settleAll(state)
  if (s.koUntil != null) return
  const target = Math.round(healthMax() * frac)
  if (s.health >= target) return
  commit({ ...s, health: target, healthAt: Date.now() })
}

// Knock the player out: health to 0, start the 24h recovery clock. No-op if
// already KO'd (so a second loss doesn't refresh/extend the timer). Going down
// also lets a rival CLAIM the price on your head — the bounty resets and a
// notification posts. `collector` names who cashed in (opponent / raiding gang).
export function knockOut(collector) {
  const s = settleAll(state)
  if (s.koUntil != null) return
  commit({ ...s, health: 0, healthAt: Date.now(), koUntil: Date.now() + KO_DURATION_MS })
  // A rival collects the price on your head AND banks it — taken out of your
  // Hustle, capped at whatever you're holding (they can't rob what you don't
  // have). The bounty pot resets either way.
  const collected = collectBounty()
  const taken = Math.min(collected, getHustle())
  if (taken > 0) { spendHustle(taken); recordBountyCollected(taken, collector) }
}

// Come back to full health now (the Nurse's watch-ads / pay-Hustle options, and
// the auto-revive path). Clears the KO and restarts regen from full.
export function reviveNow() {
  const s = settleAll(state)
  commit({ ...s, health: healthMax(), healthAt: Date.now(), koUntil: null })
}

export function isKO()        { return settleAll(state).koUntil != null }
export function getKoUntil()  { return settleAll(state).koUntil }
// ms left on the recovery timer (0 when not KO'd / already elapsed).
export function koMsRemaining() {
  const until = settleAll(state).koUntil
  return until != null ? Math.max(0, until - Date.now()) : 0
}

// Nurse-navigation event bus. Any component (e.g. the fight modal's "DEFEATED —
// SEE NURSE" button) calls openNurse(); App subscribes and switches to the
// Nurse screen. Avoids threading a nav callback through every screen.
const nurseListeners = new Set()
export function openNurse() { nurseListeners.forEach(fn => fn()) }
export function onOpenNurse(fn) { nurseListeners.add(fn); return () => nurseListeners.delete(fn) }

// ms until the next +1 regen tick for a pool (0 when full). For countdowns.
export function msToNextStamina() {
  const s = settleAll(state)
  if (s.stamina >= staminaMax()) return 0
  return STAMINA_MS_PER_POINT - ((Date.now() - s.staminaAt) % STAMINA_MS_PER_POINT)
}
export function msToNextHealth() {
  const s = settleAll(state)
  if (s.health >= healthMax()) return 0
  const per = healthMsPerPoint()
  return per - ((Date.now() - s.healthAt) % per)
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
  // Maxes are computed fresh each render so a trait allocation reflects
  // immediately (the screen that allocates re-renders, recomputing these).
  return {
    ...s,
    healthMax: healthMax(),
    staminaMax: staminaMax(),
    ko: s.koUntil != null,
    koMsRemaining: s.koUntil != null ? Math.max(0, s.koUntil - Date.now()) : 0,
  }
}
