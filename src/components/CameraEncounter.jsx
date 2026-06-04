// CameraEncounter — AR "wild carrier" prototype (the Wild Card Carriers loop).
//
// What it does on your phone:
//   1. Opens the rear camera full-screen (a live AR backdrop).
//   2. On the first GPS fix it SPAWNS a carrier at a real lat/lng ~20m away,
//      in a random compass direction.
//   3. Uses the phone's COMPASS so the carrier is anchored to a real-world
//      bearing — you have to physically turn until it swings into view, then
//      WALK toward it (GPS distance shrinks) until you're close enough to catch.
//   4. Tap the carrier in range → "caught" (where the real game would open the
//      card reward / CharacterDetailModal / a battle).
//
// HARD REQUIREMENTS (all satisfied by the Codespaces HTTPS dev URL):
//   - HTTPS (camera, geolocation, and iOS compass all refuse to run on http).
//   - A user gesture to start — iOS only grants camera + motion/compass
//     permission from inside a tap handler, which is why there's a Start button.
//
// This is a PROTOTYPE: one hard-coded carrier, no persistence, no economy hooks.
// It deliberately touches nothing else in the app so it's safe to throw away.

import React, { useEffect, useRef, useState, useCallback } from 'react'

const GOLD = '#c9a84c'
const NPC_IMG = `${process.env.PUBLIC_URL || ''}/gnome-7.webp`

const SPAWN_DIST_M   = 10    // spawn right next to you (a few steps) so it's easy to test
const CATCH_RADIUS_M = 6     // base catch range; widened by live GPS accuracy below
const CAMERA_FOV_DEG = 60    // assumed horizontal field of view for screen mapping

// ---- geo math ------------------------------------------------------
const R = 6371000               // earth radius (m)
const toRad = d => (d * Math.PI) / 180
const toDeg = r => (r * 180) / Math.PI

function distMeters(a, b) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Compass bearing (0=N, clockwise) from point a to point b.
function bearingDeg(a, b) {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat), Δλ = toRad(b.lng - a.lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

// Project a new lat/lng from an origin given a distance (m) and bearing (deg).
function destPoint(origin, distM, brgDeg) {
  const δ = distM / R, θ = toRad(brgDeg), φ1 = toRad(origin.lat), λ1 = toRad(origin.lng)
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
  )
  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 }
}

// Wrap an angle to [-180, 180].
const wrap180 = a => ((a + 540) % 360) - 180

