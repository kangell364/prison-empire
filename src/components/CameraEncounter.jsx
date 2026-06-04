// CameraEncounter — AR "place & persist" prototype (Wild Card Carriers).
//
// What it does on your phone:
//   PLACE MODE
//     - Live rear camera as an AR backdrop.
//     - Drag the NPC anywhere on screen with one finger.
//     - Pinch with two fingers to make it larger / smaller.
//     - "Set Here" pins it to a real GPS location (your spot + the direction
//       you're facing), and saves it to localStorage.
//   VIEW MODE
//     - Your pinned NPCs are anchored to the world: turn until one swings into
//       the camera (an arrow points the way), walk toward it, tap to visit.
//     - They persist across reloads — come back to that spot anytime and they're
//       still there.
//
// HONEST LIMITATION: anchoring is GPS + compass, so a pinned NPC returns to the
// right *area and direction* (within a few meters), not pixel-glued to an exact
// physical object — that needs VPS (Lightship / 8th Wall), out of web scope.
//
// REQUIREMENTS (met by the Codespaces/Vercel HTTPS URL): HTTPS + a user tap to
// grant camera / motion / location (iOS only grants these inside a gesture).

import React, { useEffect, useRef, useState, useCallback } from 'react'

const GOLD = '#c9a84c'
const NPC_IMG = `${process.env.PUBLIC_URL || ''}/gnome-7.webp`

const CAMERA_FOV_DEG = 60    // assumed horizontal field of view for screen<->bearing mapping
const PLACE_DIST_M   = 6     // how far ahead a freshly-pinned NPC is anchored
const SHOW_RANGE_M   = 80    // only render pinned NPCs within this radius
const NKEY = 'pe_ar_npcs_v1' // localStorage key for pinned NPCs

// ---- geo math ------------------------------------------------------
const R = 6371000
const toRad = d => (d * Math.PI) / 180
const toDeg = r => (r * 180) / Math.PI
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const wrap180 = a => ((a + 540) % 360) - 180

function distMeters(a, b) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
function bearingDeg(a, b) {
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat), Δλ = toRad(b.lng - a.lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}
function destPoint(origin, distM, brgDeg) {
  const δ = distM / R, θ = toRad(brgDeg), φ1 = toRad(origin.lat), λ1 = toRad(origin.lng)
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 }
}
function touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

// ---- persistence ---------------------------------------------------
function loadNpcs() { try { const r = localStorage.getItem(NKEY); if (r) return JSON.parse(r) || [] } catch {} return [] }
function saveNpcs(a) { try { localStorage.setItem(NKEY, JSON.stringify(a)) } catch {} }

