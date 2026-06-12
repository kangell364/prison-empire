// Fight log + revenge store — feeds the notification bell's "FIGHT LOGS" tab.
//
// Records PvP KO events: who KO'd you (a revenge target), your KOs, and revenge
// KOs. Getting KO'd by a rival flags them for revenge; KO them back and you
// collect a revenge bounty (granted by the caller). Persisted to localStorage.

import { useEffect, useState } from 'react'

const KEY = 'pe_fightlog_v1'
const MAX_LOGS = 200

// Declared before readInitial() runs at module load — readInitial spreads it,
// and a `const` is in the temporal dead zone until its own line executes, so
// state init below MUST come after this. (Reordering these = blank-screen crash.)
const EMPTY_RECORD = { wins: 0, losses: 0, kos: 0, defeats: 0, jobs: 0 }
// Daily PvP kills — count + the local calendar day it belongs to, so it rolls
// over to 0 on a new day. Bumped in recordKo (every PvP KO goes through there).
const EMPTY_DAILY = { day: '', count: 0 }

// Local-calendar day key (not UTC) so "daily" lines up with the player's clock.
function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
        dailyKills: { ...EMPTY_DAILY, ...(p.dailyKills || {}) },
      }
    }
  } catch {}
  return { logs: [], revenge: {}, lastReadTs: 0, record: { ...EMPTY_RECORD }, dailyKills: { ...EMPTY_DAILY } }
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

// Today's PvP kill count — rolls over to 0 once the calendar day changes, even
// if the stored value is from yesterday (roll-over is applied on read too).
export function getDailyKills()    { const dk = state.dailyKills; return dk && dk.day === todayKey() ? dk.count : 0 }
export function useDailyKills()    { const s = useFightLog(); return s.dailyKills && s.dailyKills.day === todayKey() ? s.dailyKills.count : 0 }

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
  // Bump today's kill tally, resetting first if the stored day isn't today.
  const today = todayKey()
  const prevDaily = state.dailyKills && state.dailyKills.day === today ? state.dailyKills.count : 0
  const dailyKills = { day: today, count: prevDaily + 1 }
  commit({
    ...state,
    logs: pushLog({ kind: avenged ? 'revenge' : 'ko', oppId: opp.id, oppName: opp.name, oppLevel: opp.level }),
    revenge,
    record,
    dailyKills,
  })
  return { avenged }
}

// You took down a campaign boss (PvE). Logs a blow-by-blow entry so the fight
// history isn't PvP-only, and counts the clear as a job toward Street Rep.
export function recordBossKo(boss) {
  const record = { ...state.record, jobs: state.record.jobs + 1 }
  commit({
    ...state,
    logs: pushLog({ kind: 'boss', oppId: boss.id, oppName: boss.name, oppLevel: boss.level }),
    record,
  })
}

// Credit completed "jobs" toward the career record / Street Rep — a boss cleared
// or a hit-list bounty fulfilled. Defaults to 1.
export function recordJob(n = 1) {
  const add = Math.max(0, Math.floor(n || 0))
  if (!add) return
  commit({ ...state, record: { ...state.record, jobs: state.record.jobs + add } })
}

// A rival collected the price on your head (fired when you get knocked out and
// your bounty resets). Posts a notification to the bell.
export function recordBountyCollected(amount, collector) {
  const amt = Math.max(0, Math.round(amount || 0))
  if (!amt) return
  commit({ ...state, logs: pushLog({ kind: 'bounty', amount: amt, collector: collector || 'A rival' }) })
}

// Mark every log seen (clears the bell badge).
export function markRead() {
  commit({ ...state, lastReadTs: Date.now() })
}

export function clearFightLog() {
  commit({ logs: [], revenge: {}, lastReadTs: Date.now(), record: { ...EMPTY_RECORD }, dailyKills: { ...EMPTY_DAILY } })
}
