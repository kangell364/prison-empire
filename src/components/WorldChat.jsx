// WorldChat — global chat. A floating button (bottom-right) opens a panel with
// the live message stream + an input. Mounted once in App.js so it's reachable
// from every screen. Sender identity (name + look) is resolved from the shared
// players directory (public_profiles).

import React, { useState, useEffect, useRef } from 'react'
import { useChat, sendMessage } from '../state/chatStore'
import { usePlayers } from '../state/playersStore'
import { useAuth, resolveLook } from '../state/profileStore'
import { Avatar } from '../components/Avatar'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const DIM  = '#666'

export function WorldChat() {
  const [open, setOpen] = useState(false)
  return (
    <>
      {!open && (
        <button onClick={() => { sfx.tap?.(); setOpen(true) }} aria-label="World chat" style={{
          position: 'fixed', right: 14, bottom: 'calc(86px + env(safe-area-inset-bottom))', zIndex: 540,
          width: 50, height: 50, borderRadius: 25, border: `1px solid ${GOLD}66`,
          background: 'linear-gradient(135deg, #1d1810, #13131f)', color: GOLD,
          boxShadow: '0 6px 18px rgba(0,0,0,0.55)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className="ti ti-message-2" style={{ fontSize: 23 }} />
        </button>
      )}
      {open && <ChatPanel onClose={() => setOpen(false)} />}
    </>
  )
}

function ChatPanel({ onClose }) {
  const msgs = useChat()
  const { players } = usePlayers()
  const auth = useAuth()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  // Auto-scroll to the newest message on open + whenever a message arrives.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 560, background: 'rgba(5,5,8,0.6)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 440, height: 'min(70vh, 560px)', background: '#10101a',
        borderTopLeftRadius: 18, borderTopRightRadius: 18, border: `1px solid ${GOLD}33`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '0.5px solid #22222e' }}>
          <i className="ti ti-world" style={{ color: GOLD, fontSize: 18 }} />
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 800, flex: 1 }}>World Chat</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.length === 0 ? (
            <div style={{ color: DIM, fontSize: 12.5, textAlign: 'center', margin: 'auto', lineHeight: 1.5 }}>
              No messages yet.<br />Say something to the whole world.
            </div>
          ) : msgs.map(m => {
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

        {/* Composer */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: '0.5px solid #22222e' }}>
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
      </div>
    </div>
  )
}
