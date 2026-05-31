// Fight log + revenge store — feeds the notification bell's "FIGHT LOGS" tab.
//
// Records PvP KO events: who KO'd you (a revenge target), your KOs, and revenge
// KOs. Getting KO'd by a rival flags them for revenge; KO them back and you
// collect a revenge bounty (granted by the caller). Persisted to localStorage.

import { useEffect, useState } from 'react'

const KEY = 'pe_fightlog_v1'
const MAX_LOGS = 60

// Declared before readInitial() runs at module load — readInitial spreads it,
// and a `const` is in the temporal dead zone until its own line executes, so
// state init below MUST come after this. (Reordering these = blank-screen crash.)
const EMPTY_RECORD = { wins: 0, losses: 0, kos: 0, defeats: 0, jobs: 0 }

let seq = 0
let state = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        logs: p.logs || [], revenge: p.revenge || {}, lastReadTs: p.lastReadTs || 0,
        record: { ...EMPTY_RECORD, ...(p.record || {}) },
      }
    }
  } catch {}
  return { logs: [], revenge: {}, lastReadTs: 0, record: { ...EMPTY_RECORD } }
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

function newId() { return `${Date.now()}-${seq++}` }

// ---- reads ---------------------------------------------------------

export function getFightLog()      { return state }
export function isRevengeTarget(id){ return !!state.revenge[id] }
export function unreadCount()      { return state.logs.filter(l => l.ts > state.lastReadTs).length }

// Career record — the live source for the player's Street Rep. Driven by real
// outcomes: PvP wins/KOs, PvP losses/defeats, and jobs (bosses cleared + hit-list
// bounties fulfilled). Starts at zero for a new player.
export function getRecord()        { return state.record }
export function useRecord()        { const s = useFightLog(); return s.record }

export function useFightLog() {
  const [s, setS] = useState(state)
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS) }, [])
  return s
}
export function useUnreadCount() { const s = useFightLog(); return s.logs.filter(l => l.ts > s.lastReadTs).length }

// ---- writes --------------------------------------------------------

function pushLog(entry) {
  const logs = [{ id: newId(), ts: Date.now(), ...entry }, ...state.logs].slice(0, MAX_LOGS)
  return logs
}

// You got KO'd by a rival → flag them for revenge. Only logs a fresh entry if
// they weren't already a pending revenge target (so re-losing doesn't spam).
export function recordKoBy(opp) {
  const already = !!state.revenge[opp.id]
  const revenge = { ...state.revenge, [opp.id]: { name: opp.name, level: opp.level, ts: Date.now() } }
  const logs = already ? state.logs : pushLog({ kind: 'ko_by', oppId: opp.id, oppName: opp.name, oppLevel: opp.level })
  // A PvP loss: one fight lost + one defeat (you got KO'd) on the career record.
  const record = { ...state.record, losses: state.record.losses + 1, defeats: state.record.defeats + 1 }
  commit({ ...state, logs, revenge, record })
}

// You KO'd a rival. If they were a revenge target, it's an avenged KO (caller
// grants the bounty). Returns { avenged }.
export function recordKo(opp) {
  const avenged = !!state.revenge[opp.id]
  const revenge = { ...state.revenge }
  if (avenged) delete revenge[opp.id]
  // A PvP win: one fight won + one KO landed on the career record.
  const record = { ...state.record, wins: state.record.wins + 1, kos: state.record.kos + 1 }
  commit({
    ...state,
    logs: pushLog({ kind: avenged ? 'revenge' : 'ko', oppId: opp.id, oppName: opp.name, oppLevel: opp.level }),
    revenge,
    record,
  })
  return { avenged }
}

// Credit completed "jobs" toward the career record / Street Rep — a boss cleared
// or a hit-list bounty fulfilled. Defaults to 1.
export function recordJob(n = 1) {
  const add = Math.max(0, Math.floor(n || 0))
  if (!add) return
  commit({ ...state, record: { ...state.record, jobs: state.record.jobs + add } })
}

// Mark every log seen (clears the bell badge).
export function markRead() {
  commit({ ...state, lastReadTs: Date.now() })
}

export function clearFightLog() {
  commit({ logs: [], revenge: {}, lastReadTs: Date.now(), record: { ...EMPTY_RECORD } })
}
