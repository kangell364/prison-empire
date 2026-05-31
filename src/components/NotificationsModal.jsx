import React, { useState, useEffect } from 'react'
import { useFightLog, markRead } from '../state/fightLogStore'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const GREEN = '#2ecc71'
const DIM  = '#666'

const TABS = [
  { id: 'world',  label: 'WORLD CHAT',  icon: 'ti-world' },
  { id: 'player', label: 'PLAYER CHAT', icon: 'ti-message' },
  { id: 'fights', label: 'FIGHT LOGS',  icon: 'ti-swords' },
]

function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function NotificationsModal({ onClose, onNavigate }) {
  const [tab, setTab] = useState('fights')
  const log = useFightLog()

  // Opening clears the unread badge.
  useEffect(() => { markRead() }, [])

  const goRevenge = () => { if (onNavigate) onNavigate('battle'); onClose() }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,10,0.6)', zIndex: 300, display: 'flex', flexDirection: 'column' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        marginTop: 'auto', background: '#0d0d15', borderTop: `1px solid ${GOLD}33`,
        borderRadius: '18px 18px 0 0', maxHeight: '78%', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '10px auto 8px' }} />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '4px 14px 12px', borderBottom: '0.5px solid #1e1e2a' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, background: tab === t.id ? `${GOLD}18` : '#13131f',
              border: `0.5px solid ${tab === t.id ? `${GOLD}55` : '#2a2a3a'}`,
              borderRadius: 10, padding: '9px 0', color: tab === t.id ? GOLD : '#888',
              fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer',
            }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 12, marginRight: 4 }} />{t.label}
            </button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', padding: 14, flex: 1 }}>
          {tab === 'fights' ? <FightLogs log={log} onRevenge={goRevenge} /> : <ChatPlaceholder kind={tab} />}
        </div>
      </div>
    </div>
  )
}

function FightLogs({ log, onRevenge }) {
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
            : { c: GREEN, icon: 'ti-trophy', text: <>You KO'd <b style={{ color: '#fff' }}>{e.oppName}</b></> }
        return (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#13131f', border: `0.5px solid ${meta.c}33`, borderRadius: 12, padding: '10px 12px' }}>
            <i className={`ti ${meta.icon}`} style={{ color: meta.c, fontSize: 18, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#ccc', fontSize: 12.5, lineHeight: 1.3 }}>{meta.text}</div>
              <div style={{ color: DIM, fontSize: 10, marginTop: 2 }}>Lv {e.oppLevel} · {timeAgo(e.ts)}</div>
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

function ChatPlaceholder({ kind }) {
  return (
    <Empty
      icon={kind === 'world' ? 'ti-world' : 'ti-message'}
      title={kind === 'world' ? 'World Chat' : 'Player Chat'}
      sub="Coming with multiplayer — chat the whole yard or message a crew, right here."
    />
  )
}

function Empty({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 24px', color: DIM }}>
      <i className={`ti ${icon}`} style={{ fontSize: 34, color: '#2a2a3a' }} />
      <div style={{ color: '#aaa', fontSize: 14, fontWeight: 600, marginTop: 10 }}>{title}</div>
      <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}
