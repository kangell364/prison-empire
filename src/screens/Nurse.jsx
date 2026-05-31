import React, { useState, useEffect, useRef } from 'react'
import { useVitals, reviveNow, KO_HUSTLE_PER_LEVEL } from '../state/vitalsStore'
import { useProgress } from '../state/progressionStore'
import { useHustle, spendHustle } from '../state/profileStore'
import { sfx } from '../sounds'

const GOLD  = '#c9a84c'
const RED   = '#e74c3c'
const GREEN = '#2ecc71'
const BLUE  = '#4a9eff'
const DIM   = '#555'

// HH:MM:SS countdown for the 24h recovery clock.
function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const p = n => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(sec)}`
}

// The Nurse — where a KO'd player recovers. Three ways back to full health:
//   1. Wait out the 24h timer (auto-revive in the store).
//   2. Watch ads (stubbed — no ad SDK yet; revives instantly).
//   3. Pay Hustle (5,000 × player level).
export default function Nurse({ onBack }) {
  const vitals = useVitals()
  const level  = useProgress().level
  const hustle = useHustle()
  const [, tickNow] = useState(0)
  const [adPlaying, setAdPlaying] = useState(false)
  const adTimer = useRef(null)

  // Tick once a second so the recovery countdown stays live (the vitals store
  // only commits on change, which isn't every second while frozen at 0 HP).
  useEffect(() => {
    const iv = setInterval(() => tickNow(t => t + 1), 1000)
    return () => { clearInterval(iv); if (adTimer.current) clearTimeout(adTimer.current) }
  }, [])

  const ko       = vitals.ko
  const remaining = vitals.koMsRemaining
  const cost      = KO_HUSTLE_PER_LEVEL * Math.max(1, level)
  const canAfford = hustle >= cost

  const watchAds = () => {
    if (adPlaying) return
    sfx.tap?.()
    setAdPlaying(true)
    // Stub for a rewarded-ad SDK: simulate the ad, then heal to full.
    adTimer.current = setTimeout(() => { reviveNow(); sfx.win?.(); setAdPlaying(false) }, 1600)
  }

  const payHustle = () => {
    if (!canAfford) { sfx.deny?.(); return }
    if (spendHustle(cost)) { reviveNow(); sfx.win?.() }
  }

  return (
    <div className="scroll-area animate-in">
      {/* Header / back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 0' }}>
        <button onClick={onBack}
          style={{ background: 'transparent', border: '0.5px solid #2a2a3a', borderRadius: 8, color: GOLD, padding: '6px 10px', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer' }}>
          <i className="ti ti-arrow-left" /> Back
        </button>
        <div style={{ color: GOLD, fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>THE NURSE</div>
      </div>

      {/* Nurse portrait — same cinematic hero treatment as the player-card open
          view: full-width 280px portrait, cover/center-top, bottom gradient,
          accent top stripe. */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ position: 'relative', width: '100%', height: 280, overflow: 'hidden', borderRadius: 16, background: '#0d0d15' }}>
          <img src={`${process.env.PUBLIC_URL || ''}/nurse.jpg`} alt="The prison nurse"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, background: 'linear-gradient(180deg, transparent 0%, rgba(10,10,15,0.6) 50%, #0a0a0f 100%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: ko ? RED : GREEN }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 16px 12px' }}>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Infirmary</div>
            <div style={{ color: '#cfcfd6', fontSize: 12, fontStyle: 'italic', marginTop: 2 }}>
              {ko ? '“You got laid out. Hold still — let’s get you back on your feet.”'
                  : '“You’re patched up. Stay out of trouble.”'}
            </div>
          </div>
        </div>
      </div>

      {ko ? (
        <>
          {/* Status: KO + recovery countdown */}
          <div style={{ padding: '14px 16px 0' }}>
            <div style={{ background: `linear-gradient(135deg, #2a0a0a, #130a0f)`, border: `1px solid ${RED}55`, borderRadius: 16, padding: 16, textAlign: 'center' }}>
              <div style={{ color: RED, fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>
                <i className="ti ti-skull" style={{ marginRight: 6 }} />DEFEATED
              </div>
              <div style={{ color: '#fff', fontSize: 34, fontWeight: 800, marginTop: 10, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>
                {fmt(remaining)}
              </div>
              <div style={{ color: '#888', fontSize: 11, marginTop: 4, letterSpacing: 0.5 }}>UNTIL YOU’RE BACK ON YOUR FEET</div>
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: '#888', fontSize: 10 }}>Health</span>
                  <span style={{ color: RED, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>0 / {vitals.healthMax.toLocaleString()}</span>
                </div>
                <div style={{ height: 5, background: '#1e1e2a', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '0%', background: RED }} />
                </div>
              </div>
            </div>
          </div>

          {/* Recovery options */}
          <div className="section" style={{ marginTop: 16 }}>
            <div className="section-label">Get back in the fight</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Watch ads → full health */}
              <button onClick={watchAds} disabled={adPlaying}
                style={optionBtn(GREEN, adPlaying)}>
                <div style={iconBox(GREEN)}><i className={`ti ${adPlaying ? 'ti-loader-2' : 'ti-player-play-filled'}`} style={{ fontSize: 20 }} /></div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{adPlaying ? 'Playing ad…' : 'Watch Ads'}</div>
                  <div style={{ color: '#888', fontSize: 11, marginTop: 1 }}>Heal to full, free</div>
                </div>
                <span style={pill(GREEN)}>FULL HEAL</span>
              </button>

              {/* Pay Hustle → full health (5,000 × level) */}
              <button onClick={payHustle} disabled={!canAfford || adPlaying}
                style={optionBtn(GOLD, !canAfford || adPlaying)}>
                <div style={iconBox(GOLD)}><i className="ti ti-coin" style={{ fontSize: 20 }} /></div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>Pay the Nurse</div>
                  <div style={{ color: canAfford ? '#888' : RED, fontSize: 11, marginTop: 1 }}>
                    {canAfford ? `You have ${hustle.toLocaleString()} Hustle` : `Need ${cost.toLocaleString()} — you have ${hustle.toLocaleString()}`}
                  </div>
                </div>
                <span style={pill(GOLD)}>{cost.toLocaleString()}</span>
              </button>

              {/* Wait it out */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 14, padding: '12px 14px' }}>
                <div style={iconBox(BLUE)}><i className="ti ti-clock" style={{ fontSize: 20 }} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>Wait it out</div>
                  <div style={{ color: '#888', fontSize: 11, marginTop: 1 }}>Auto-heal in {fmt(remaining)} — free</div>
                </div>
              </div>

            </div>
            <div style={{ color: DIM, fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
              The cost to patch up is 5,000 Hustle per level. Costs more the bigger you get.
            </div>
          </div>
        </>
      ) : (
        // Healthy — nothing to fix.
        <div className="section" style={{ marginTop: 16 }}>
          <div style={{ background: '#13131f', border: `0.5px solid ${GREEN}44`, borderRadius: 16, padding: 22, textAlign: 'center' }}>
            <i className="ti ti-heart" style={{ color: GREEN, fontSize: 34 }} />
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, marginTop: 8 }}>You’re in good shape</div>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Full health, {vitals.health.toLocaleString()} / {vitals.healthMax.toLocaleString()}. Get back out there.</div>
            <button onClick={onBack} className="btn btn-gold" style={{ marginTop: 16, padding: '12px 20px' }}>Back to the yard</button>
          </div>
        </div>
      )}
    </div>
  )
}

function optionBtn(color, disabled) {
  return {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    background: disabled ? '#13131f' : '#16161f',
    border: `1px solid ${disabled ? '#2a2a3a' : color + '66'}`,
    borderRadius: 14, padding: '12px 14px', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1, textAlign: 'left',
  }
}
function iconBox(color) {
  return { width: 40, height: 40, borderRadius: 11, background: `${color}1f`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
}
function pill(color) {
  return { background: `${color}1f`, border: `0.5px solid ${color}66`, color, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, padding: '4px 8px', borderRadius: 8, flexShrink: 0 }
}
