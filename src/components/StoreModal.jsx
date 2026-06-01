import React from 'react'
import { sfx } from '../sounds'

// Commissary Store view — opened from the home-screen STORE art. Full-screen
// overlay with an X (top-right) to close back to the home screen. Placeholder
// content for now; the real storefront lands later.
export function StoreModal({ onClose }) {
  const close = () => { sfx.tap?.(); onClose() }
  return (
    <div className="app-overlay" style={{ position: 'fixed', inset: 0, background: '#0a0a0f', zIndex: 300, overflowY: 'auto' }}>
      {/* Header: title + X to close */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 6px' }}>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>Commissary Store</div>
        <button
          onClick={close}
          aria-label="Close"
          style={{
            width: 36, height: 36, borderRadius: 10, background: '#1e1e2a',
            border: '0.5px solid #2a2a3a', color: '#fff', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <i className="ti ti-x" />
        </button>
      </div>

      {/* Store art */}
      <div style={{ padding: '6px 16px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <img src="/STORE.png" alt="Commissary Store"
            style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>
      </div>

      {/* Placeholder body */}
      <div style={{ textAlign: 'center', padding: '24px 24px 110px', color: '#666' }}>
        <i className="ti ti-building-store" style={{ fontSize: 34, color: '#2a2a3a' }} />
        <div style={{ color: '#aaa', fontSize: 14, fontWeight: 600, marginTop: 10 }}>Store coming soon</div>
        <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
          Spend your Hustle on gear, boosts, and more — right here.
        </div>
      </div>
    </div>
  )
}
