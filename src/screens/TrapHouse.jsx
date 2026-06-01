import React, { useState, useEffect } from 'react'
import { CARDS_COLLECTION, RARITY_COLORS } from '../data/gameData'
import { useHustle, spendHustle } from '../state/profileStore'
import { useCardCounts, getOwnedTuples } from '../state/cardsStore'
import {
  useTrapHouse, plant, harvest, harvestAll, uproot, sellStash, buyPlot, buyUpgrade,
  isReady, readyAt, growMs, yieldOf, plotCost, upgradeCost, upgradeMax, sellValue,
  STRAIN, SELL_PRICE_PER_UNIT, PLOT_MAX, YIELD_PER_LVL, SPEED_PER_LVL,
} from '../state/trapHouseStore'
import { sfx } from '../sounds'
import { Avatar } from '../components/Avatar'

const GOLD = '#c9a84c'
const GREEN = '#2ecc71'
const DIM = '#555'

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
function cardOf(id) { return CARDS_COLLECTION.find(c => c.id === id) }

export default function TrapHouse({ onBack }) {
  const house = useTrapHouse()
  const hustle = useHustle()
  const [, setTick] = useState(0)
  // 1s ticker so grow countdowns update live.
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(t) }, [])
  const [picking, setPicking] = useState(null)   // plot index being planted

  const readyCount = house.plots.filter(p => isReady(p)).length
  const stashValue = sellValue(house.stash)

  return (
    <div className="scroll-area animate-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 6px' }}>
        <button className="btn btn-dark" onClick={onBack} style={{ padding: '8px 12px', fontSize: 13 }}>
          <i className="ti ti-arrow-left" /> Back
        </button>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>Trap House</div>
      </div>

      {/* Art banner */}
      <div style={{ padding: '6px 16px 0' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <img src="/traphouse.png" alt="Trap House" style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>
      </div>

      {/* Stash + sell */}
      <div className="section">
        <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${GREEN}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-plant-2" style={{ color: GREEN, fontSize: 22 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>{house.stash.toLocaleString()} <span style={{ color: DIM, fontSize: 12, fontWeight: 400 }}>units</span></div>
            <div style={{ color: DIM, fontSize: 11, marginTop: 1 }}>Worth {stashValue.toLocaleString()} Hustle · {SELL_PRICE_PER_UNIT}/unit</div>
          </div>
          <button className="btn btn-gold" onClick={() => { const v = sellStash(); if (v > 0) sfx.buy?.(); else sfx.deny?.() }}
            disabled={house.stash <= 0} style={{ padding: '9px 14px', flexShrink: 0, opacity: house.stash > 0 ? 1 : 0.5 }}>
            Sell All
          </button>
        </div>
        {readyCount > 0 && (
          <button className="btn btn-dark" onClick={() => { const g = harvestAll(); if (g > 0) sfx.tap?.() }}
            style={{ width: '100%', marginTop: 8, padding: 11, color: GREEN, border: `0.5px solid ${GREEN}55` }}>
            <i className="ti ti-basket" /> Harvest All ({readyCount} ready)
          </button>
        )}
      </div>

      {/* Plots */}
      <div className="section">
        <div className="section-label">Grow Plots ({house.plots.length}/{PLOT_MAX})</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {house.plots.map((plot, i) => <Plot key={i} plot={plot} onPlant={() => { sfx.tap?.(); setPicking(i) }} index={i} />)}
        </div>
        {house.plots.length < PLOT_MAX && (
          <button className="btn btn-dark" onClick={() => { if (buyPlot(spendHustle)) sfx.buy?.(); else sfx.deny?.() }}
            disabled={hustle < plotCost()}
            style={{ width: '100%', marginTop: 10, padding: 12, borderStyle: 'dashed', opacity: hustle >= plotCost() ? 1 : 0.5 }}>
            <i className="ti ti-plus" /> Buy Plot · {plotCost().toLocaleString()} Hustle
          </button>
        )}
      </div>

      {/* Upgrades */}
      <div className="section">
        <div className="section-label">Upgrades</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Upgrade kind="yield" icon="ti-trending-up" label="Bigger Yield" perLvl={YIELD_PER_LVL} lvl={house.yieldLvl} hustle={hustle} />
          <Upgrade kind="speed" icon="ti-clock-bolt" label="Faster Grow" perLvl={SPEED_PER_LVL} lvl={house.speedLvl} hustle={hustle} />
        </div>
      </div>

      {picking != null && (
        <PlantPicker
          onClose={() => setPicking(null)}
          onPick={(card) => { plant(picking, card); sfx.buy?.(); setPicking(null) }}
        />
      )}
    </div>
  )
}

function Plot({ plot, onPlant, index }) {
  if (!plot) {
    return (
      <button onClick={onPlant} className="card" style={{
        height: 120, border: '1px dashed #2a2a3a', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', background: '#0d0d15',
      }}>
        <i className="ti ti-seeding" style={{ color: '#3a3a44', fontSize: 26 }} />
        <span style={{ color: DIM, fontSize: 12, fontWeight: 600 }}>Plant a card</span>
      </button>
    )
  }
  const card = cardOf(plot.cardId)
  const color = RARITY_COLORS[card?.rarity] || GOLD
  const ready = isReady(plot)
  const remain = readyAt(plot) - Date.now()
  const pct = Math.max(0, Math.min(100, 100 - (remain / growMs(plot)) * 100))

  return (
    <div className="card card-pad" style={{ height: 120, padding: 10, position: 'relative', border: `0.5px solid ${ready ? GREEN : color}55`, display: 'flex', flexDirection: 'column' }}>
      <button onClick={() => { uproot(index); sfx.tap?.() }} title="Uproot"
        style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 6, background: '#1e1e2a', border: '0.5px solid #2a2a3a', color: DIM, fontSize: 11, cursor: 'pointer', zIndex: 1 }}>
        <i className="ti ti-x" />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar src={card?.avatar} emoji={card?.emoji} size={36} radius={8} />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card?.name}</div>
          <div style={{ color: GREEN, fontSize: 10, marginTop: 1 }}>+{yieldOf(plot)} / harvest</div>
        </div>
      </div>
      <div style={{ flex: 1 }} />
      {ready ? (
        <button className="btn btn-gold" onClick={() => { const g = harvest(index); if (g) sfx.buy?.() }} style={{ padding: '8px 0', fontSize: 12, fontWeight: 800 }}>
          <i className="ti ti-basket" /> Harvest
        </button>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: DIM, fontSize: 10 }}><i className="ti ti-plant" style={{ marginRight: 3 }} />Growing</span>
            <span style={{ color: '#888', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{fmt(remain)}</span>
          </div>
          <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${GREEN}, #8ee6a8)`, borderRadius: 2 }} />
          </div>
        </>
      )}
    </div>
  )
}

