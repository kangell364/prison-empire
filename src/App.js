import React, { useState, useEffect } from 'react'
import './App.css'
import Dashboard from './screens/Dashboard'
import Cards from './screens/Cards'
import Fight from './screens/Fight'
import MapScreen from './screens/MapScreen'
import Yard from './screens/Yard'
import Profile from './screens/Profile'
import Property from './screens/Property'
import Gang from './screens/Gang'
import TrapHouse from './screens/TrapHouse'
import Nurse from './screens/Nurse'
import { isMuted, setMuted, subscribeMuted, sfx } from './sounds'
import { useVitals, onOpenNurse } from './state/vitalsStore'
import { KoOverlay, KO_FILTER } from './components/Avatar'
import { ensureAuth, onPasswordRecovery, useAuth } from './state/profileStore'
import { ensureMyHouse } from './state/sharedHousesStore'
import { SetPasswordModal } from './components/SetPasswordModal'
import { ensureCardsLoaded } from './state/cardsStore'
import { ensureUpgradesLoaded } from './state/upgradesStore'
import { useBlockPayoutTicker } from './state/blocksStore'
import { usePropertyPayoutTicker } from './state/propertyStore'
import { usePlayerCard } from './state/profileStore'
import { useUnreadCount } from './state/fightLogStore'
import { NotificationsModal } from './components/NotificationsModal'
import { InstallPrompt } from './components/InstallPrompt'
import { RaidHud } from './components/RaidHud'
import { ChatScreen } from './components/WorldChat'
// NOTE: AR camera encounter (src/components/CameraEncounter.jsx) is built but
// parked — re-import + re-add the header button below to bring it back.

// Profile lives on the header avatar (top-right) so the bottom nav stays at 6.
const NAV_ITEMS = [
  { id: 'home',     icon: 'ti-home',     label: 'Home'    },
  { id: 'map',      icon: 'ti-map',      label: 'Map'     },
  { id: 'battle',   icon: 'ti-sword',    label: 'Fight'   },
  { id: 'cards',    icon: 'ti-cards',    label: 'Cards'   },
  { id: 'yard',     icon: 'ti-trophy',   label: 'Yard'    },
  { id: 'property', icon: 'ti-building', label: 'Property'},
  { id: 'chat',     icon: 'ti-message-2', label: 'Chat'   },
]

