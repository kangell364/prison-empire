import React, { useState, useEffect, useRef } from 'react'
import { useVitals, reviveNow, refillStamina, KO_HUSTLE_PER_LEVEL, STAMINA_HUSTLE_PER_LEVEL } from '../state/vitalsStore'
import { useProgress } from '../state/progressionStore'
import { useHustle, spendHustle } from '../state/profileStore'
import { sfx } from '../sounds'

const GOLD  = '#c9a84c'
const RED   = '#e74c3c'
const GREEN = '#2ecc71'
const BLUE  = '#4a9eff'

// HH:MM:SS countdown for the 24h KO recovery clock.
function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const p = n => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(sec)}`
}

// The Nurse — recover both pools. Reached from the Home Health/Stamina tiles.
//   Health: KO = 24h clock + revive (ads / Hustle / wait); banged up = patch up.
//   Stamina: refuel (ads / Hustle / rest).
// Pay-to-restore scales with how much is missing.
export default function Nurse({ onBack }) {
  const vitals = useVitals()
  const level  = Math.max(1, useProgress().level)
  const hustle = useHustle()
  const [, tickNow] = useState(0)
  const [adFor, setAdFor] = useState(null)   // 'health' | 'stamina' | null
  const adTimer = useRef(null)

  // Tick once a second so the KO countdown / bars stay live.
  useEffect(() => {
    const iv = setInterval(() => tickNow(t => t + 1), 1000)
    return () => { clearInterval(iv); if (adTimer.current) clearTimeout(adTimer.current) }
  }, [])

  const ko = vitals.ko
  const remaining = vitals.koMsRemaining

  const hMax = vitals.healthMax, h = vitals.health
  const sMax = vitals.staminaMax, s = vitals.stamina
  const healthLow  = h < hMax
  const staminaLow = s < sMax
  const hPct = Math.max(0, Math.min(100, Math.round(h / Math.max(1, hMax) * 100)))
  const sPct = Math.max(0, Math.min(100, Math.round(s / Math.max(1, sMax) * 100)))

  // Pay-to-restore: proportional to the missing amount (KO health = 0, so the
  // health formula lands on the full 5k × level price).
  const healthCost  = Math.max(500, Math.round(KO_HUSTLE_PER_LEVEL * level * (hMax - h) / Math.max(1, hMax)))
  const staminaCost = Math.max(200, Math.round(STAMINA_HUSTLE_PER_LEVEL * level * (sMax - s) / Math.max(1, sMax)))

  const playAd = (which, action) => {
    if (adFor) return
    sfx.tap?.()
    setAdFor(which)
    // Stub for a rewarded-ad SDK: simulate the ad, then restore to full.
    adTimer.current = setTimeout(() => { action(); sfx.win?.(); setAdFor(null) }, 1600)
  }
  const pay = (cost, action) => {
    if (hustle < cost) { sfx.deny?.(); return }
    if (spendHustle(cost)) { action(); sfx.win?.() }
  }

  const accent = ko ? RED : (healthLow || staminaLow) ? GOLD : GREEN

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

      {/* Nurse portrait */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ position: 'relative', width: '100%', height: 280, overflow: 'hidden', borderRadius: 16, background: '#0d0d15' }}>
          <img src={`${process.env.PUBLIC_URL || ''}/nurse.jpg`} alt="The prison nurse"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, background: 'linear-gradient(180deg, transparent 0%, rgba(10,10,15,0.6) 50%, #0a0a0f 100%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 16px 12px' }}>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Infirmary</div>
            <div style={{ color: '#cfcfd6', fontSize: 12, fontStyle: 'italic', marginTop: 2 }}>
              {ko ? '“You got laid out. Hold still — let’s get you back on your feet.”'
                  : (healthLow || staminaLow) ? '“You’re looking rough. Let’s get you sorted.”'
                  : '“You’re patched up. Stay out of trouble.”'}
            </div>
          </div>
        </div>
      </div>

      {/* HEALTH recovery */}
      {healthLow && (
        <div className="section" style={{ marginTop: 16 }}>
          {ko ? (
            <div style={{ background: 'linear-gradient(135deg, #2a0a0a, #130a0f)', border: `1px solid ${RED}55`, borderRadius: 16, padding: 16, textAlign: 'center', marginBottom: 12 }}>
              <div style={{ color: RED, fontSize: 12, fontWeight: 800, letterSpacing: 2 }}><i className="ti ti-skull" style={{ marginRight: 6 }} />DEFEATED</div>
              <div style={{ color: '#fff', fontSize: 34, fontWeight: 800, marginTop: 10, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>{fmt(remaining)}</div>
              <div style={{ color: '#888', fontSize: 11, marginTop: 4, letterSpacing: 0.5 }}>UNTIL YOU’RE BACK ON YOUR FEET</div>
              <PoolBar label="Health" cur={h} max={hMax} pct={hPct} color={RED} />
            </div>
          ) : (
            <div style={{ background: '#13131f', border: `1px solid ${RED}44`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <div style={{ color: RED, fontSize: 12, fontWeight: 800, letterSpacing: 2 }}><i className="ti ti-heart" style={{ marginRight: 6 }} />HEALTH</div>
              <PoolBar label="Health" cur={h} max={hMax} pct={hPct} color={RED} />
            </div>
          )}
          <div className="section-label">{ko ? 'Get back in the fight' : 'Patch up'}</div>
          <RestoreOptions
            adPlaying={adFor === 'health'} disabled={!!adFor}
            cost={healthCost} hustle={hustle}
            onAds={() => playAd('health', reviveNow)}
            onPay={() => pay(healthCost, reviveNow)}
            waitTitle={ko ? 'Wait it out' : 'Rest it off'}
            waitNote={ko ? `Auto-heal in ${fmt(remaining)} — free` : 'Refills on its own over time — free'}
          />
        </div>
      )}

      {/* STAMINA recovery */}
      {staminaLow && (
        <div className="section" style={{ marginTop: 16 }}>
          <div style={{ background: '#13131f', border: `1px solid ${GOLD}44`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <div style={{ color: GOLD, fontSize: 12, fontWeight: 800, letterSpacing: 2 }}><i className="ti ti-bolt" style={{ marginRight: 6 }} />STAMINA</div>
            <PoolBar label="Stamina" cur={s} max={sMax} pct={sPct} color={GOLD} />
          </div>
          <div className="section-label">Refuel</div>
          <RestoreOptions
            adPlaying={adFor === 'stamina'} disabled={!!adFor}
            cost={staminaCost} hustle={hustle}
            onAds={() => playAd('stamina', refillStamina)}
            onPay={() => pay(staminaCost, refillStamina)}
            waitTitle="Rest it off"
            waitNote="Refills on its own over time — free"
          />
        </div>
      )}

      {/* All good */}
      {!healthLow && !staminaLow && (
        <div className="section" style={{ marginTop: 16 }}>
          <div style={{ background: '#13131f', border: `0.5px solid ${GREEN}44`, borderRadius: 16, padding: 22, textAlign: 'center' }}>
            <i className="ti ti-heart" style={{ color: GREEN, fontSize: 34 }} />
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, marginTop: 8 }}>You’re in good shape</div>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Health {h.toLocaleString()}/{hMax.toLocaleString()} · Stamina {s.toLocaleString()}/{sMax.toLocaleString()}. Get back out there.</div>
            <button onClick={onBack} className="btn btn-gold" style={{ marginTop: 16, padding: '12px 20px' }}>Back to the yard</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Shared restore options (watch ads → full, pay Hustle → full, or wait). Used
// for both the health and stamina cards.
function RestoreOptions({ adPlaying, disabled, cost, hustle, onAds, onPay, waitTitle, waitNote }) {
  const canAfford = hustle >= cost
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button onClick={onAds} disabled={disabled} style={optionBtn(GREEN, disabled)}>
        <div style={iconBox(GREEN)}><i className={`ti ${adPlaying ? 'ti-loader-2' : 'ti-player-play-filled'}`} style={{ fontSize: 20 }} /></div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{adPlaying ? 'Playing ad…' : 'Watch Ads'}</div>
          <div style={{ color: '#888', fontSize: 11, marginTop: 1 }}>Restore to full, free</div>
        </div>
        <span style={pill(GREEN)}>FULL</span>
      </button>
      <button onClick={onPay} disabled={!canAfford || disabled} style={optionBtn(GOLD, !canAfford || disabled)}>
        <div style={iconBox(GOLD)}><i className="ti ti-coin" style={{ fontSize: 20 }} /></div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>Pay the Nurse</div>
          <div style={{ color: canAfford ? '#888' : RED, fontSize: 11, marginTop: 1 }}>
            {canAfford ? `Restore to full · you have ${hustle.toLocaleString()} Hustle` : `Need ${cost.toLocaleString()} — you have ${hustle.toLocaleString()}`}
          </div>
        </div>
        <span style={pill(GOLD)}>{cost.toLocaleString()}</span>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#13131f', border: '0.5px solid #2a2a3a', borderRadius: 14, padding: '12px 14px' }}>
        <div style={iconBox(BLUE)}><i className="ti ti-clock" style={{ fontSize: 20 }} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{waitTitle}</div>
          <div style={{ color: '#888', fontSize: 11, marginTop: 1 }}>{waitNote}</div>
        </div>
      </div>
    </div>
  )
}

function PoolBar({ label, cur, max, pct, color }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: '#888', fontSize: 10 }}>{label}</span>
        <span style={{ color, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{cur.toLocaleString()} / {max.toLocaleString()}</span>
      </div>
      <div style={{ height: 5, background: '#1e1e2a', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.4s' }} />
      </div>
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
