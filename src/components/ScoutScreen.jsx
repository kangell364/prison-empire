import React from 'react'
import { ALL_CITIES, FACILITY_TIERS, PLAYER } from '../data/gameData'
import { useDisplayName } from '../state/profileStore'
import { useCash } from '../state/cashStore'
import {
  useTerritories, effectiveLoyalty, pendingIncome, collect,
  tierIncome, holderPower, LOYALTY_MAX, HIT_DAMAGE,
  reinforce, reinforceCost, REINFORCE_AMOUNT,
} from '../state/territoriesStore'

const GOLD  = '#c9a84c'
const RED   = '#e74c3c'
const BLUE  = '#4a9eff'
const GREEN = '#42d778'
const DIM   = '#555'

// Tier badge colors — escalate from drab county jail to gold supermax.
const TIER_COLOR = { 1: '#7f8c8d', 2: BLUE, 3: '#a855f7', 4: GOLD }

const CITY_BY_ID = new Map(ALL_CITIES.map(c => [c.id, c]))

// Scout/capture screen — tap a facility to open it. Three states (vacant /
// rival-held / yours), a tier badge, the loyalty bar (capture progress), the
// holder's gang strength vs yours, and the right action (Claim / Attack /
// Collect). Bottom-sheet to match the rest of the map's modals.
export function ScoutScreen({ facility, inFlight, incomingRaid, onAttack, onClose }) {
  const territories = useTerritories()
  const playerName  = useDisplayName()
  const cash        = useCash()
  if (!facility) return null

  const rec     = territories[facility.id] || null
  const owner   = rec?.owner ?? null
  const isYours = owner === 'you'
  const isVacant = owner === null
  const loyalty = effectiveLoyalty(rec)
  const tier    = FACILITY_TIERS[facility.tier] || FACILITY_TIERS[1]
  const tierColor = TIER_COLOR[facility.tier] || GOLD
  const income  = tierIncome(facility.tier)
  const city    = CITY_BY_ID.get(facility.cityId)

  const yourPower  = PLAYER.power
  const theirPower = holderPower(facility.id)
  const favored    = yourPower >= theirPower
  const hitsToFlip = Math.max(1, Math.ceil(loyalty / HIT_DAMAGE))
  const pending    = pendingIncome(facility.id)
  const reinCost   = reinforceCost(facility.id)
  const canAfford  = cash >= reinCost
  const atMaxDef   = loyalty >= LOYALTY_MAX

  return (
    <div className="app-overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 220,
    }} onClick={onClose}>
      <div style={{
        background: '#13131f', borderRadius: '24px 24px 0 0', padding: 24,
        width: '100%', maxWidth: 390,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '0 auto 18px' }} />

        {/* Header: type label (left) + tier badge (right) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: DIM, fontSize: 10, letterSpacing: 2, fontWeight: 700, marginTop: 6 }}>FACILITY</span>
          <span style={{
            background: `${tierColor}1f`, border: `0.5px solid ${tierColor}66`, color: tierColor,
            padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 800, letterSpacing: 1,
          }}>{tier.label.toUpperCase()}</span>
        </div>

        <div style={{ color: '#fff', fontSize: 22, fontWeight: 600 }}>{facility.name}</div>
        {city && <div style={{ color: '#888', fontSize: 12, marginBottom: 14 }}>{city.name}, {city.state}</div>}

        {/* Income preview */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
            <div style={{ color: GOLD, fontSize: 18, fontWeight: 500 }}>+{income.hustlePerHr}</div>
            <div style={{ color: DIM, fontSize: 11 }}>Hustle/hr</div>
          </div>
          <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, textAlign: 'center' }}>
            <div style={{ color: GREEN, fontSize: 18, fontWeight: 500 }}>+{income.cashPerHr}</div>
            <div style={{ color: DIM, fontSize: 11 }}>Cash/hr</div>
          </div>
        </div>

        {/* State-dependent middle */}
        {isVacant && (
          <div style={{ background: '#0d1a0d', border: '0.5px solid #2d6a2d', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div style={{ color: '#2ecc71', fontSize: 13, fontWeight: 600 }}>Unclaimed Territory</div>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>No gang holds this. Plant your flag with one drive-by.</div>
          </div>
        )}

        {!isVacant && (
          <>
            {/* Holder + power comparison */}
            <div style={{ background: '#1e1e2a', borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <div style={{ color: '#888', fontSize: 12 }}>{isYours ? 'Held by' : 'Controlled by'}</div>
              <div style={{ color: isYours ? GOLD : RED, fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                {isYours ? `${playerName} (You)` : owner}
              </div>
              {!isYours && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 12 }}>
                  <span style={{ color: '#888' }}>Gang strength</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>
                    You {yourPower.toLocaleString()} · Them {theirPower.toLocaleString()}{' '}
                    <span style={{ color: favored ? '#2ecc71' : RED, fontWeight: 700 }}>
                      — {favored ? 'Favored' : 'Outgunned'}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* Loyalty / defense bar — the capture-progress mechanic */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ color: '#888', fontSize: 11, letterSpacing: 0.5 }}>DEFENSE</span>
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{loyalty}/{LOYALTY_MAX}</span>
              </div>
              <div style={{ height: 8, background: '#0a0a0f', borderRadius: 4, overflow: 'hidden', border: '0.5px solid #2a2a3a' }}>
                <div style={{
                  height: '100%', width: `${loyalty}%`, borderRadius: 4,
                  background: isYours ? `linear-gradient(90deg, ${GOLD}, #f0d080)` : `linear-gradient(90deg, ${RED}, #ff7a6a)`,
                  transition: 'width 0.4s',
                }} />
              </div>
              {!isYours && (
                <div style={{ color: DIM, fontSize: 11, marginTop: 6 }}>
                  ≈{hitsToFlip} more {hitsToFlip === 1 ? 'drive-by' : 'drive-bys'} to flip it · regenerates over time
                </div>
              )}
            </div>
          </>
        )}

        {/* Yours + under raid: urgent warning */}
        {isYours && incomingRaid && (
          <div style={{ background: '#2a0a0a', border: `0.5px solid ${RED}88`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ color: RED, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-alert-triangle-filled" /> {incomingRaid.gang} raid incoming
            </div>
            <div style={{ color: '#c88', fontSize: 12, marginTop: 4 }}>
              They'll knock {HIT_DAMAGE} off your defense. Reinforce now or risk losing it.
            </div>
          </div>
        )}

        {/* Yours: reinforce defense */}
        {isYours && (
          <button
            className="btn btn-dark btn-full"
            style={{ padding: 14, marginBottom: 10, opacity: atMaxDef || !canAfford ? 0.5 : 1,
                     border: incomingRaid ? `1px solid ${GOLD}` : undefined }}
            disabled={atMaxDef || !canAfford}
            onClick={() => { reinforce(facility.id) }}
          >
            <i className="ti ti-shield-plus" /> {atMaxDef
              ? 'Defense Maxed'
              : !canAfford
                ? `Reinforce — need $${reinCost.toLocaleString()}`
                : `Reinforce +${REINFORCE_AMOUNT} Def — $${reinCost.toLocaleString()}`}
          </button>
        )}

        {/* Yours: collect income */}
        {isYours && (
          <button
            className="btn btn-gold btn-full"
            style={{ padding: 14, marginBottom: 10, opacity: pending.hustle + pending.cash > 0 ? 1 : 0.5 }}
            disabled={pending.hustle + pending.cash === 0}
            onClick={() => collect(facility.id)}
          >
            <i className="ti ti-coin" /> {pending.hustle + pending.cash > 0
              ? `Collect +${pending.hustle.toLocaleString()} Hustle · +$${pending.cash.toLocaleString()}`
              : 'Nothing to collect yet'}
          </button>
        )}

        {/* Vacant / rival: attack */}
        {!isYours && (
          inFlight ? (
            <button className="btn btn-gold btn-full" style={{ padding: 14, marginBottom: 10, opacity: 0.5 }} disabled>
              <i className="ti ti-sword" /> Drive By En Route
            </button>
          ) : (
            <button className="btn btn-gold btn-full" style={{ padding: 14, marginBottom: 10 }} onClick={() => onAttack(facility)}>
              <i className="ti ti-sword" /> {isVacant ? 'Claim — Drive By' : 'Attack — Drive By'}
            </button>
          )
        )}

        <button className="btn btn-dark btn-full" style={{ padding: 14 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