// ---- component -----------------------------------------------------
export function CameraEncounter({ onBack }) {
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const watchRef  = useRef(null)
  const spawnRef  = useRef(null)      // carrier lat/lng, set once on first GPS fix

  const [phase, setPhase]     = useState('intro')   // intro | live | caught
  const [error, setError]     = useState('')
  const [heading, setHeading] = useState(null)      // compass deg, null until we get one
  const [dist, setDist]       = useState(null)      // meters to carrier
  const [brgToNpc, setBrg]    = useState(null)      // bearing to carrier (deg)
  const [accuracy, setAcc]    = useState(null)      // GPS accuracy (m)

  // --- compass listener ---
  const onOrient = useCallback((e) => {
    let h = null
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading       // iOS
    else if (typeof e.alpha === 'number') h = (e.absolute ? 360 - e.alpha : 360 - e.alpha) // Android/absolute
    if (h != null && !Number.isNaN(h)) setHeading((h + 360) % 360)
  }, [])

  // --- start (must run inside the user's tap for iOS permissions) ---
  const start = useCallback(async () => {
    setError('')
    // 1) Camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}) }
    } catch (err) {
      setError('Camera blocked. Allow camera access and make sure you opened this over HTTPS.')
      return
    }
    // 2) Motion/compass permission (iOS 13+ gate; no-op elsewhere)
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission().catch(() => {})
      }
    } catch {}
    window.addEventListener('deviceorientationabsolute', onOrient, true)
    window.addEventListener('deviceorientation', onOrient, true)
    // 3) GPS watch
    if (!navigator.geolocation) { setError('No geolocation on this device.'); return }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setAcc(pos.coords.accuracy)
        if (!spawnRef.current) {
          // First fix → drop the carrier ~20m away on a random bearing.
          spawnRef.current = destPoint(p, SPAWN_DIST_M, Math.random() * 360)
        }
        setDist(distMeters(p, spawnRef.current))
        setBrg(bearingDeg(p, spawnRef.current))
      },
      (err) => setError(`Location ${err.code === 1 ? 'permission denied' : 'unavailable'} — allow location to spawn a carrier.`),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    )
    setPhase('live')
  }, [onOrient])

  // --- teardown ---
  const stopAll = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
    window.removeEventListener('deviceorientationabsolute', onOrient, true)
    window.removeEventListener('deviceorientation', onOrient, true)
  }, [onOrient])

  useEffect(() => stopAll, [stopAll])   // stop on unmount

  // --- where the carrier sits on screen ---
  // Relative bearing (carrier bearing − where I'm facing). Inside the FOV it maps
  // to a horizontal screen %; outside it, the carrier is off-screen and we point
  // an arrow toward it. With no compass we fall back to dead-center.
  // Catch range widens to swallow GPS jitter — when accuracy is ±15m a fixed 6m
  // ring would never trigger, so we honor whichever is more forgiving.
  const catchR = Math.max(CATCH_RADIUS_M, (accuracy || 0) * 0.75)
  const inRange = dist != null && dist <= catchR
  let onScreen = true, xPct = 50, offSide = null
  if (heading != null && brgToNpc != null) {
    const delta = wrap180(brgToNpc - heading)
    if (Math.abs(delta) <= CAMERA_FOV_DEG / 2) {
      xPct = 50 + (delta / (CAMERA_FOV_DEG / 2)) * 50
    } else { onScreen = false; offSide = delta > 0 ? 'right' : 'left' }
  }
  // Closer = bigger. Height in vh, clamped so far-off carriers stay a readable dot.
  const scaleH = dist == null ? 34 : Math.max(12, Math.min(46, 46 * (catchR / Math.max(dist, catchR)) + 12))

  const fullStop = () => { stopAll(); onBack && onBack() }

  // ---------------------------------------------------------------- UI
  if (phase === 'caught') {
    return (
      <Overlay>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <img src={NPC_IMG} alt="" style={{ width: 160, filter: `drop-shadow(0 0 24px ${GOLD})` }} />
          <div style={{ color: GOLD, fontSize: 22, fontWeight: 900, letterSpacing: 1, marginTop: 8 }}>CARRIER SECURED</div>
          <div style={{ color: '#aaa', fontSize: 13, maxWidth: 280, margin: '8px auto 0', lineHeight: 1.5 }}>
            In the real game this is where the card reward drops (or a battle starts) — it'd open your existing CharacterDetailModal.
          </div>
          <button onClick={fullStop} style={btn(GOLD, '#0a0a0f')}>Done</button>
        </div>
      </Overlay>
    )
  }

  if (phase === 'intro') {
    return (
      <Overlay>
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 340 }}>
          <div style={{ fontSize: 46 }}>📡</div>
          <div style={{ color: GOLD, fontSize: 20, fontWeight: 900, letterSpacing: 1, marginTop: 6 }}>WILD CARRIER NEARBY</div>
          <div style={{ color: '#bbb', fontSize: 13.5, marginTop: 10, lineHeight: 1.6 }}>
            Tap Start, then <b>allow camera, motion, and location</b>. A carrier will appear ~20m from you —
            turn until it's in view, then <b>walk toward it</b> to catch it.
          </div>
          {error && <div style={{ color: '#e74c3c', fontSize: 12.5, marginTop: 12 }}>{error}</div>}
          <button onClick={start} style={btn(GOLD, '#0a0a0f')}>Start Encounter</button>
          <button onClick={fullStop} style={btn('transparent', '#888', GOLD)}>Cancel</button>
        </div>
      </Overlay>
    )
  }

  // phase === 'live'
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#000', overflow: 'hidden' }}>
      <video ref={videoRef} playsInline autoPlay muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />

      {/* The carrier, anchored to its real-world bearing */}
      {onScreen && spawnRef.current && (
        <img
          src={NPC_IMG} alt="carrier"
          onClick={() => { if (inRange) { stopAll(); setPhase('caught') } }}
          style={{
            position: 'absolute', left: `${xPct}%`, bottom: '22%', transform: 'translateX(-50%)',
            height: `${scaleH}vh`, pointerEvents: inRange ? 'auto' : 'none',
            cursor: inRange ? 'pointer' : 'default',
            filter: inRange ? `drop-shadow(0 0 18px ${GOLD})` : 'drop-shadow(0 6px 10px rgba(0,0,0,.6))',
            transition: 'left .12s linear, height .25s ease', willChange: 'left',
          }}
        />
      )}

      {/* Off-screen arrow — "turn this way to find it" */}
      {!onScreen && (
        <div style={{
          position: 'absolute', top: '46%', [offSide]: 18, color: GOLD, fontSize: 56, fontWeight: 900,
          textShadow: '0 2px 8px #000', animation: 'pulse 1s infinite',
        }}>{offSide === 'left' ? '‹' : '›'}</div>
      )}

      {/* HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '14px 16px',
        background: 'linear-gradient(#000a, transparent)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <button onClick={fullStop} style={{ background: '#000a', border: `1px solid ${GOLD}66`, color: GOLD,
          borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700 }}>✕ Exit</button>
        <div style={{ textAlign: 'right', color: '#fff', fontSize: 12.5, lineHeight: 1.5, textShadow: '0 1px 4px #000' }}>
          <div>{heading == null ? 'compass: —' : `facing ${Math.round(heading)}°`}</div>
          <div>{accuracy == null ? 'gps: locating…' : `gps ±${Math.round(accuracy)}m`}</div>
        </div>
      </div>

      {/* Bottom status pill */}
      <div style={{ position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        {dist == null ? (
          <Pill>Waiting for GPS fix…</Pill>
        ) : inRange ? (
          <Pill gold>In range — TAP the carrier to catch!</Pill>
        ) : (
          <Pill>{onScreen ? 'Walk closer' : `Turn ${offSide}`} · {Math.round(dist)}m away</Pill>
        )}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    </div>
  )
}

// ---- little presentational helpers ---------------------------------
function Overlay({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'radial-gradient(circle at 50% 30%, #14110a, #050507)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
  )
}
function Pill({ children, gold }) {
  return (
    <div style={{ display: 'inline-block', background: gold ? '#c9a84c' : 'rgba(0,0,0,.62)',
      color: gold ? '#0a0a0f' : '#fff', border: gold ? 'none' : '1px solid #ffffff22',
      borderRadius: 999, padding: '10px 18px', fontSize: 14, fontWeight: 800, letterSpacing: 0.3,
      textShadow: gold ? 'none' : '0 1px 3px #000' }}>{children}</div>
  )
}
function btn(bg, fg, border) {
  return {
    display: 'block', width: '100%', marginTop: 14, padding: '13px 0', borderRadius: 12,
    background: bg, color: fg, border: border ? `1px solid ${border}55` : 'none',
    fontSize: 15, fontWeight: 800, letterSpacing: 0.5, cursor: 'pointer',
  }
}
