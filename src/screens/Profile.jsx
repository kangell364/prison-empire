import React, { useState, useMemo } from 'react'
import { PLAYER, TRAITS, RESOURCES, RARITY_COLORS } from '../data/gameData'
import { sfx } from '../sounds'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const BLUE = '#4a9eff'
const DIM  = '#555'

export default function Profile() {
  const [tab, setTab] = useState('upgrades')
  // Local interactive state — clicking Upgrade actually spends a point and
  // bumps the trait. Resets on refresh until Supabase lands.
  const [traits, setTraits] = useState(PLAYER.traits)
  const [points, setPoints] = useState(PLAYER.traitPoints)

  const upgrade = (traitId) => {
    if (points <= 0) return
    setTraits(t => ({ ...t, [traitId]: t[traitId] + 1 }))
    setPoints(p => p - 1)
    sfx.tick()
  }

  // Derived pool max from trait values.
  const poolMax = useMemo(() => {
    const m = { health: 0, stamina: 0, knowledge: 0 }
    TRAITS.forEach(t => {
      if (t.poolMax) m[t.poolMax] = traits[t.id] * t.perPoint
    })
    return m
  }, [traits])

  return (
    <div className="scroll-area animate-in">
      <StatusBar poolMax={poolMax} />

      {/* Sub-tabs */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 6 }}>
        <SubTab active={tab === 'upgrades'}  onClick={() => setTab('upgrades')}>Upgrades</SubTab>
        <SubTab active={tab === 'skills'}    onClick={() => setTab('skills')}>Skills</SubTab>
        <SubTab active={tab === 'equipment'} onClick={() => setTab('equipment')}>Equipment</SubTab>
      </div>

      {tab === 'upgrades'  && <UpgradesTab traits={traits} points={points} onUpgrade={upgrade} />}
      {tab === 'skills'    && <PlaceholderTab title="Skills"
        body="Spend Knowledge to unlock special abilities — schemes, intimidation moves, lockpicking, etc. Coming with the Supabase pass." />}
      {tab === 'equipment' && <PlaceholderTab title="Equipment"
        body="Shanks, body armor, contraband phones — slots that stack on top of your base traits. Coming with the Supabase pass." />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Status bar (top of profile)
// ---------------------------------------------------------------------

function StatusBar({ poolMax }) {
  const xpPct = Math.round((PLAYER.xp / PLAYER.xpNext) * 100)
  const cardColor = RARITY_COLORS[PLAYER.card.rarity]

  return (
    <div style={{ padding: '14px 16px 0' }}>
      <div style={{
        background: 'linear-gradient(135deg, #15110a 0%, #13131f 70%)',
        border: `1px solid ${cardColor}44`,
        borderRadius: 18,
        padding: 14,
      }}>
        {/* Top row: card art + identity */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{
            width: 64, height: 84,
            background: '#1a1a2e',
            border: `1px solid ${cardColor}66`,
            borderRadius: 10,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: cardColor }} />
            <div style={{ fontSize: 30 }}>{PLAYER.card.emoji}</div>
            <div style={{ color: cardColor, fontSize: 7, fontWeight: 700, letterSpacing: 0.5, marginTop: 2 }}>LVL {PLAYER.level}</div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 500 }}>{PLAYER.name}</div>
            <div style={{ color: cardColor, fontSize: 11, fontWeight: 500, marginTop: 1 }}>{PLAYER.archetype}</div>
            <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{PLAYER.facility} — {PLAYER.state}</div>
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ color: '#555', fontSize: 9 }}>XP to Lv {PLAYER.level + 1}</span>
                <span style={{ color: '#888', fontSize: 9 }}>
                  {PLAYER.xp.toLocaleString()} / {PLAYER.xpNext.toLocaleString()}
                </span>
              </div>
              <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${xpPct}%`,
                  background: `linear-gradient(90deg, ${GOLD}, #f0d080)`,
                  borderRadius: 2,
                }} />
              </div>
            </div>
          </div>
        </div>

        {/* Pool bars */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          <PoolBar icon="ti-heart"  color={RED}  label="Health"    cur={PLAYER.pools.health}    max={poolMax.health} />
          <PoolBar icon="ti-bolt"   color={GOLD} label="Stamina"   cur={PLAYER.pools.stamina}   max={poolMax.stamina} />
          <PoolBar icon="ti-brain"  color={BLUE} label="Knowledge" cur={PLAYER.pools.knowledge} max={poolMax.knowledge} />
        </div>

        {/* Currency */}
        <div style={{
          marginTop: 12, padding: '8px 12px',
          background: '#1e1e2a', borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-flame" style={{ color: GOLD, fontSize: 16 }} />
            <span style={{ color: '#888', fontSize: 11 }}>Hustle</span>
          </div>
          <span style={{ color: GOLD, fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {RESOURCES.hustle.value.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}

function PoolBar({ icon, color, label, cur, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((cur / max) * 100)) : 0
  return (
    <div style={{ background: '#1e1e2a', borderRadius: 10, padding: '6px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <i className={`ti ${icon}`} style={{ color, fontSize: 12 }} />
        <span style={{ color: '#888', fontSize: 9, fontWeight: 500, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ color: '#fff', fontSize: 11, fontWeight: 500, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
        {cur.toLocaleString()} / {max.toLocaleString()}
      </div>
      <div style={{ height: 3, background: '#0d0d15', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Sub-tab pill
// ---------------------------------------------------------------------

function SubTab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1,
      background: active ? `${GOLD}18` : '#13131f',
      border: `0.5px solid ${active ? `${GOLD}44` : '#2a2a3a'}`,
      borderRadius: 10,
      padding: '9px 0',
      color: active ? GOLD : '#888',
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      cursor: 'pointer',
    }}>{children}</button>
  )
}

// ---------------------------------------------------------------------
// Upgrades tab
// ---------------------------------------------------------------------

function UpgradesTab({ traits, points, onUpgrade }) {
  return (
    <>
      {/* Points banner */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          background: points > 0
            ? 'linear-gradient(135deg, #15110a 0%, #1a1510 100%)'
            : '#0d0d15',
          border: `0.5px solid ${points > 0 ? `${GOLD}44` : '#1e1e2a'}`,
          borderRadius: 12,
          padding: '12px 14px',
          textAlign: 'center',
        }}>
          <div style={{ color: points > 0 ? '#fff' : '#666', fontSize: 13 }}>
            You have{' '}
            <span style={{ color: points > 0 ? GOLD : DIM, fontSize: 18, fontWeight: 700 }}>
              {points}
            </span>{' '}
            trait point{points === 1 ? '' : 's'} available
          </div>
          <div style={{ color: DIM, fontSize: 10, marginTop: 2 }}>Each upgrade costs one point.</div>
        </div>
      </div>

      {/* Trait cards */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Traits</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TRAITS.map(trait => (
            <TraitCard
              key={trait.id}
              trait={trait}
              value={traits[trait.id]}
              isPrimary={trait.id === PLAYER.primaryTrait}
              canUpgrade={points > 0}
              onUpgrade={() => onUpgrade(trait.id)}
            />
          ))}
        </div>
      </div>

      {/* Footer — primary trait note */}
      <div style={{ padding: '0 16px 0' }}>
        <div style={{
          background: '#0d0d15',
          border: '0.5px solid #1e1e2a',
          borderRadius: 12,
          padding: 12,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <div style={{ color: BLUE, fontSize: 16, lineHeight: 1 }}>★</div>
          <div style={{ color: BLUE, fontSize: 11, lineHeight: 1.5, flex: 1 }}>
            <span style={{ fontWeight: 600 }}>{primaryLabel()} </span>
            is your Primary Trait. With each new level it auto-increases by 1 point.
            Different archetypes have different primary traits.
          </div>
        </div>
      </div>
    </>
  )
}

function primaryLabel() {
  const t = TRAITS.find(x => x.id === PLAYER.primaryTrait)
  return t ? t.label : ''
}

function TraitCard({ trait, value, isPrimary, canUpgrade, onUpgrade }) {
  return (
    <div className="card card-pad" style={{
      padding: 14,
      borderColor: isPrimary ? `${BLUE}44` : '#2a2a3a',
      background: isPrimary
        ? 'linear-gradient(135deg, #0a0f1a 0%, #13131f 100%)'
        : '#13131f',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Icon */}
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${trait.color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <i className={`ti ${trait.icon}`} style={{ color: trait.color, fontSize: 20 }} />
        </div>

        {/* Label + value */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPrimary && <span style={{ color: BLUE, fontSize: 11 }}>★</span>}
            <div style={{
              color: isPrimary ? BLUE : '#fff',
              fontSize: 14, fontWeight: 600, letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}>{trait.label}</div>
          </div>
          <div style={{ color: trait.color, fontSize: 22, fontWeight: 700, lineHeight: 1, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </div>
        </div>

        {/* Upgrade button */}
        <button
          onClick={onUpgrade}
          disabled={!canUpgrade}
          style={{
            background: canUpgrade ? GOLD : '#1e1e2a',
            color: canUpgrade ? '#0a0a0f' : '#444',
            border: 'none', borderRadius: 8,
            padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 1,
            cursor: canUpgrade ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 4,
            flexShrink: 0,
            transition: 'background 0.15s, transform 0.1s',
          }}
        >
          <i className="ti ti-arrow-up" style={{ fontSize: 12 }} />
          UPGRADE
        </button>
      </div>

      {/* Description */}
      <div style={{ marginTop: 10, paddingLeft: 52 }}>
        <div style={{ color: trait.color, fontSize: 11, lineHeight: 1.4 }}>
          {trait.description}
        </div>
        <div style={{ color: '#888', fontSize: 11, lineHeight: 1.4, marginTop: 2 }}>
          {trait.detail}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Placeholder tabs (Skills, Equipment)
// ---------------------------------------------------------------------

function PlaceholderTab({ title, body }) {
  return (
    <div className="section" style={{ marginTop: 14 }}>
      <div className="card card-pad" style={{
        textAlign: 'center',
        padding: '32px 20px',
      }}>
        <i className="ti ti-tool" style={{ color: DIM, fontSize: 32, marginBottom: 10, display: 'block' }} />
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
          {title}
        </div>
        <div style={{ color: '#888', fontSize: 12, lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  )
}
