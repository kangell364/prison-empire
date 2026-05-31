// Hit List store — community bounties on rival players, paid in Hustle.
//
// Put a player on the list with a Hustle bounty; anyone can stack more Hustle on
// an existing target. Fulfilling a bounty ("Move on Target") is wired later —
// for now this just tracks targets + their pooled bounty. Persisted locally.

import { useEffect, useState } from 'react'
import { spendHustle } from './profileStore'
import { generateOpponent } from '../data/pvpLadder'

const KEY = 'pe_hitlist_v2'

// Starter bounties so the list isn't empty — real AI players (from pvpLadder, so
// the current card look), 4 at Level 1 plus a couple of higher-level marks.
const SEED = [
  { level: 1, index: 0, bounty: 18_000 },
  { level: 1, index: 1, bounty: 120_000 },
  { level: 1, index: 2, bounty: 45_000 },
  { level: 1, index: 3, bounty: 72_000 },
  { level: 4, index: 0, bounty: 260_000 },
  { level: 8, index: 1, bounty: 540_000 },
]

function seedTargets() {
  const targets = {}
  for (const s of SEED) {
    const o = generateOpponent(s.level, s.index)
    targets[o.id] = {
      id: o.id, name: o.name, level: o.level, emoji: o.emoji, avatar: o.avatar,
      facility: o.facility, state: o.state, bounty: s.bounty, addedTs: Date.now(),
    }
  }
  return targets
}

let state = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const p = JSON.parse(raw); return { targets: p.targets || {} } }
  } catch {}
  return { targets: seedTargets() }
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

export function getHitList()        { return state }
export function isOnHitList(oppId)  { return !!state.targets[oppId] }

export function useHitList() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}

// Place (or top up) a bounty. Spends `amount` Hustle — returns false and changes
// nothing if you can't afford it or the amount is invalid.
export function placeBounty(opp, amount) {
  amount = Math.max(0, Math.floor(amount || 0))
  if (amount <= 0) return false
  if (!spendHustle(amount)) return false
  const cur = state.targets[opp.id]
  const target = cur
    ? { ...cur, bounty: cur.bounty + amount }
    : { id: opp.id, name: opp.name, level: opp.level, emoji: opp.emoji, avatar: opp.avatar, facility: opp.facility, state: opp.state, bounty: amount, addedTs: Date.now() }
  commit({ targets: { ...state.targets, [opp.id]: target } })
  return true
}

// Remove a target (used when a bounty is fulfilled — wired later).
export function removeTarget(oppId) {
  if (!state.targets[oppId]) return
  const targets = { ...state.targets }
  delete targets[oppId]
  commit({ targets })
}
