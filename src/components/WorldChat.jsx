// WorldChat — the global "World Chat" screen (its own tab in the bottom nav).
// Live message stream + composer. Sender identity (name + look) is resolved from
// the shared players directory (public_profiles).

import React, { useState, useEffect, useRef } from 'react'
import { useChat, sendMessage } from '../state/chatStore'
import { usePlayers } from '../state/playersStore'
import { useAuth, resolveLook } from '../state/profileStore'
import { Avatar } from '../components/Avatar'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const DIM  = '#666'

export function ChatScreen() {
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
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 8px', flexShrink: 0 }}>
        <i className="ti ti-world" style={{ color: GOLD, fontSize: 18 }} />
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 800 }}>World Chat</div>
        <div style={{ color: DIM, fontSize: 11, marginLeft: 'auto' }}>everyone, everywhere</div>
      </div>

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
