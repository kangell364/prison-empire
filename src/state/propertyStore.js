// Property ownership store — how many of each property you own.
//
// Persisted to localStorage so your holdings survive leaving the Property screen
// (and app refreshes). Previously this lived in the Property screen's local
// useState, so navigating away and back wiped every purchase. Migrates to a
// Supabase own_property table in a later phase.

import { useEffect, useState } from 'react'

const KEY = 'pe_properties_v1'

let state = readInitial()   // { owned: { [propertyId]: count } }
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const p = JSON.parse(raw); return { owned: p.owned || {} } }
  } catch {}
  return { owned: {} }
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

export function getOwnedProperties() { return state.owned }
export function ownedCount(id) { return state.owned[id] || 0 }

export function useOwnedProperties() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s.owned
}

// Add `qty` units of a property to your holdings (the caller charges Hustle).
export function buyProperty(id, qty) {
  const n = Math.max(0, Math.floor(qty || 0))
  if (!n) return
  commit({ owned: { ...state.owned, [id]: (state.owned[id] || 0) + n } })
}
