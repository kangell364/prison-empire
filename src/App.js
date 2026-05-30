import React, { useState, useEffect } from 'react'
import './App.css'
import Dashboard from './screens/Dashboard'
import Cards from './screens/Cards'
import Fight from './screens/Fight'
import MapScreen from './screens/MapScreen'
import Yard from './screens/Yard'
import Profile from './screens/Profile'
import Property from './screens/Property'
import { isMuted, setMuted, subscribeMuted, sfx } from './sounds'
import { ensureAuth } from './state/profileStore'
import { ensureCardsLoaded } from './state/cardsStore'
import { ensureUpgradesLoaded } from './state/upgradesStore'
import { useBlockPayoutTicker } from './state/blocksStore'
import { usePlayerCard } from './state/profileStore'

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

  // Global hourly block-income payout — runs app-wide regardless of screen.
  useBlockPayoutTicker()
  // Live player card (look + name) for the header avatar — stays in sync with SWAP.
  const playerCard = usePlayerCard()
  const initials = (playerCard.name || 'SR').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

  useEffect(() => subscribeMuted(setMutedState), [])
  useEffect(() => {
    ensureAuth().then(() => { ensureCardsLoaded(); ensureUpgradesLoaded() })
  }, [])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    // Play the confirmation AFTER unmuting so the user hears the result.
    if (!next) sfx.tap()
  }

  const handleNav = (id) => {
    if (id !== screen) sfx.tap()
    setScreen(id)
  }

  const renderScreen = () => {
    switch(screen) {
      case 'home':    return <Dashboard onNavigate={setScreen} />
      case 'map':     return <MapScreen />
      case 'battle':  return <Fight />
      case 'cards':   return <Cards />
      case 'yard':     return <Yard />
      case 'property': return <Property />
      case 'profile':  return <Profile onBack={() => setScreen('home')} />
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
          <div className="user-avatar" onClick={() => handleNav('profile')} style={{ overflow: 'hidden', padding: 0 }}>
            {playerCard.avatar
              ? <img src={playerCard.avatar} alt={playerCard.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
              : initials}
          </div>
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
            onClick={() => handleNav(item.id)}
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