function Upgrade({ kind, icon, label, perLvl, lvl, hustle }) {
  const max = upgradeMax(kind)
  const maxed = lvl >= max
  const cost = maxed ? 0 : upgradeCost(kind)
  const afford = hustle >= cost
  const now = Math.round(lvl * perLvl * 100)
  const next = Math.round((lvl + 1) * perLvl * 100)
  return (
    <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
      <div style={{ width: 34, textAlign: 'center' }}><i className={`ti ${icon}`} style={{ color: GOLD, fontSize: 22 }} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{label} <span style={{ color: DIM, fontSize: 11 }}>· Lv {lvl}/{max}</span></div>
        <div style={{ color: GOLD, fontSize: 11, marginTop: 2 }}>
          {kind === 'yield' ? `+${now}% yield` : `−${now}% grow time`}{!maxed && <span style={{ color: DIM }}> → {kind === 'yield' ? `+${next}%` : `−${next}%`}</span>}
        </div>
      </div>
      <button className="btn" onClick={() => { if (buyUpgrade(kind, spendHustle)) sfx.buy?.(); else sfx.deny?.() }}
        disabled={maxed || !afford}
        style={{
          flexShrink: 0, padding: '8px 12px', borderRadius: 10, fontSize: 11, fontWeight: 700, minWidth: 72,
          background: !maxed && afford ? GOLD : '#1e1e2a', color: !maxed && afford ? '#0a0a0f' : DIM,
          border: !maxed && afford ? 'none' : '0.5px solid #2a2a3a', cursor: !maxed && afford ? 'pointer' : 'default',
        }}>
        {maxed ? 'MAX' : cost.toLocaleString()}
      </button>
    </div>
  )
}

// Pick a card from your collection to plant.
function PlantPicker({ onClose, onPick }) {
  useCardCounts()
  const owned = getOwnedTuples()
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 320, display: 'flex', flexDirection: 'column' }} onClick={onClose}>
      <div className="card" style={{ marginTop: 'auto', borderRadius: '18px 18px 0 0', maxHeight: '80%', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '10px auto 6px' }} />
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, padding: '4px 16px 4px' }}>Plant a card</div>
        <div style={{ color: DIM, fontSize: 11, padding: '0 16px 10px' }}>Rarer cards yield more; higher level grows more.</div>
        <div style={{ overflowY: 'auto', padding: '0 16px 20px' }}>
          {owned.length === 0
            ? <div style={{ color: DIM, fontSize: 13, textAlign: 'center', padding: 30 }}>No cards yet — pull packs to get some.</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {owned.map(t => {
                  const card = cardOf(t.id)
                  if (!card) return null
                  const color = RARITY_COLORS[card.rarity] || GOLD
                  const s = STRAIN[card.rarity] || STRAIN.common
                  const y = Math.round(s.yield * t.level)
                  return (
                    <button key={`${t.id}:${t.level}`} onClick={() => onPick({ cardId: t.id, level: t.level })} className="card card-pad"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, textAlign: 'left', border: `0.5px solid ${color}44`, cursor: 'pointer' }}>
                      <Avatar src={card.avatar} emoji={card.emoji} size={38} radius={8} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                        <div style={{ color: GREEN, fontSize: 10, marginTop: 2 }}>+{y}/harvest · {fmt(s.grow * 1000)}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
