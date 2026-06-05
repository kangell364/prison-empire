// roomBankStore — mirrors the Trap House ROOM screen's "BANK" balance so other
// views (e.g. the home-screen trap-house card) can show the same number.
//
// Note: this is the bank shown in the first room of TrapHouse.jsx (its own
// local state, persisted in the `pe_traphouse_room_v3` blob — NOT the separate
// `state.bank` in trapHouseStore.js). TrapHouse owns the value + persistence;
// this store just mirrors it for cross-screen reactivity, and re-reads the saved
// blob on mount so the number is right even if TrapHouse hasn't run this session.

import { useEffect, useState } from 'react'

const SAVE_KEY = 'pe_traphouse_room_v3'
const DEFAULT_BANK = 200000              // matches TrapHouse.jsx's default
const listeners = new Set()

function readSavedBank() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) { const s = JSON.parse(raw); if (typeof s?.bank === 'number') return s.bank }
  } catch {}
  return DEFAULT_BANK
}

let bank = readSavedBank()

export function getRoomBank() { return bank }

// Called by TrapHouse whenever its bank changes, to keep the mirror live.
export function setRoomBank(v) {
  if (typeof v !== 'number' || v === bank) return
  bank = v
  listeners.forEach(fn => fn(bank))
}

export function useRoomBank() {
  const [v, setV] = useState(bank)
  useEffect(() => {
    listeners.add(setV)
    const fresh = readSavedBank()        // pick up changes saved while we were on another screen
    if (fresh !== bank) bank = fresh
    setV(bank)
    return () => listeners.delete(setV)
  }, [])
  return v
}