// ---- component -----------------------------------------------------
export function CameraEncounter({ onBack }) {
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const watchRef  = useRef(null)
  const meRef     = useRef(null)      // latest GPS position
  const pinchRef  = useRef(null)      // {d, scale} during a two-finger pinch
  const layerRef  = useRef(null)

  const [phase, setPhase]     = useState('intro')   // intro | live
  const [mode, setMode]       = useState('view')    // view | place
  const [placing, setPlacing] = useState(null)      // {xPct,yPct,scaleH} while placing
  const [npcs, setNpcs]       = useState(loadNpcs)  // pinned NPCs (persisted)
  const [visited, setVisited] = useState(null)      // tapped NPC panel
  const [error, setError]     = useState('')
  const [heading, setHeading] = useState(null)
  const [me, setMe]           = useState(null)
  const [accuracy, setAcc]    = useState(null)

  // --- compass ---
  const onOrient = useCallback((e) => {
    let h = null
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading
    else if (typeof e.alpha === 'number') h = 360 - e.alpha
    if (h != null && !Number.isNaN(h)) setHeading((h + 360) % 360)
  }, [])

  // --- start (inside the tap for iOS perms) ---
  const start = useCallback(async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      streamRef.current = stream
      // NOTE: the <video> isn't mounted yet (we're still on the intro screen) —
      // a useEffect attaches the stream once phase flips to 'live'. See below.
    } catch { setError('Camera blocked. Allow camera access (and open over HTTPS).'); return }
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission().catch(() => {})
      }
    } catch {}
    window.addEventListener('deviceorientationabsolute', onOrient, true)
    window.addEventListener('deviceorientation', onOrient, true)
    if (navigator.geolocation) {
      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => { const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }; meRef.current = p; setMe(p); setAcc(pos.coords.accuracy) },
        (err) => setError(`Location ${err.code === 1 ? 'denied' : 'unavailable'} — allow location to pin NPCs.`),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
      )
    }
    setPhase('live')
  }, [onOrient])

  const stopAll = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
    window.removeEventListener('deviceorientationabsolute', onOrient, true)
    window.removeEventListener('deviceorientation', onOrient, true)
  }, [onOrient])
  useEffect(() => stopAll, [stopAll])

  // Attach the camera stream once the <video> actually mounts (phase → 'live').
  // Doing this in start() fails because the element doesn't exist there yet.
  useEffect(() => {
    if (phase !== 'live') return
    const v = videoRef.current
    if (v && streamRef.current && v.srcObject !== streamRef.current) {
      v.srcObject = streamRef.current
      v.play().catch(() => {})
    }
  }, [phase])

  const fullStop = () => { stopAll(); onBack && onBack() }

  // --- placement gestures (drag = 1 finger, pinch = 2 fingers) ---
  const beginPlace = () => { setError(''); setPlacing({ xPct: 50, yPct: 56, scaleH: 32 }); setMode('place') }
  const onTouchStart = (e) => {
    if (mode !== 'place' || !placing) return
    if (e.touches.length === 2) pinchRef.current = { d: touchDist(e.touches), scale: placing.scaleH }
  }
  const onTouchMove = (e) => {
    if (mode !== 'place' || !placing) return
    const rect = layerRef.current?.getBoundingClientRect()
    if (e.touches.length === 2 && pinchRef.current) {
      const ns = clamp(pinchRef.current.scale * (touchDist(e.touches) / pinchRef.current.d), 8, 85)
      setPlacing(p => ({ ...p, scaleH: ns }))
    } else if (e.touches.length === 1 && rect) {
      const t = e.touches[0]
      setPlacing(p => ({ ...p, xPct: clamp((t.clientX - rect.left) / rect.width * 100, 0, 100), yPct: clamp((t.clientY - rect.top) / rect.height * 100, 0, 100) }))
    }
  }
  const onTouchEnd = (e) => { if (e.touches.length < 2) pinchRef.current = null }

  // --- pin the placed NPC to the world ---
  const setHere = () => {
    const p = meRef.current
    if (!p) { setError('Need a GPS fix to pin. Move near a window or step outside.'); return }
    // Screen-x → relative bearing (inverse of the view-mode mapping) → world bearing.
    const worldBrg = ((heading ?? 0) + ((placing.xPct - 50) / 50) * (CAMERA_FOV_DEG / 2) + 360) % 360
    const anchor = destPoint(p, PLACE_DIST_M, worldBrg)
    const npc = { id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`, lat: anchor.lat, lng: anchor.lng, scaleH: placing.scaleH, yPct: placing.yPct, name: 'GNOME 7' }
    const next = [...npcs, npc]; setNpcs(next); saveNpcs(next)
    setPlacing(null); setMode('view')
  }
  const cancelPlace = () => { setPlacing(null); setMode('view'); pinchRef.current = null }
  const clearAll = () => { setNpcs([]); saveNpcs([]) }

  // --- view-mode: project each pinned NPC onto the screen ---
  const projected = (me ? npcs : []).map(n => {
    const d = distMeters(me, n)
    if (d > SHOW_RANGE_M) return null
    const brg = bearingDeg(me, n)
    let onScreen = true, xPct = 50, offSide = null
    if (heading != null) {
      const delta = wrap180(brg - heading)
      if (Math.abs(delta) <= CAMERA_FOV_DEG / 2) xPct = 50 + (delta / (CAMERA_FOV_DEG / 2)) * 50
      else { onScreen = false; offSide = delta > 0 ? 'right' : 'left' }
    }
    const factor = clamp(PLACE_DIST_M / Math.max(d, PLACE_DIST_M), 0.45, 1.3)
    return { n, d, onScreen, xPct, offSide, h: n.scaleH * factor }
  }).filter(Boolean)

  // ---------------------------------------------------------------- UI
  if (phase === 'intro') {
    return (
      <Overlay>
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 340 }}>
          <div style={{ fontSize: 46 }}>📍</div>
          <div style={{ color: GOLD, fontSize: 20, fontWeight: 900, letterSpacing: 1, marginTop: 6 }}>PLACE A CARRIER</div>
          <div style={{ color: '#bbb', fontSize: 13.5, marginTop: 10, lineHeight: 1.6 }}>
            Tap Start, then <b>allow camera, motion, and location</b>. Drag a carrier where you want it,
            pinch to size it, then <b>Set Here</b> to pin it in the real world. Come back anytime — it stays put.
          </div>
          {error && <div style={{ color: '#e74c3c', fontSize: 12.5, marginTop: 12 }}>{error}</div>}
          <button onClick={start} style={btn(GOLD, '#0a0a0f')}>Start</button>
          <button onClick={fullStop} style={btn('transparent', '#888', GOLD)}>Cancel</button>
        </div>
      </Overlay>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#000', overflow: 'hidden' }}>
      <video ref={videoRef} playsInline autoPlay muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />

      {/* ---------- PLACE MODE ---------- */}
      {mode === 'place' && placing && (
        <div ref={layerRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ position: 'absolute', inset: 0, touchAction: 'none' }}>
          <img src={NPC_IMG} alt="placing" draggable={false}
            style={{ position: 'absolute', left: `${placing.xPct}%`, top: `${placing.yPct}%`, transform: 'translate(-50%,-50%)',
              height: `${placing.scaleH}vh`, pointerEvents: 'none', filter: `drop-shadow(0 0 16px ${GOLD})` }} />
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 13,
            pointerEvents: 'none', textShadow: '0 1px 4px #000', opacity: 0.85, transform: 'translateY(-140px)' }}>
            drag to move · pinch to resize
          </div>
        </div>
      )}

      {/* ---------- VIEW MODE: pinned NPCs ---------- */}
      {mode === 'view' && projected.map(({ n, d, onScreen, xPct, offSide, h }) => (
        onScreen ? (
          <img key={n.id} src={NPC_IMG} alt="carrier" draggable={false}
            onClick={() => setVisited({ ...n, d })}
            style={{ position: 'absolute', left: `${xPct}%`, top: `${n.yPct}%`, transform: 'translate(-50%,-50%)',
              height: `${h}vh`, cursor: 'pointer', transition: 'left .12s linear, height .2s ease',
              filter: d <= 10 ? `drop-shadow(0 0 16px ${GOLD})` : 'drop-shadow(0 6px 10px rgba(0,0,0,.6))' }} />
        ) : (
          <div key={n.id} style={{ position: 'absolute', top: '46%', [offSide]: 16, color: GOLD, fontSize: 46,
            fontWeight: 900, textShadow: '0 2px 8px #000', pointerEvents: 'none', animation: 'pulse 1s infinite' }}>
            {offSide === 'left' ? '‹' : '›'}
          </div>
        )
      ))}

      {/* ---------- HUD (top) ---------- */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '14px 16px',
        background: 'linear-gradient(#000a, transparent)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <button onClick={fullStop} style={chip}>✕ Exit</button>
        <div style={{ textAlign: 'right', color: '#fff', fontSize: 12, lineHeight: 1.5, textShadow: '0 1px 4px #000' }}>
          <div>{heading == null ? 'compass —' : `facing ${Math.round(heading)}°`}</div>
          <div>{accuracy == null ? 'gps locating…' : `gps ±${Math.round(accuracy)}m`}</div>
          <div>{npcs.length} pinned</div>
        </div>
      </div>

      {error && (
        <div style={{ position: 'absolute', top: 86, left: '50%', transform: 'translateX(-50%)', maxWidth: '86%',
          background: 'rgba(120,20,20,.85)', color: '#fff', fontSize: 12.5, padding: '8px 12px', borderRadius: 10, textAlign: 'center' }}>
          {error}
        </div>
      )}

      {/* ---------- bottom toolbar ---------- */}
      <div style={{ position: 'absolute', bottom: 22, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 10, padding: '0 16px' }}>
        {mode === 'place' ? (
          <>
            <button onClick={cancelPlace} style={tBtn('rgba(0,0,0,.6)', '#fff')}>Cancel</button>
            <button onClick={setHere} style={tBtn(GOLD, '#0a0a0f')}>✓ Set Here</button>
          </>
        ) : (
          <>
            <button onClick={beginPlace} style={tBtn(GOLD, '#0a0a0f')}>➕ Place Carrier</button>
            {npcs.length > 0 && <button onClick={clearAll} style={tBtn('rgba(0,0,0,.6)', '#fff')}>Clear</button>}
          </>
        )}
      </div>

      {/* ---------- "you found it" panel ---------- */}
      {visited && (
        <div onClick={() => setVisited(null)} style={{ position: 'absolute', inset: 0, background: '#000a',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#14110a', border: `1px solid ${GOLD}66`, borderRadius: 16,
            padding: 22, textAlign: 'center', maxWidth: 300 }}>
            <img src={NPC_IMG} alt="" style={{ height: 150, filter: `drop-shadow(0 0 18px ${GOLD})` }} />
            <div style={{ color: GOLD, fontSize: 18, fontWeight: 900, marginTop: 6 }}>{visited.name}</div>
            <div style={{ color: '#aaa', fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
              You came back to your pinned carrier ({Math.round(visited.d)}m). In the real game this opens its card / a battle.
            </div>
            <button onClick={() => setVisited(null)} style={btn(GOLD, '#0a0a0f')}>Close</button>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
    </div>
  )
}

// ---- presentational helpers ----------------------------------------
const chip = { background: '#000a', border: `1px solid ${GOLD}66`, color: GOLD, borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700 }
function Overlay({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'radial-gradient(circle at 50% 30%, #14110a, #050507)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
  )
}
function btn(bg, fg, border) {
  return { display: 'block', width: '100%', marginTop: 14, padding: '13px 0', borderRadius: 12, background: bg, color: fg,
    border: border ? `1px solid ${border}55` : 'none', fontSize: 15, fontWeight: 800, letterSpacing: 0.5, cursor: 'pointer' }
}
function tBtn(bg, fg) {
  return { flex: '0 1 auto', padding: '13px 20px', borderRadius: 999, background: bg, color: fg, border: 'none',
    fontSize: 14.5, fontWeight: 800, letterSpacing: 0.3, cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,.5)' }
}
