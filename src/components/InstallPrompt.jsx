// InstallPrompt — "Add Prison Empire to your home screen" banner.
//
// Platform split (the best the web allows):
//   - Android/Chrome: captures the `beforeinstallprompt` event and shows a
//     button that fires the real native install dialog (one tap).
//   - iOS/Safari: Apple blocks programmatic install, so we show a short
//     instruction (Share → Add to Home Screen) with a pointer to the share icon.
//
// Hides itself when: already running installed (standalone), already dismissed
// (remembered for ~2 weeks), or there's nothing to offer (e.g. desktop, or an
// Android browser that hasn't fired the event yet).

import React, { useEffect, useState } from 'react'

const GOLD = '#c9a84c'
const DISMISS_KEY = 'pe_a2hs_dismissed_until'
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000   // re-ask after two weeks

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream
}
function isIOSSafari() {
  const ua = window.navigator.userAgent
  // Exclude in-app browsers / Chrome-on-iOS (CriOS/FxiOS) — A2HS only works in Safari.
  return isIOS() && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
}
function snoozed() {
  try { const v = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10); return Date.now() < v } catch { return false }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)   // Android beforeinstallprompt event
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone() || snoozed()) return

    // Android: capture the install event Chrome fires when the PWA is installable.
    const onBIP = (e) => { e.preventDefault(); setDeferred(e); setShow(true) }
    window.addEventListener('beforeinstallprompt', onBIP)

    // If installed during the session, hide the banner.
    const onInstalled = () => setShow(false)
    window.addEventListener('appinstalled', onInstalled)

    // iOS: no event exists — decide up front whether to show the manual hint.
    if (isIOSSafari()) { setIosHint(true); setShow(true) }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = () => {
    setShow(false)
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_MS)) } catch {}
  }

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch {}
    setDeferred(null)
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      zIndex: 700, background: '#16141d', border: `1px solid ${GOLD}55`, borderRadius: 14,
      padding: '12px 14px', boxShadow: '0 10px 34px rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <img src={`${process.env.PUBLIC_URL || ''}/icon-192.png`} alt="" width={40} height={40}
        style={{ borderRadius: 9, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 13.5, fontWeight: 800 }}>Add Prison Empire to your home screen</div>
        {iosHint ? (
          <div style={{ color: '#9a9aa6', fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
            Tap the Share icon <span style={{ color: GOLD, fontWeight: 800 }}>⎙</span> below, then <b style={{ color: '#ccc' }}>Add to Home Screen</b>.
          </div>
        ) : (
          <div style={{ color: '#9a9aa6', fontSize: 11.5, marginTop: 2 }}>Play like an app — full screen, one tap to open.</div>
        )}
      </div>
      {!iosHint && (
        <button onClick={install} style={{ flexShrink: 0, background: GOLD, color: '#0a0a0f', border: 'none',
          borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Install</button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" style={{ flexShrink: 0, background: 'none', border: 'none',
        color: '#666', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '0 2px' }}>×</button>
    </div>
  )
}
