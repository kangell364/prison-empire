// Chat — the comms hub reached from the bottom-nav "Chat" button. A tabbed
// screen: World (live global chat), Gang, Player, and the Fight Log. World is
// wired to the shared chat_messages stream; the Fight Log reads the local
// fightLogStore. Gang/Player are placeholders until their backend lands.

import React, { useState, useEffect, useRef } from 'react'
import { useChat, sendMessage } from '../state/chatStore'
import { usePlayers } from '../state/playersStore'
import { useAuth, resolveLook } from '../state/profileStore'
import { useFightLog, markRead } from '../state/fightLogStore'
import { Avatar } from '../components/Avatar'
import { FightLogs, Empty } from './FightLogs'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const DIM  = '#666'

const CHAT_TABS = [
  { id: 'world',  label: 'World',     icon: 'ti-world' },
  { id: 'gang',   label: 'Gang',      icon: 'ti-users-group' },
  { id: 'player', label: 'Player',    icon: 'ti-message' },
  { id: 'fights', label: 'Fight Log', icon: 'ti-swords' },
]

// Tabbed container. `onNavigate` lets the Fight Log's REVENGE button jump to the
// battle screen.
export function ChatScreen({ onNavigate }) {
  const [tab, setTab] = useState('world')
  const fightLog = useFightLog()

  // Opening the Fight Log tab clears its unread badge.
  useEffect(() => { if (tab === 'fights') markRead() }, [tab])

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

      {/* Tab bar — one button per channel */}
      <div style={{ display: 'flex', gap: 5, padding: '12px 12px 10px', flexShrink: 0, borderBottom: '0.5px solid #1e1e2a' }}>
        {CHAT_TABS.map(t => (
          <button key={t.id} onClick={() => { sfx.tap?.(); setTab(t.id) }} style={{
            flex: 1, minWidth: 0, background: tab === t.id ? `${GOLD}18` : '#13131f',
            border: `0.5px solid ${tab === t.id ? `${GOLD}55` : '#2a2a3a'}`,
            borderRadius: 10, padding: '9px 2px', color: tab === t.id ? GOLD : '#888',
            fontSize: 10, fontWeight: 700, letterSpacing: 0.2, whiteSpace: 'nowrap', cursor: 'pointer',
          }}>
            <i className={`ti ${t.icon}`} style={{ fontSize: 12, marginRight: 3 }} />{t.label}
          </button>
        ))}
      </div>

      {tab === 'world'  && <WorldChatTab />}
      {tab === 'fights' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          <FightLogs log={fightLog} onRevenge={() => onNavigate && onNavigate('battle')} />
        </div>
      )}
      {tab === 'gang' && (
        <Empty icon="ti-users-group" title="Gang Chat"
          sub="Talk strategy with your crew — lands when the gang chat backend ships." />
      )}
      {tab === 'player' && (
        <Empty icon="ti-message" title="Player Chat"
          sub="Direct-message another player — lands when the DM backend ships." />
      )}
    </div>
  )
}

// The live World Chat — composer on top, newest-first feed below.
function WorldChatTab() {
  const msgs = useChat()
  const { players } = usePlayers()
  const auth = useAuth()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  // Feed runs newest-first under the input bar, so snap to the TOP when a new
  // message arrives (your just-sent message shows right under the composer).
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = 0
  }, [msgs])

  const feed = msgs.slice().reverse()   // newest first

  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    setDraft('')
    const r = await sendMessage(text)
    if (!r.ok) setDraft(text)             // restore on failure
    else sfx.tap?.()
    setBusy(false)
  }
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

      {/* Composer — at the TOP */}
      <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px', borderBottom: '0.5px solid #1e1e2a', flexShrink: 0 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} maxLength={280}
          placeholder="Message the world…" style={{
            flex: 1, background: '#0c0c14', border: '1px solid #2a2a3a', borderRadius: 11,
            padding: '11px 13px', color: '#fff', fontSize: 14, outline: 'none' }} />
        <button onClick={send} disabled={busy || !draft.trim()} aria-label="Send" style={{
          width: 44, borderRadius: 11, border: 'none', cursor: draft.trim() ? 'pointer' : 'default',
          background: draft.trim() ? GOLD : '#1c1c2a', color: draft.trim() ? '#1a1206' : '#555',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-send" style={{ fontSize: 18 }} />
        </button>
      </div>

      {/* Feed — BELOW the bar, newest first */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {feed.length === 0 ? (
          <div style={{ color: DIM, fontSize: 12.5, textAlign: 'center', margin: 'auto', lineHeight: 1.5 }}>
            No messages yet.<br />Say something to the whole world.
          </div>
        ) : feed.map(m => {
          const mine = m.user_id === auth.userId
          const prof = players[m.user_id] || {}
          const look = resolveLook(prof.player_look_id)
          const name = prof.display_name || 'Player'
          return (
            <div key={m.id} style={{ display: 'flex', gap: 8, flexDirection: mine ? 'row-reverse' : 'row' }}>
              <Avatar src={look.avatar} emoji={look.emoji} size={30} radius={8} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ maxWidth: '76%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ color: mine ? GOLD : '#9aa', fontSize: 10, fontWeight: 700, marginBottom: 2, padding: '0 2px' }}>
                  {mine ? 'You' : name}
                </div>
                <div style={{
                  background: mine ? GOLD : '#1c1c2a', color: mine ? '#1a1206' : '#eee',
                  fontSize: 13, lineHeight: 1.4, padding: '7px 11px', borderRadius: 12,
                  wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                }}>{m.body}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
