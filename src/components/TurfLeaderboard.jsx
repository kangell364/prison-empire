// TurfLeaderboard + ActivityFeed — the live competitive layer over shared turf.
//
// Both are derived from blocksStore's in-memory shared state (my overrides +
// streamed rivals), so they update in realtime with no extra backend. Names come
// from playersStore (the public_profiles view).

import React, { useEffect, useState } from 'react'
import { turfStandings, subscribeBlocks, subscribeActivity } from '../state/blocksStore'
import { getUserId } from '../state/profileStore'
import { usePlayers } from '../state/playersStore'

const GOLD = '#c9a84c'
const RIVAL_COLORS = ['#e74c3c', '#4a9eff', '#9b59b6', '#2ecc71', '#e67e22', '#16a085', '#d35400', '#8e44ad']
function rivalColor(id) {
  let h = 0; const s = String(id || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return RIVAL_COLORS[h % RIVAL_COLORS.length]
}
function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// ---- Leaderboard ----------------------------------------------------
export function TurfLeaderboard() {
  const [, bump] = useState(0)
  const { name, refresh } = usePlayers()
  useEffect(() => subscribeBlocks(() => bump(v => v + 1)), [])

  const me = getUserId() || 'you'
  const rows = Object.entries(turfStandings())
    .map(([id, count]) => ({ id, count, isYou: id === me || id === 'you' }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  // Pull names for any unknown owners.
  useEffect(() => { refresh() }, [rows.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows.length) {
    return (
      <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>
        No turf claimed yet — be the first to take a block in Harris.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r, i) => (
        <div key={r.id} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
          background: r.isYou ? `${GOLD}14` : '#13131f', border: `0.5px solid ${r.isYou ? `${GOLD}55` : '#22222e'}`,
        }}>
          <div style={{ width: 22, textAlign: 'center', color: i === 0 ? GOLD : '#777', fontSize: 13, fontWeight: 800 }}>{i + 1}</div>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: r.isYou ? GOLD : rivalColor(r.id), flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, color: r.isYou ? GOLD : '#fff', fontSize: 13.5, fontWeight: r.isYou ? 800 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.isYou ? 'You' : name(r.id)}
          </div>
          <div style={{ color: '#bbb', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {r.count}<span style={{ color: '#666', fontSize: 10, marginLeft: 3 }}>blocks</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- Activity feed --------------------------------------------------
export function ActivityFeed({ limit = 12 }) {
  const [items, setItems] = useState([])
  const { name } = usePlayers()
  useEffect(() => subscribeActivity(ev => setItems(prev => [ev, ...prev].slice(0, limit))), [limit])

  if (!items.length) {
    return (
      <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>
        Quiet for now — turf takeovers will show up here live.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(ev => {
        const who = ev.mine ? 'You' : name(ev.actorId)
        const danger = ev.tookFromMe
        return (
          <div key={ev.id} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 9,
            background: danger ? '#1f0d0d' : '#13131f', border: `0.5px solid ${danger ? '#e74c3c44' : '#22222e'}`,
          }}>
            <i className={`ti ${danger ? 'ti-flame' : ev.mine ? 'ti-flag' : 'ti-user-bolt'}`}
               style={{ color: danger ? '#e74c3c' : ev.mine ? GOLD : '#4a9eff', fontSize: 15, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, color: '#ddd', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {danger
                ? <><b style={{ color: '#e74c3c' }}>{who}</b> poached YOUR turf!</>
                : <><b style={{ color: ev.mine ? GOLD : '#fff' }}>{who}</b> took a block</>}
            </div>
            <div style={{ color: '#666', fontSize: 10, flexShrink: 0 }}>{timeAgo(ev.at)}</div>
          </div>
        )
      })}
    </div>
  )
}
