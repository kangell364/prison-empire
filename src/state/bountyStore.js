// Bounty-on-you store — the live "price on your head".
//
// The loop: act notorious (KO rivals, clear bosses) → your bounty climbs →
// when you finally get knocked out, a rival CLAIMS the price and it resets to a
// level-scaled floor. Shown live on the Hit List's pinned "YOU" row, and the
// claim posts a fight-log notification (wired from vitalsStore.knockOut).
//
// localStorage-only for now; migrates with the rest of the player state later.

import { useEffect, useState } from 'react'
import { getProgress } from './progressionStore'

const KEY = 'pe_bounty_v1'
const BASE = 25_000   // never cheaper than this

function level() { return Math.max(1, getProgress().level || 1) }
// The standing price floor — scales with level so a big name always has a
// meaningful bounty, even right after one is collected.
function floor() { return Math.max(BASE, level() * 5_000) }

let state = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const p = JSON.parse(raw); if (typeof p.bounty === 'number') return { bounty: p.bounty } }
  } catch {}
  return { bounty: floor() }
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

export function getBounty() { return state.bounty }

export function useBounty() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s.bounty
}

// Notoriety raises the price on your head.
export function addBounty(amount) {
  const add = Math.max(0, Math.round(amount || 0))
  if (!add) return
  commit({ bounty: state.bounty + add })
}
export function bumpForKo()   { addBounty(5_000 + level() * 2_000) }   // KO a rival
export function bumpForBoss() { addBounty(20_000 + level() * 5_000) }  // clear a boss

// A rival collects the price on your head when you go down — the bounty is
// claimed and CLEARED (you come off the hit list until you build a new one by
// being notorious again). Returns the amount claimed.
export function collectBounty() {
  const collected = state.bounty
  commit({ bounty: 0 })
  return collected
}
