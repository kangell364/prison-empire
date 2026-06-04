// AuthModal — email/password account flow (store-compliant).
//
// Three modes: create account, sign in, forgot password. Email/password ONLY
// (first-party) so we avoid Apple's "must offer Sign in with Apple" rule that
// social logins trigger. Login is always OPTIONAL — guests keep playing — to
// satisfy Apple 5.1.1(i). Links to the privacy policy + terms are shown on the
// create-account view (required by both stores when collecting emails).

import React, { useState } from 'react'
import { signUpWithEmail, signInWithEmail, sendPasswordReset, PASSWORD_MIN } from '../state/profileStore'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'

export function AuthModal({ initialMode = 'signup', hasGuestProgress = true, onClose, onAuthed }) {
  const [mode, setMode] = useState(initialMode)   // signup | signin | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const submit = async () => {
    if (busy) return
    setError(''); setNotice(''); setBusy(true)
    try {
      if (mode === 'forgot') {
        const r = await sendPasswordReset(email)
        if (!r.ok) setError(r.error)
        else setNotice('Check your email for a reset link.')
        return
      }
      // Signing into an existing account on a device with guest progress means
      // the cloud save replaces it — confirm before we throw away local play.
      if (mode === 'signin' && hasGuestProgress) {
        const ok = window.confirm('Signing in loads your saved account and replaces the current guest progress on this device. Continue?')
        if (!ok) return
      }
      const r = mode === 'signup' ? await signUpWithEmail(email, password) : await signInWithEmail(email, password)
      if (!r.ok) { setError(r.error); return }
      sfx.tap?.()
      onAuthed && onAuthed()
      onClose && onClose()
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e) => { if (e.key === 'Enter') submit() }

  const title = mode === 'signup' ? 'Create Account' : mode === 'signin' ? 'Sign In' : 'Reset Password'
  const cta   = mode === 'signup' ? 'Create Account' : mode === 'signin' ? 'Sign In' : 'Send Reset Link'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(5,5,8,.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, background: '#14131c',
        border: `1px solid ${GOLD}44`, borderRadius: 18, padding: 22, boxShadow: '0 16px 50px rgba(0,0,0,.6)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ color: GOLD, fontSize: 19, fontWeight: 900, letterSpacing: 0.5 }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#777', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ color: '#888', fontSize: 12.5, lineHeight: 1.5, marginBottom: 16 }}>
          {mode === 'signup' && 'Save your progress and play on any device. Your current game carries over.'}
          {mode === 'signin' && 'Welcome back — load your saved empire.'}
          {mode === 'forgot' && 'Enter your account email and we’ll send a reset link.'}
        </div>

        <label style={lbl}>Email</label>
        <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off"
          value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey}
          placeholder="you@example.com" style={inp} />

        {mode !== 'forgot' && (
          <>
            <label style={lbl}>Password</label>
            <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey}
              placeholder={`At least ${PASSWORD_MIN} characters`} style={inp} />
          </>
        )}

        {error  && <div style={{ color: '#e74c3c', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        {notice && <div style={{ color: '#2ecc71', fontSize: 12.5, marginTop: 10 }}>{notice}</div>}

        <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Please wait…' : cta}
        </button>

        {/* Mode switches */}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'center' }}>
          {mode === 'signin' && <>
            <Switch onClick={() => { setMode('signup'); setError('') }}>New here? <b style={{ color: GOLD }}>Create an account</b></Switch>
            <Switch onClick={() => { setMode('forgot'); setError('') }}>Forgot password?</Switch>
          </>}
          {mode === 'signup' && <Switch onClick={() => { setMode('signin'); setError('') }}>Already have an account? <b style={{ color: GOLD }}>Sign in</b></Switch>}
          {mode === 'forgot' && <Switch onClick={() => { setMode('signin'); setError('') }}>Back to sign in</Switch>}
        </div>

        {/* Legal — required by both stores when collecting emails. */}
        {mode === 'signup' && (
          <div style={{ marginTop: 16, color: '#666', fontSize: 10.5, textAlign: 'center', lineHeight: 1.6 }}>
            By creating an account you agree to our{' '}
            <a href="/terms.html" target="_blank" rel="noreferrer" style={lnk}>Terms</a> and{' '}
            <a href="/privacy.html" target="_blank" rel="noreferrer" style={lnk}>Privacy Policy</a>.
          </div>
        )}
      </div>
    </div>
  )
}

function Switch({ onClick, children }) {
  return <button onClick={onClick} style={{ background: 'none', border: 'none', color: '#999', fontSize: 12.5, cursor: 'pointer', padding: 2 }}>{children}</button>
}

const lbl = { display: 'block', color: '#aaa', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, margin: '12px 0 5px', textTransform: 'uppercase' }
const inp = { width: '100%', boxSizing: 'border-box', background: '#0d0d15', border: '1px solid #2a2a3a', borderRadius: 10,
  padding: '12px 13px', color: '#fff', fontSize: 15, outline: 'none' }
const primaryBtn = { width: '100%', marginTop: 18, padding: '13px 0', borderRadius: 11, background: GOLD, color: '#0a0a0f',
  border: 'none', fontSize: 15, fontWeight: 800, letterSpacing: 0.5 }
const lnk = { color: '#999', textDecoration: 'underline' }