export default function App() {
  const [screen, setScreen] = useState('home')
  // Which tab the Cards screen opens on. Set to 'crew' when jumping straight to
  // the My Crew view (e.g. tapping a crew slot on the home screen).
  const [cardsTab, setCardsTab] = useState('player')
  // Where the Trap House was opened from, so its "Out" button returns there.
  // The trap house is the player's own (not gang-gated), reachable from Home,
  // the Gang hub, or the map.
  const [trapFrom, setTrapFrom] = useState('home')
  const [muted, setMutedState] = useState(isMuted())
  const [showNotifs, setShowNotifs] = useState(false)
  const [showSetPassword, setShowSetPassword] = useState(false)
  const unread = useUnreadCount()

  // Global hourly block-income payout — runs app-wide regardless of screen.
  useBlockPayoutTicker()
  usePropertyPayoutTicker()
  // Live player card (look + name) for the header avatar — stays in sync with SWAP.
  const playerCard = usePlayerCard()
  // Keep the player's shared-world trap-house name in sync with their display
  // name app-wide (not just on the map), so a rename shows on everyone's map
  // immediately — even if they renamed from the home screen and never opened the
  // map. ensureMyHouse is idempotent + only re-pushes when the name changes.
  const auth = useAuth()
  useEffect(() => {
    if (auth.userId && playerCard.name) ensureMyHouse(playerCard.name)
  }, [auth.userId, playerCard.name])
  const initials = (playerCard.name || 'SR').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  // Live KO state — drives the global "DEFEATED — SEE NURSE" banner shown on
  // every screen while the player is knocked out.
  const vitals = useVitals()

  useEffect(() => subscribeMuted(setMutedState), [])
  useEffect(() => {
    ensureAuth().then(() => { ensureCardsLoaded(); ensureUpgradesLoaded() })
  }, [])
  // Any component can call openNurse() (e.g. the fight's "DEFEATED — SEE NURSE"
  // button) to jump straight to the Nurse view.
  useEffect(() => onOpenNurse(() => setScreen('nurse')), [])
  // When a player returns from the password-reset email link, prompt them to
  // set a new password.
  useEffect(() => onPasswordRecovery(() => setShowSetPassword(true)), [])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    // Play the confirmation AFTER unmuting so the user hears the result.
    if (!next) sfx.tap()
  }

  const handleNav = (id) => {
    if (id !== screen) sfx.tap()
    // Bottom-nav Cards always lands on the collection tab.
    if (id === 'cards') setCardsTab('player')
    setScreen(id)
  }

  // Navigation for in-screen links (e.g. Dashboard). Accepts an optional tab so
  // a caller can deep-link into the Cards screen's My Crew view.
  const navigateTo = (id, opts) => {
    if (id === 'cards') setCardsTab(opts?.tab || 'player')
    if (id === 'traphouse') setTrapFrom(screen)   // remember origin for the Out button
    setScreen(id)
  }

  const renderScreen = () => {
    switch(screen) {
      case 'home':    return <Dashboard onNavigate={navigateTo} />
      case 'map':     return <MapScreen onNavigate={navigateTo} />
      case 'battle':  return <Fight />
      case 'cards':   return <Cards initialTab={cardsTab} />
      case 'yard':     return <Yard />
      case 'property': return <Property />
      case 'gang':     return <Gang onBack={() => setScreen('home')} onNavigate={navigateTo} />
      case 'traphouse': return <TrapHouse onBack={() => setScreen(trapFrom)} />
      case 'nurse':    return <Nurse onBack={() => setScreen('home')} />
      case 'chat':     return <ChatScreen />
      case 'profile':  return <Profile onBack={() => setScreen('home')} />
      default:         return <Dashboard onNavigate={navigateTo} />
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
          <button className="icon-btn" aria-label="Notifications" onClick={() => { sfx.tap(); setShowNotifs(true) }}>
            <i className="ti ti-bell" aria-hidden="true" />
            {unread > 0 && <div className="notif-dot" />}
          </button>
          <div className="user-avatar" onClick={() => handleNav('profile')} style={{ overflow: 'hidden', padding: 0, position: 'relative' }}>
            {playerCard.avatar
              ? <img src={playerCard.avatar} alt={playerCard.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', filter: vitals.ko ? KO_FILTER : 'none' }} />
              : initials}
            {vitals.ko && <KoOverlay fontSize={11} />}
          </div>
        </div>
      </div>

      {/* Global KO banner — shown on every screen while knocked out. Tap to see
          the nurse and heal up (watch ads / pay Hustle / wait out the 24h). */}
      {vitals.ko && screen !== 'nurse' && (
        <div onClick={() => { sfx.tap(); setScreen('nurse') }}
          style={{ margin: '10px 16px 0', background: 'linear-gradient(135deg, #2a0a0a, #130a0f)', border: '1px solid #e74c3c88', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <i className="ti ti-skull" style={{ color: '#e74c3c', fontSize: 18 }} />
          <div style={{ flex: 1, color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: 0.5 }}>DEFEATED — SEE NURSE</div>
          <i className="ti ti-chevron-right" style={{ color: '#e74c3c', fontSize: 18 }} />
        </div>
      )}

      {/* Global PvP raid alerts — incoming/outgoing banners + landing modal,
          shown on every screen (an incoming raid is urgent). The attack-car
          animation itself stays on the turf map. */}
      <RaidHud onGoToMap={() => setScreen('map')} />

      {/* Screen Content */}
      {renderScreen()}

      <InstallPrompt />

      {showNotifs && (
        <NotificationsModal onClose={() => setShowNotifs(false)} onNavigate={setScreen} />
      )}

      {showSetPassword && (
        <SetPasswordModal onClose={() => setShowSetPassword(false)} />
      )}

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

