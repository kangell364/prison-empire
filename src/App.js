import React, { useState, useEffect } from 'react'
import './App.css'
import Dashboard from './screens/Dashboard'
import Cards from './screens/Cards'
import Battle from './screens/Battle'
import MapScreen from './screens/MapScreen'
import Yard from './screens/Yard'
import Profile from './screens/Profile'
import Property from './screens/Property'
import { isMuted, setMuted, subscribeMuted } from './sounds'

// Profile lives on the header avatar (top-right) so the bottom nav stays at 6.
const NAV_ITEMS = [
  { id: 'home',     icon: 'ti-home',     label: 'Home'    },
  { id: 'map',      icon: 'ti-map',      label: 'Map'     },
  { id: 'battle',   icon: 'ti-sword',    label: 'Fight'   },
  { id: 'cards',    icon: 'ti-cards',    label: 'Cards'   },
  { id: 'yard',     icon: 'ti-trophy',   label: 'Yard'    },
  { id: 'property', icon: 'ti-building', label: 'Property'},
]

export default function App() {
  const [screen, setScreen] = useState('home')
  const [muted, setMutedState] = useState(isMuted())

  useEffect(() => subscribeMuted(setMutedState), [])

  const toggleMute = () => setMuted(!muted)

  const renderScreen = () => {
    switch(screen) {
      case 'home':    return <Dashboard onNavigate={setScreen} />
      case 'map':     return <MapScreen />
      case 'battle':  return <Battle />
      case 'cards':   return <Cards />
      case 'yard':     return <Yard />
      case 'property': return <Property />
      case 'profile':  return <Profile />
      default:         return <Dashboard onNavigate={setScreen} />
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
          <button className="icon-btn" aria-label={muted ? 'Unmute sound' : 'Mute sound'} onClick={toggleMute}>
            <i className={`ti ${muted ? 'ti-volume-off' : 'ti-volume'}`} aria-hidden="true" />
          </button>
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

