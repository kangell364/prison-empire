// Shared fight-log list + small helpers, used by both the bell (NotificationsModal)
// and the Chat screen's "Fight Log" tab. The data lives in fightLogStore (local).
import React from 'react'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const GREEN = '#2ecc71'
const DIM  = '#666'

export function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function Empty({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 24px', color: DIM }}>
      <i className={`ti ${icon}`} style={{ fontSize: 34, color: '#2a2a3a' }} />
      <div style={{ color: '#aaa', fontSize: 14, fontWeight: 600, marginTop: 10 }}>{title}</div>
      <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}

export function FightLogs({ log, onRevenge }) {
  if (!log.logs.length) {
    return <Empty icon="ti-swords" title="No fights yet" sub="KO another player and the blow-by-blow shows up here." />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {log.logs.map(e => {
        const pending = e.kind === 'ko_by' && !!log.revenge[e.oppId]
        const meta = e.kind === 'ko_by'
          ? { c: RED,   icon: 'ti-skull',  text: <><b style={{ color: '#fff' }}>{e.oppName}</b> KO'd you</> }
          : e.kind === 'revenge'
            ? { c: GOLD,  icon: 'ti-swords', text: <>Revenge! You KO'd <b style={{ color: '#fff' }}>{e.oppName}</b> <span style={{ color: GOLD }}>+50 XP</span></> }
            : e.kind === 'bounty'
              ? { c: GOLD,  icon: 'ti-coin',   text: <><b style={{ color: '#fff' }}>{e.collector}</b> collected the bounty on your head — took <span style={{ color: GOLD }}>{e.amount.toLocaleString()}</span> Hustle</> }
              : e.kind === 'boss'
                ? { c: GOLD,  icon: 'ti-trophy', text: <>You took down <b style={{ color: '#fff' }}>{e.oppName}</b></> }
                : { c: GREEN, icon: 'ti-trophy', text: <>You KO'd <b style={{ color: '#fff' }}>{e.oppName}</b></> }
        return (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#13131f', border: `0.5px solid ${meta.c}33`, borderRadius: 12, padding: '10px 12px' }}>
            <i className={`ti ${meta.icon}`} style={{ color: meta.c, fontSize: 18, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#ccc', fontSize: 12.5, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{meta.text}</div>
              <div style={{ color: DIM, fontSize: 10, marginTop: 2 }}>{e.oppLevel != null ? `Lv ${e.oppLevel} · ` : ''}{timeAgo(e.ts)}</div>
            </div>
            {pending && (
              <button onClick={onRevenge} style={{ flexShrink: 0, background: RED, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 0.5, cursor: 'pointer' }}>
                <i className="ti ti-sword" style={{ fontSize: 12, marginRight: 3 }} />REVENGE
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
