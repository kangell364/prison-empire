// SetPasswordModal — shown when a player returns from the password-reset email
// link (a PASSWORD_RECOVERY event). Lets them set a new password and finish the
// reset. Mounted globally in App.js so it appears regardless of screen.

import React, { useState } from 'react'
import { updatePassword, PASSWORD_MIN } from '../state/profileStore'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'

export function SetPasswordModal({ onClose }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (busy) return
    setError('')
    if (password.length < PASSWORD_MIN) { setError(`Password must be at least ${PASSWORD_MIN} characters.`); return }
    if (password !== confirm) { setError('Passwords don’t match.'); return }
    setBusy(true)
    try {
      const r = await updatePassword(password)
      if (!r.ok) { setError(r.error); return }
      sfx.tap?.()
      setDone(true)
    } finally {
      setBusy(false)
    }
  }
  const onKey = (e) => { if (e.key === 'Enter') submit() }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 650, background: 'rgba(5,5,8,.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#14131c',
        border: `1px solid ${GOLD}44`, borderRadius: 18, padding: 22, boxShadow: '0 16px 50px rgba(0,0,0,.6)' }}>

        <div style={{ color: GOLD, fontSize: 19, fontWeight: 900, letterSpacing: 0.5, marginBottom: 4 }}>
          {done ? 'Password Updated' : 'Set a New Password'}
        </div>

        {done ? (
          <>
            <div style={{ color: '#888', fontSize: 12.5, lineHeight: 1.5, marginTop: 6, marginBottom: 16 }}>
              Your password has been changed and you’re signed in. You can use it next time you log in.
            </div>
            <button onClick={onClose} style={primaryBtn}>Done</button>
          </>
        ) : (
          <>
            <div style={{ color: '#888', fontSize: 12.5, lineHeight: 1.5, marginTop: 6, marginBottom: 16 }}>
              Choose a new password for your account.
            </div>

            <label style={lbl}>New Password</label>
            <input type="password" autoComplete="new-password" value={password}
              onChange={e => setPassword(e.target.value)} onKeyDown={onKey}
              placeholder={`At least ${PASSWORD_MIN} characters`} style={inp} />

            <label style={lbl}>Confirm Password</label>
            <input type="password" autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(e.target.value)} onKeyDown={onKey}
              placeholder="Re-enter password" style={inp} />

            {error && <div style={{ color: '#e74c3c', fontSize: 12.5, marginTop: 10 }}>{error}</div>}

            <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Please wait…' : 'Update Password'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const lbl = { display: 'block', color: '#aaa', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, margin: '12px 0 5px', textTransform: 'uppercase' }
const inp = { width: '100%', boxSizing: 'border-box', background: '#0d0d15', border: '1px solid #2a2a3a', borderRadius: 10,
  padding: '12px 13px', color: '#fff', fontSize: 15, outline: 'none' }
const primaryBtn = { width: '100%', marginTop: 18, padding: '13px 0', borderRadius: 11, background: GOLD, color: '#0a0a0f',
  border: 'none', fontSize: 15, fontWeight: 800, letterSpacing: 0.5 }
