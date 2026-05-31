// Fight log + revenge store — feeds the notification bell's "FIGHT LOGS" tab.
//
// Records PvP KO events: who KO'd you (a revenge target), your KOs, and revenge
// KOs. Getting KO'd by a rival flags them for revenge; KO them back and you
// collect a revenge bounty (granted by the caller). Persisted to localStorage.

import { useEffect, useState } from 'react'

const KEY = 'pe_fightlog_v1'
const MAX_LOGS = 60

let seq = 0
let state = readInitial()
const listeners = new Set()

function readInitial() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { logs: p.logs || [], revenge: p.revenge || {}, lastReadTs: p.lastReadTs || 0 }
    }
  } catch {}
  return { logs: [], revenge: {}, lastReadTs: 0 }
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {} }
function commit(next) { state = next; persist(); listeners.forEach(fn => fn(state)) }

function newId() { return `${Date.now()}-${seq++}` }

// ---- reads ---------------------------------------------------------

export function getFightLog()      { return state }
export function isRevengeTarget(id){ return !!state.revenge[id] }
export function unreadCount()      { return state.logs.filter(l => l.ts > state.lastReadTs).length }

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
  commit({ ...state, logs, revenge })
}

// You KO'd a rival. If they were a revenge target, it's an avenged KO (caller
// grants the bounty). Returns { avenged }.
export function recordKo(opp) {
  const avenged = !!state.revenge[opp.id]
  const revenge = { ...state.revenge }
  if (avenged) delete revenge[opp.id]
  commit({
    ...state,
    logs: pushLog({ kind: avenged ? 'revenge' : 'ko', oppId: opp.id, oppName: opp.name, oppLevel: opp.level }),
    revenge,
  })
  return { avenged }
}

// Mark every log seen (clears the bell badge).
export function markRead() {
  commit({ ...state, lastReadTs: Date.now() })
}

export function clearFightLog() {
  commit({ logs: [], revenge: {}, lastReadTs: Date.now() })
}
