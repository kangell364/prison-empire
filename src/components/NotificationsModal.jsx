import React, { useState, useEffect } from 'react'
import { useFightLog, markRead } from '../state/fightLogStore'
import { FightLogs, Empty } from './FightLogs'

const GOLD = '#c9a84c'

const TABS = [
  { id: 'world',  label: 'WORLD CHAT',  icon: 'ti-world' },
  { id: 'gang',   label: 'GANG CHAT',   icon: 'ti-users-group' },
  { id: 'player', label: 'PLAYER CHAT', icon: 'ti-message' },
  { id: 'fights', label: 'FIGHT LOGS',  icon: 'ti-swords' },
]

export function NotificationsModal({ onClose, onNavigate }) {
  const [tab, setTab] = useState('fights')
  const log = useFightLog()

  // Opening clears the unread badge.
  useEffect(() => { markRead() }, [])

  const goRevenge = () => { if (onNavigate) onNavigate('battle'); onClose() }

  return (
    <div className="app-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,10,0.6)', zIndex: 300, display: 'flex', flexDirection: 'column' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        marginBottom: 'auto', background: '#0d0d15', borderBottom: `1px solid ${GOLD}33`,
        borderRadius: '0 0 18px 18px', maxHeight: '78%', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '10px auto 8px' }} />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 5, padding: '4px 12px 12px', borderBottom: '0.5px solid #1e1e2a' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, minWidth: 0, background: tab === t.id ? `${GOLD}18` : '#13131f',
              border: `0.5px solid ${tab === t.id ? `${GOLD}55` : '#2a2a3a'}`,
              borderRadius: 10, padding: '9px 2px', color: tab === t.id ? GOLD : '#888',
              fontSize: 9, fontWeight: 700, letterSpacing: 0.2, whiteSpace: 'nowrap', cursor: 'pointer',
            }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 11, marginRight: 3 }} />{t.label}
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

function ChatPlaceholder({ kind }) {
  const meta = kind === 'world'
    ? { icon: 'ti-world', title: 'World Chat', sub: 'Coming with multiplayer — chat the whole yard, right here.' }
    : kind === 'gang'
      ? { icon: 'ti-users-group', title: 'Gang Chat', sub: 'Coming with multiplayer — talk strategy with your crew, right here.' }
      : { icon: 'ti-message', title: 'Player Chat', sub: 'Coming with multiplayer — message another player, right here.' }
  return <Empty icon={meta.icon} title={meta.title} sub={meta.sub} />
}
