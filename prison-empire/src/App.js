import React, { useState } from 'react'
import './App.css'
import Dashboard from './screens/Dashboard'
import Cards from './screens/Cards'
import Battle from './screens/Battle'
import MapScreen from './screens/MapScreen'

const NAV_ITEMS = [
  { id: 'home',   icon: 'ti-home',    label: 'Home'   },
  { id: 'map',    icon: 'ti-map',     label: 'Map'    },
  { id: 'battle', icon: 'ti-sword',   label: 'Fight'  },
  { id: 'cards',  icon: 'ti-cards',   label: 'Cards'  },
  { id: 'profile',icon: 'ti-user',    label: 'Profile'},
]

export default function App() {
  const [screen, setScreen] = useState('home')

  const renderScreen = () => {
    switch(screen) {
      case 'home':    return <Dashboard onNavigate={setScreen} />
      case 'map':     return <MapScreen />
      case 'battle':  return <Battle />
      case 'cards':   return <Cards />
      case 'profile': return <Profile />
      default:        return <Dashboard onNavigate={setScreen} />
    }
  }

  return (
    <div className="phone-shell">
      {/* Status Bar */}
      <div className="status-bar">
        <span className="status-time">9:41</span>
        <div className="status-icons">
          <i className="ti ti-wifi" aria-hidden="true" />
          <i className="ti ti-battery-2" aria-hidden="true" />
        </div>
      </div>

      {/* Header */}
      <div className="app-header">
        <div className="game-logo">PRISON EMPIRE</div>
        <div className="header-actions">
          <button className="icon-btn" aria-label="Notifications">
            <i className="ti ti-bell" aria-hidden="true" />
            <div className="notif-dot" />
          </button>
          <div className="user-avatar" onClick={() => setScreen('profile')}>SR</div>
        </div>
      </div>

      {/* Screen Content */}
      {renderScreen()}

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`nav-item ${screen === item.id ? 'active' : ''}`}
            onClick={() => setScreen(item.id)}
            aria-label={item.label}
          >
            <i className={`ti ${item.icon}`} aria-hidden="true" />
            {screen === item.id && <div className="nav-dot" />}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Profile() {
  return (
    <div className="scroll-area animate-in">
      <div className="section" style={{ marginTop: 14 }}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🤵</div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 500 }}>SlickRico</div>
          <div style={{ color: '#c9a84c', fontSize: 13, marginTop: 4 }}>Federal Penn — Texas</div>
          <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>Level 42 — 284 Power</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Cities Controlled', value: '1', color: '#c9a84c' },
            { label: 'Texas Rank',        value: '#4',  color: '#c9a84c' },
            { label: 'Battles Won',       value: '47',  color: '#2ecc71' },
            { label: 'Snitches Used',     value: '2',   color: '#e74c3c' },
          ].map(s => (
            <div key={s.label} style={{ background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 14, padding: 14, textAlign: 'center' }}>
              <div style={{ color: s.color, fontSize: 24, fontWeight: 500 }}>{s.value}</div>
              <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { icon: 'ti-settings', label: 'Settings', color: '#888' },
            { icon: 'ti-help', label: 'How to Play', color: '#888' },
            { icon: 'ti-star', label: 'Rate the Game', color: '#c9a84c' },
            { icon: 'ti-share', label: 'Share with Friends', color: '#4a9eff' },
          ].map((item, i) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < 3 ? '0.5px solid #1e1e2a' : 'none', cursor: 'pointer' }}>
              <i className={`ti ${item.icon}`} style={{ color: item.color, fontSize: 20 }} />
              <span style={{ color: '#888', fontSize: 14, flex: 1 }}>{item.label}</span>
              <i className="ti ti-chevron-right" style={{ color: '#333', fontSize: 16 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
