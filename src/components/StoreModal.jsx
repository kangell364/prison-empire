import React from 'react'
import { sfx } from '../sounds'
import { CommissaryPack } from './CommissaryPack'

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

      {/* Commissary Pack — same pack as the Cards screen. */}
      <CommissaryPack style={{ margin: '8px 16px 110px' }} />
    </div>
  )
}
