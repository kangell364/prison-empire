// Player resource store — subscribable Hustle balance with localStorage
// persistence. Seeds from RESOURCES.hustle.value on first load; after that,
// the local value is authoritative until Supabase replaces this whole layer.

import { useEffect, useState } from 'react'
import { RESOURCES } from '../data/gameData'

const KEY = 'pe_hustle_v1'

let value = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw != null) {
      const n = parseInt(raw, 10)
      if (Number.isFinite(n)) return n
    }
  } catch {}
  return RESOURCES.hustle.value
}

function persist(v) {
  try { localStorage.setItem(KEY, String(v)) } catch {}
}

function notify() { listeners.forEach(fn => fn(value)) }

export function getHustle() { return value }

export function setHustle(v) {
  value = Math.max(0, Math.floor(v))
  persist(value)
  notify()
}

export function addHustle(delta) { setHustle(value + delta) }

// Returns true on success, false if the user can't afford it. Callers should
// check the return value before applying the corresponding game state change.
export function spendHustle(cost) {
  if (cost > value) return false
  setHustle(value - cost)
  return true
}

export function useHustle() {
  const [v, setV] = useState(value)
  useEffect(() => {
    listeners.add(setV)
    return () => listeners.delete(setV)
  }, [])
  return v
}
