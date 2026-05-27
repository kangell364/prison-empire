// Procedural sound effects via Web Audio API. No audio assets bundled —
// every sound is synthesized at play time from oscillators + filtered noise.
//
// Browsers gate AudioContext behind a user gesture; we lazy-create the
// context on the first call and resume it inside the first event handler
// that fires after page load.

let ctx = null
let muted = readMutedFlag()
const listeners = new Set()

function readMutedFlag() {
  try { return localStorage.getItem('pe_muted') === '1' } catch { return false }
}

function writeMutedFlag(v) {
  try { localStorage.setItem('pe_muted', v ? '1' : '0') } catch {}
}

export function isMuted() { return muted }

export function setMuted(v) {
  muted = !!v
  writeMutedFlag(muted)
  listeners.forEach(fn => fn(muted))
}

export function subscribeMuted(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function getCtx() {
  if (muted) return null
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// One-time gesture unlock so the first synthesized sound (which may be
// triggered by a child element's click) can play even if the AudioContext
// was created before that gesture reached us.
let gestureBound = false
function bindGesture() {
  if (gestureBound) return
  gestureBound = true
  const unlock = () => { getCtx() }
  ['pointerdown', 'touchstart', 'keydown'].forEach(e =>
    window.addEventListener(e, unlock, { once: true, passive: true })
  )
}
if (typeof window !== 'undefined') bindGesture()

// --- Primitives ------------------------------------------------------

function tone({ freq, duration, type = 'sine', volume = 0.25, attack = 0.005, sweepTo = null, delay = 0 }) {
  const c = getCtx(); if (!c) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (sweepTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + duration)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(volume, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function noise({ duration, volume = 0.15, filterFreq = 1500, filterQ = 1, type = 'bandpass', delay = 0 }) {
  const c = getCtx(); if (!c) return
  const t0 = c.currentTime + delay
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * duration)), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource(); src.buffer = buf
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq; f.Q.value = filterQ
  const g = c.createGain()
  g.gain.setValueAtTime(volume, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  src.connect(f).connect(g).connect(c.destination)
  src.start(t0)
}

// --- Composed sounds -------------------------------------------------

export const sfx = {
  // Battle moments
  clash() {
    noise({ duration: 0.18, filterFreq: 2200, filterQ: 0.8, volume: 0.22 })
    tone({ freq: 180, duration: 0.12, type: 'square', volume: 0.12, sweepTo: 60 })
  },
  win() {
    // Ascending major triad
    const notes = [523.25, 659.25, 783.99] // C5 E5 G5
    notes.forEach((f, i) => tone({ freq: f, duration: 0.45, type: 'triangle', volume: 0.18, delay: i * 0.08 }))
    tone({ freq: 1046.5, duration: 0.6, type: 'sine', volume: 0.10, delay: 0.24 }) // sparkle
  },
  lose() {
    tone({ freq: 220, duration: 0.6, type: 'sawtooth', volume: 0.20, sweepTo: 80 })
    noise({ duration: 0.45, filterFreq: 400, volume: 0.12, delay: 0.05 })
  },

  // Pack opening
  shake() {
    // Building rumble — multiple rapid noise bursts
    for (let i = 0; i < 6; i++) {
      noise({ duration: 0.08, filterFreq: 400 + i * 80, volume: 0.06 + i * 0.01, delay: i * 0.13 })
    }
  },
  burst() {
    // Big rising whoosh + flash
    noise({ duration: 0.35, filterFreq: 3000, filterQ: 0.5, volume: 0.30 })
    tone({ freq: 200, duration: 0.4, type: 'sawtooth', volume: 0.18, sweepTo: 2400 })
    tone({ freq: 100, duration: 0.5, type: 'sine', volume: 0.20, delay: 0.05 })
  },
  reveal(tier = 0) {
    // Bell-ish ping. Higher rarity = higher pitch + longer sparkle tail.
    const base = 700 + tier * 180     // common=700, legendary=1420
    const tail = 0.5 + tier * 0.15
    tone({ freq: base, duration: tail, type: 'sine', volume: 0.22 })
    tone({ freq: base * 1.5, duration: tail * 0.9, type: 'triangle', volume: 0.14, delay: 0.02 })
    if (tier >= 3) {
      // Epic / Legendary: extra harmonic sparkle
      tone({ freq: base * 2, duration: tail, type: 'sine', volume: 0.10, delay: 0.08 })
      tone({ freq: base * 3, duration: tail * 0.7, type: 'sine', volume: 0.06, delay: 0.16 })
    }
  },

  // UI feedback
  tap() {
    // Subtle confirmation for nav taps, toggles, etc. Quiet on purpose.
    tone({ freq: 1700, duration: 0.035, type: 'square', volume: 0.07 })
  },
  buy() {
    // Two quick high pings — cash-register chink for successful purchases.
    tone({ freq: 1200, duration: 0.09, type: 'triangle', volume: 0.18 })
    tone({ freq: 1800, duration: 0.12, type: 'triangle', volume: 0.16, delay: 0.05 })
  },
  deny() {
    // Short low buzz for blocked actions (insufficient resources, locked, etc.).
    tone({ freq: 200, duration: 0.16, type: 'sawtooth', volume: 0.18, sweepTo: 120 })
  },
  levelUp() {
    // Triumphant 4-note arpeggio + high sparkle. Bigger payoff than reveal(0).
    const notes = [523.25, 659.25, 783.99, 1046.50] // C5 E5 G5 C6
    notes.forEach((f, i) => tone({
      freq: f, duration: 0.35, type: 'triangle', volume: 0.20, delay: i * 0.07,
    }))
    tone({ freq: 1568, duration: 0.55, type: 'sine', volume: 0.12, delay: 0.28 })
    tone({ freq: 2093, duration: 0.40, type: 'sine', volume: 0.08, delay: 0.34 })
  },

  // Tactical
  tick() {
    tone({ freq: 1400, duration: 0.06, type: 'square', volume: 0.14 })
  },
  hotTick() {
    tone({ freq: 1800, duration: 0.07, type: 'square', volume: 0.18 })
  },
  snitch() {
    // Police whoop — alternating two-tone
    tone({ freq: 700,  duration: 0.18, type: 'sine', volume: 0.22, sweepTo: 1100 })
    tone({ freq: 1100, duration: 0.18, type: 'sine', volume: 0.22, sweepTo: 700, delay: 0.18 })
    tone({ freq: 700,  duration: 0.18, type: 'sine', volume: 0.20, sweepTo: 1100, delay: 0.36 })
  },
  launch() {
    // Sword launch — swoosh + low boom
    noise({ duration: 0.35, filterFreq: 1800, filterQ: 1.2, volume: 0.22 })
    tone({ freq: 90, duration: 0.45, type: 'sine', volume: 0.22, delay: 0.05 })
  },
  boom() {
    // Drive-by landing — wide low impact + crackle tail
    noise({ duration: 0.55, filterFreq: 220, filterQ: 0.4, volume: 0.40, type: 'lowpass' })
    tone({ freq: 70, duration: 0.7, type: 'sine', volume: 0.32, sweepTo: 30 })
    tone({ freq: 140, duration: 0.5, type: 'sawtooth', volume: 0.16, sweepTo: 50, delay: 0.03 })
    noise({ duration: 0.25, filterFreq: 3200, filterQ: 1.4, volume: 0.18, delay: 0.18 })
  },
}
