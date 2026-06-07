import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useProgress, getProgress } from '../state/progressionStore'
import { useDailyBonus, getDailyStatus, claimDaily, DAILY_REWARDS, hustleReward, STREAK_LEN } from '../state/dailyBonusStore'
import { sfx } from '../sounds'

// Daily login bonus — lives on Home so it's the first thing seen each launch.
// Auto-pops the 7-day calendar once per day when a reward is available; a small
// banner stays as the persistent entry point (and shows the streak/claim state).
// Days 1-6 pay scaling Hustle, Day 7 is a Commissary Pack; miss a day → reset.

const GOLD = '#c9a84c'

export function DailyBonus() {
  useDailyBonus()                                   // re-render on claim
  const status = getDailyStatus()
  // Auto-open on mount if today's reward is unclaimed.
  const [open, setOpen] = useState(() => getDailyStatus().claimable)

  return (
    <div className="section" style={{ marginTop: 14 }}>
      <div className="section-label">Daily Bonus</div>
      <div
        onClick={() => { sfx.tap?.(); setOpen(true) }}
        className="card"
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, cursor: 'pointer' }}
      >
        <div style={{
          width: 46, height: 46, borderRadius: 12, flexShrink: 0,
          background: status.claimable ? `${GOLD}22` : '#1e1e2a',
          border: `0.5px solid ${status.claimable ? `${GOLD}66` : '#2a2a3a'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, animation: status.claimable ? 'btnPulse 1.8s ease-in-out infinite' : 'none',
        }}>🎁</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Daily Bonus</div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
            {status.claimable
              ? `Day ${status.pendingDay} reward ready`
              : `Day ${status.streak}/${STREAK_LEN} claimed · come back tomorrow`}
          </div>
        </div>
        {status.claimable
          ? <div className="btn btn-gold" style={{ padding: '8px 14px', fontSize: 13, pointerEvents: 'none' }}>Claim</div>
          : <i className="ti ti-check" style={{ color: '#3fb950', fontSize: 20 }} />}
      </div>

      {open && <DailyBonusModal onClose={() => setOpen(false)} />}
    </div>
  )
}

function DailyBonusModal({ onClose }) {
  useDailyBonus()
  const level = useProgress().level || 1
  const status = getDailyStatus()
  const [reward, setReward] = useState(null)        // set after a claim, for the flash

  const doClaim = () => {
    const got = claimDaily(getProgress().level || 1)
    if (!got) return
    setReward(got)
    got.packs ? sfx.burst?.() : sfx.buy?.()
  }

  const close = () => { sfx.tap?.(); onClose() }

  return createPortal((
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,6,10,0.92)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380, background: 'linear-gradient(160deg,#15110a,#1c1608)', border: `0.5px solid ${GOLD}44`, borderRadius: 22, padding: '22px 18px 18px', position: 'relative', textAlign: 'center' }}>
        <button onClick={close} aria-label="Close" style={{
          position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 9,
          background: '#1e1e2a', border: '0.5px solid #2a2a3a', color: '#fff', fontSize: 16, cursor: 'pointer',
        }}><i className="ti ti-x" /></button>

        <div style={{ fontSize: 40, marginBottom: 4 }}>🎁</div>
        <div style={{ color: GOLD, fontSize: 19, fontWeight: 700 }}>Daily Bonus</div>
        <div style={{ color: '#888', fontSize: 12, marginTop: 3, marginBottom: 16 }}>
          Log in daily — Day {STREAK_LEN} is a Commissary Pack. Miss a day and the streak resets.
        </div>

        {/* 7-day calendar: 4 + 3 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
          {DAILY_REWARDS.map((r) => {
            const claimed   = r.day <= status.claimedThisCycle
            const isPending = status.claimable && r.day === status.pendingDay
            const isPack    = !!r.packs
            const big       = r.day === STREAK_LEN
            return (
              <div key={r.day} style={{
                gridColumn: big ? 'span 4' : 'span 1',
                background: isPending ? `${GOLD}1f` : '#0f0f17',
                border: `1px solid ${isPending ? GOLD : claimed ? '#3fb95055' : '#23232f'}`,
                borderRadius: 12, padding: '8px 4px', position: 'relative', opacity: claimed ? 0.55 : 1,
                display: 'flex', flexDirection: big ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: big ? 8 : 3,
              }}>
                <div style={{ color: '#777', fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>DAY {r.day}</div>
                <div style={{ fontSize: isPack ? 22 : 18 }}>{isPack ? '🎴' : '💵'}</div>
                <div style={{ color: isPack ? GOLD : '#cfcfd6', fontSize: big ? 12 : 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {isPack ? '1 Pack' : `+${hustleReward(r.hustleMult, level).toLocaleString()}`}
                </div>
                {claimed && (
                  <div style={{ position: 'absolute', top: 4, right: 4, color: '#3fb950', fontSize: 12 }}>
                    <i className="ti ti-circle-check-filled" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {reward ? (
          <>
            <div style={{ color: '#3fb950', fontSize: 15, fontWeight: 700, marginBottom: 12, animation: 'logLineIn 0.4s ease forwards' }}>
              {reward.packs ? 'Commissary Pack added to your stash!' : `+${reward.hustle.toLocaleString()} Hustle claimed!`}
            </div>
            <button className="btn btn-primary btn-full" style={{ padding: 13 }} onClick={close}>Awesome</button>
          </>
        ) : status.claimable ? (
          <button className="btn btn-gold btn-full" style={{ padding: 14, fontSize: 15, fontWeight: 700 }} onClick={doClaim}>
            Claim Day {status.pendingDay}
          </button>
        ) : (
          <div style={{ color: '#777', fontSize: 13, padding: '6px 0' }}>Come back tomorrow for Day {status.streak >= STREAK_LEN ? 1 : status.streak + 1}.</div>
        )}
      </div>
    </div>
  ), document.body)
}
