// SlotMachine — a 5×3 reel slot in the Trap House casino. Symbols are CREW faces;
// the jackpot is the "baddie" player-look card. EARN-ONLY Hustle sink: you bet
// Hustle, winnings are Hustle, no cash-out — a ~8% house edge quietly burns
// surplus cash from players who have more than they need. Math + RTP live in
// src/data/slotConfig.js (Monte-Carlo verified).

import React, { useEffect, useRef, useState } from 'react'
import { useHustle, spendHustle, addHustle } from '../state/profileStore'
import { SYMBOLS, SYM_BY_ID, drawGrid, evaluateSpin, PAYLINES, REELS } from '../data/slotConfig'
import { sfx } from '../sounds'

const GOLD = '#e0b33a'
const BETS = [100, 1000, 10000, 100000]
const fmt = (n) => n.toLocaleString()
const randId = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id

function Reel({ symbols, spinningCol, winRows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
      {symbols.map((id, row) => {
        const s = SYM_BY_ID[id]
        const win = winRows.has(row)
        return (
          <div key={row} style={{
            position: 'relative', aspectRatio: '1', borderRadius: 9, overflow: 'hidden',
            border: `1.5px solid ${win ? GOLD : '#2a2a36'}`,
            boxShadow: win ? `0 0 12px ${GOLD}, inset 0 0 8px ${GOLD}66` : 'inset 0 0 8px rgba(0,0,0,0.6)',
            background: '#0b0b12', transition: 'border-color .15s, box-shadow .15s',
            filter: spinningCol ? 'blur(1.2px)' : 'none',
          }}>
            <img src={s.img} alt={s.name} draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: win ? 1 : 0.96 }} />
            {s.jackpot && <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 10px ${GOLD}99`, pointerEvents: 'none' }} />}
          </div>
        )
      })}
    </div>
  )
}

export function SlotMachine({ cash = 0, onCashDelta }) {
  const hustle = useHustle()
  const [grid, setGrid] = useState(() => drawGrid())
  const [spinCols, setSpinCols] = useState(() => Array(REELS).fill(false))
  const [winCells, setWinCells] = useState(() => new Set())
  const [lastWin, setLastWin] = useState(null)   // { total } after a spin
  const [jackpot, setJackpot] = useState(false)
  const [betIdx, setBetIdx] = useState(0)
  // Bet in CASH (Trap House bank) or HUSTLE (global) — default to whichever you
  // have more of, so the slot burns your surplus. Toggle to switch.
  const [ccy, setCcy] = useState(() => (cash >= hustle ? 'cash' : 'hustle'))
  const flick = useRef([])
  const stops = useRef([])
  const spinningRef = useRef(false)

  const bet = BETS[betIdx]
  const balance = ccy === 'cash' ? cash : hustle
  const canAfford = balance >= bet
  const ccyLabel = ccy === 'cash' ? 'Cash' : 'Hustle'
  const takeBet = (amt) => { if (ccy === 'cash') onCashDelta && onCashDelta(-amt); else spendHustle(amt) }
  const payOut  = (amt) => { if (ccy === 'cash') onCashDelta && onCashDelta(amt); else addHustle(amt) }

  useEffect(() => () => { flick.current.forEach(clearInterval); stops.current.forEach(clearTimeout) }, [])

  const spin = () => {
    if (spinningRef.current) return
    if (balance < bet) { sfx.deny?.(); return }
    takeBet(bet)
    sfx.tap?.()
    spinningRef.current = true
    setLastWin(null); setJackpot(false); setWinCells(new Set())
    setSpinCols(Array(REELS).fill(true))
    const target = drawGrid()

    // Flicker each reel's faces fast for the "spinning" blur.
    flick.current.forEach(clearInterval)
    flick.current = []
    for (let r = 0; r < REELS; r++) {
      flick.current[r] = setInterval(() => {
        setGrid(g => { const ng = g.map(c => c.slice()); ng[r] = [randId(), randId(), randId()]; return ng })
      }, 70)
    }
    // Stop reels left-to-right, staggered, with a thunk.
    stops.current.forEach(clearTimeout)
    stops.current = []
    for (let r = 0; r < REELS; r++) {
      stops.current[r] = setTimeout(() => {
        clearInterval(flick.current[r])
        setGrid(g => { const ng = g.map(c => c.slice()); ng[r] = target[r].slice(); return ng })
        setSpinCols(c => { const n = c.slice(); n[r] = false; return n })
        sfx.tap?.()
        if (r === REELS - 1) finish(target)
      }, 650 + r * 300)
    }
  }

  const finish = (target) => {
    spinningRef.current = false
    const { total, wins } = evaluateSpin(target, bet)
    if (total > 0) {
      payOut(total)
      const cells = new Set()
      wins.forEach(w => { for (let r = 0; r < w.count; r++) cells.add(`${r}_${PAYLINES[w.line][r]}`) })
      setWinCells(cells)
      setLastWin({ total })
      if (wins.some(w => w.jackpot)) { setJackpot(true); sfx.boom?.() } else sfx.buy?.()
    } else {
      setLastWin({ total: 0 })
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 0%, #241a2e 0%, #0c0a12 60%, #08070c 100%)', overflowY: 'auto' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '64px 16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Title + balance */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 2, color: GOLD, textShadow: `0 0 16px ${GOLD}88` }}>🎰 SLOTS</div>
          {/* Pick the currency to bet — defaults to whichever you have more of. */}
          <div style={{ display: 'inline-flex', gap: 6, marginTop: 6 }}>
            {['cash', 'hustle'].map(c => {
              const on = ccy === c
              const val = c === 'cash' ? cash : hustle
              return (
                <button key={c} onClick={() => { if (!spinningRef.current) { setCcy(c); sfx.tap?.() } }} style={{
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  background: on ? `${GOLD}22` : 'rgba(0,0,0,0.5)', border: `1px solid ${on ? GOLD : '#2a2a36'}`,
                  borderRadius: 20, padding: '5px 13px',
                }}>
                  <i className={`ti ${c === 'cash' ? 'ti-cash' : 'ti-coin'}`} style={{ color: on ? GOLD : '#888', fontSize: 14 }} />
                  <span style={{ color: on ? '#fff' : '#999', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(val)}</span>
                  <span style={{ color: '#777', fontSize: 10 }}>{c === 'cash' ? 'Cash' : 'Hustle'}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Reels */}
        <div style={{ display: 'flex', gap: 4, padding: 10, borderRadius: 16, background: 'linear-gradient(180deg, #15101d, #0a0810)', border: `2px solid ${GOLD}55`, boxShadow: `0 0 24px ${GOLD}22, inset 0 2px 12px rgba(0,0,0,0.7)` }}>
          {grid.map((col, r) => (
            <Reel key={r} symbols={col} spinningCol={spinCols[r]}
              winRows={new Set([...winCells].filter(k => k.startsWith(`${r}_`)).map(k => Number(k.split('_')[1])))} />
          ))}
        </div>

        {/* Win / status banner */}
        <div style={{ textAlign: 'center', minHeight: 26 }}>
          {lastWin == null
            ? <span style={{ color: '#777', fontSize: 13 }}>Match 3+ across a line. 5 Baddies = JACKPOT.</span>
            : lastWin.total > 0
              ? <span style={{ color: GOLD, fontSize: 20, fontWeight: 900, textShadow: `0 0 12px ${GOLD}` }}>WIN +{fmt(lastWin.total)}</span>
              : <span style={{ color: '#777', fontSize: 13 }}>No win — spin again.</span>}
        </div>

        {/* Bet selector + spin */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.45)', border: '1px solid #2a2a36', borderRadius: 12, padding: '6px 8px' }}>
            <button onClick={() => { setBetIdx(i => Math.max(0, i - 1)); sfx.tap?.() }} disabled={betIdx === 0} style={betBtn}>−</button>
            <div style={{ textAlign: 'center', minWidth: 70 }}>
              <div style={{ color: '#888', fontSize: 8, fontWeight: 700, letterSpacing: 1 }}>BET</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(bet)}</div>
            </div>
            <button onClick={() => { setBetIdx(i => Math.min(BETS.length - 1, i + 1)); sfx.tap?.() }} disabled={betIdx === BETS.length - 1} style={betBtn}>+</button>
          </div>
          <button onClick={spin} disabled={!canAfford}
            style={{ flex: 1, padding: '15px 0', borderRadius: 14, border: 'none', fontSize: 17, fontWeight: 900, letterSpacing: 1,
              cursor: canAfford ? 'pointer' : 'not-allowed',
              background: canAfford ? `linear-gradient(180deg, ${GOLD}, #b8862a)` : '#2a2a36',
              color: canAfford ? '#1a1206' : '#666', boxShadow: canAfford ? `0 4px 16px ${GOLD}55` : 'none' }}>
            {canAfford ? 'SPIN' : `NOT ENOUGH ${ccyLabel.toUpperCase()}`}
          </button>
        </div>

        {/* Jackpot teaser / paytable hint */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.4)', border: `1px solid ${GOLD}33`, borderRadius: 12, padding: 10 }}>
          <img src="/player-look-153.jpg" alt="jackpot" style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'cover', border: `1.5px solid ${GOLD}`, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: GOLD, fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>BADDIE JACKPOT</div>
            <div style={{ color: '#999', fontSize: 11, lineHeight: 1.35, marginTop: 1 }}>Line up 5 Baddies for the 3,000× jackpot. 3 or 4 pay big too.</div>
          </div>
        </div>
      </div>

      {/* Jackpot splash */}
      {jackpot && (
        <div onClick={() => setJackpot(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.86)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 10, cursor: 'pointer' }}>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 3, color: GOLD, textShadow: `0 0 24px ${GOLD}` }}>JACKPOT!</div>
          <img src="/player-look-153.jpg" alt="jackpot" style={{ width: 200, maxWidth: '70%', borderRadius: 16, border: `3px solid ${GOLD}`, boxShadow: `0 0 40px ${GOLD}` }} />
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 900 }}>+{fmt(lastWin?.total || 0)} {ccyLabel}</div>
          <div style={{ color: '#888', fontSize: 12 }}>tap to continue</div>
        </div>
      )}
    </div>
  )
}

const betBtn = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid #3a3a46', background: '#1a1a24',
  color: '#fff', fontSize: 18, fontWeight: 800, cursor: 'pointer', lineHeight: 1,
}
