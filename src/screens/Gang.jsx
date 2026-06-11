import React, { useState, useEffect } from 'react'
import { PLAYER, CARDS_COLLECTION, RARITY_COLORS } from '../data/gameData'
import { useDisplayName, useSteel, spendSteel, useHustle, spendHustle } from '../state/profileStore'
import { useProgress } from '../state/progressionStore'
import { baseAtk, baseDef, atkOf, defOf } from '../state/crewStore'
import { useUpgrades, flatAtLevel } from '../state/upgradesStore'
import { useCardCounts, getOwnedTuples } from '../state/cardsStore'
import {
  useGang, useBrowseGangs, applicationStatus, liveGangsEnabled,
  foundGang, joinGang, applyToGang, leaveGang,
  kickMember, promoteMember, demoteMember, addCardMember,
  setEnrollment, setMinLevel, syncPlayerMember,
  donateToTreasury, buyPerk, getContribution, gangLevelProgress,
  PERKS, perkCost,
  CREATE_MIN_LEVEL, FOUND_COST_STEEL, ROLES, ENROLLMENT, PLAYER_MEMBER_ID,
} from '../state/gangStore'
import { sfx } from '../sounds'
import { Avatar } from '../components/Avatar'

const GOLD = '#c9a84c'
const BLUE = '#4a9eff'
const RED  = '#e74c3c'
const DIM  = '#555'
const CRESTS = ['🏴', '💀', '👑', '🔥', '🐺', '⚡', '🩸', '🧱', '⛓️', '🔪', '🎯', '🛒']

const ENROLL_META = {
  [ENROLLMENT.OPEN]:   { label: 'Open',        color: '#2ecc71', icon: 'ti-door-enter' },
  [ENROLLMENT.APPLY]:  { label: 'Apply',       color: GOLD,      icon: 'ti-mail' },
  [ENROLLMENT.INVITE]: { label: 'Invite only', color: RED,       icon: 'ti-lock' },
}
const ROLE_META = {
  [ROLES.BOSS]:    { label: 'OG',      color: GOLD, icon: 'ti-crown' },
  [ROLES.OFFICER]: { label: 'Officer', color: BLUE, icon: 'ti-star' },
  [ROLES.MEMBER]:  { label: 'Member',  color: DIM,  icon: 'ti-user' },
}

export default function Gang({ onBack, onNavigate }) {
  const s = useGang()
  const prog = useProgress()
  const name = useDisplayName()
  const playerPower = baseAtk(PLAYER) + baseDef(PLAYER)
  const player = { name, level: prog.level, power: playerPower }

  // Keep the player's roster row in sync with their live level/name/power.
  useEffect(() => { syncPlayerMember(player) }, [name, prog.level, playerPower]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="scroll-area animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 6px' }}>
        <button className="btn btn-dark" onClick={onBack} style={{ padding: '8px 12px', fontSize: 13 }}>
          <i className="ti ti-arrow-left" /> Back
        </button>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>Gang</div>
      </div>

      {s.myGang ? <GangHub gang={s.myGang} player={player} onNavigate={onNavigate} /> : <NotInGang player={player} />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Not in a gang — found your own or browse the AI gangs.
// ---------------------------------------------------------------------
function NotInGang({ player }) {
  const steel = useSteel()
  const [showFound, setShowFound] = useState(false)
  const browse = useBrowseGangs()
  const canFound = player.level >= CREATE_MIN_LEVEL && steel >= FOUND_COST_STEEL
  const lockReason = player.level < CREATE_MIN_LEVEL
    ? `Reach Level ${CREATE_MIN_LEVEL} to found a gang`
    : steel < FOUND_COST_STEEL ? `Need ${FOUND_COST_STEEL} Steel to found a gang` : ''

  return (
    <>
      {/* Found a gang */}
      <div className="section">
        <div className="section-label">Start Your Own</div>
        <div className="card card-pad" style={{ textAlign: 'center', padding: 18 }}>
          <div style={{ fontSize: 40 }}>🏴</div>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginTop: 6 }}>Found a Gang</div>
          <div style={{ color: DIM, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
            Run your own crew. You're the OG — set the rules, recruit members, fill spots with your cards.
          </div>
          <button
            className="btn btn-gold"
            onClick={() => { sfx.tap?.(); setShowFound(true) }}
            disabled={!canFound}
            style={{ width: '100%', marginTop: 14, padding: 13, opacity: canFound ? 1 : 0.5 }}
          >
            Found a Gang · {FOUND_COST_STEEL} Steel
          </button>
          {!canFound && <div style={{ color: RED, fontSize: 11, marginTop: 8 }}>{lockReason}</div>}
        </div>
      </div>

      {/* Browse gangs */}
      <div className="section">
        <div className="section-label">Browse Gangs ({browse.length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {browse.map(g => <BrowseRow key={g.id} gang={g} player={player} />)}
        </div>
      </div>

      {showFound && <FoundGangModal player={player} steel={steel} onClose={() => setShowFound(false)} />}
    </>
  )
}

function BrowseRow({ gang, player }) {
  const em = ENROLL_META[gang.enrollment]
  const full = gang.members.length >= gang.capacity
  const meetsLevel = player.level >= gang.minLevel
  const status = applicationStatus(gang.id)

  let action
  if (full) action = { label: 'Full', disabled: true }
  else if (!meetsLevel) action = { label: `Lv ${gang.minLevel}+`, disabled: true }
  else if (gang.enrollment === ENROLLMENT.OPEN) action = { label: 'Join', onClick: () => { joinGang(gang.id, player); sfx.buy?.() } }
  // Live apply/invite join lands in Phase 5 (applications). For now only OPEN
  // live gangs are joinable; the local AI gangs keep the simulated apply timer.
  else if (gang.live) action = { label: 'Soon', disabled: true }
  else if (gang.enrollment === ENROLLMENT.INVITE) action = { label: 'Invite only', disabled: true }
  else { // apply (local AI gangs)
    if (status === 'accepted') action = { label: 'Accepted · Join', onClick: () => { joinGang(gang.id, player); sfx.buy?.() } }
    else if (status === 'pending') action = { label: 'Pending…', disabled: true }
    else action = { label: 'Apply', onClick: () => { applyToGang(gang.id); sfx.tap?.() } }
  }

  return (
    <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
      <div style={{ fontSize: 30, width: 38, textAlign: 'center' }}>{gang.crest}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {gang.name} <span style={{ color: DIM, fontSize: 11 }}>[{gang.tag}]</span>
          {gang.live && <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5, color: '#2ecc71', background: '#2ecc7122', border: '0.5px solid #2ecc7155', borderRadius: 4, padding: '1px 4px', verticalAlign: 'middle' }}>● LIVE</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, color: DIM, fontSize: 11 }}>
          <span>Lv {gang.level}</span>
          <span>{gang.members.length}/{gang.capacity}</span>
          <span style={{ color: GOLD }}>{gang.power.toLocaleString()} PWR</span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, color: em.color, fontSize: 10, fontWeight: 700 }}>
          <i className={`ti ${em.icon}`} style={{ fontSize: 11 }} />{em.label}{gang.minLevel > 0 ? ` · Lv ${gang.minLevel}+` : ''}
        </div>
      </div>
      <button
        className="btn"
        onClick={action.onClick}
        disabled={action.disabled}
        style={{
          flexShrink: 0, padding: '9px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
          background: action.disabled ? '#1e1e2a' : GOLD, color: action.disabled ? DIM : '#0a0a0f',
          border: action.disabled ? '0.5px solid #2a2a3a' : 'none', cursor: action.disabled ? 'default' : 'pointer',
        }}
      >{action.label}</button>
    </div>
  )
}

function FoundGangModal({ player, steel, onClose }) {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [crest, setCrest] = useState(CRESTS[0])
  const [enrollment, setEnroll] = useState(ENROLLMENT.APPLY)
  const [minLevel, setMin] = useState(0)

  const create = () => {
    if (!name.trim()) return
    // Live gangs: the found_gang RPC charges Steel server-side — don't double-spend.
    if (liveGangsEnabled()) {
      if (steel < FOUND_COST_STEEL) { sfx.deny?.(); return }
    } else if (!spendSteel(FOUND_COST_STEEL)) { sfx.deny?.(); return }
    foundGang({ name, tag, crest, enrollment, minLevel }, player)
    sfx.buy?.()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 16 }} onClick={onClose}>
      <div className="card card-pad" style={{ width: '100%', maxWidth: 360, maxHeight: '88%', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 14 }}>Found a Gang</div>

        <Label text="Crest" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {CRESTS.map(c => (
            <button key={c} onClick={() => setCrest(c)} style={{
              width: 38, height: 38, borderRadius: 10, fontSize: 20,
              background: crest === c ? `${GOLD}22` : '#13131f',
              border: `1px solid ${crest === c ? GOLD : '#2a2a3a'}`, cursor: 'pointer',
            }}>{c}</button>
          ))}
        </div>

        <Label text="Gang name" />
        <input value={name} onChange={e => setName(e.target.value.slice(0, 24))} placeholder="Block Boys" autoFocus
          style={inputStyle} />

        <Label text="Tag (up to 5)" />
        <input value={tag} onChange={e => setTag(e.target.value.toUpperCase().slice(0, 5))} placeholder="BLOK"
          style={inputStyle} />

        <Label text="Enrollment" />
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {Object.values(ENROLLMENT).map(mode => {
            const m = ENROLL_META[mode]; const on = enrollment === mode
            return (
              <button key={mode} onClick={() => setEnroll(mode)} style={{
                flex: 1, padding: '9px 2px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                background: on ? `${m.color}22` : '#13131f', color: on ? m.color : DIM,
                border: `1px solid ${on ? m.color : '#2a2a3a'}`, cursor: 'pointer',
              }}><i className={`ti ${m.icon}`} style={{ fontSize: 12, marginRight: 3 }} />{m.label}</button>
            )
          })}
        </div>

        <Label text={`Minimum level to join: ${minLevel || 'none'}`} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Stepper onClick={() => setMin(v => Math.max(0, v - 1))} icon="ti-minus" />
          <div style={{ flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: 600 }}>{minLevel}</div>
          <Stepper onClick={() => setMin(v => v + 1)} icon="ti-plus" />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-dark" style={{ flex: 1, padding: 12 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" style={{ flex: 1, padding: 12, opacity: name.trim() ? 1 : 0.5 }} disabled={!name.trim()} onClick={create}>
            Found · {FOUND_COST_STEEL} Steel
          </button>
        </div>
        {steel < FOUND_COST_STEEL && <div style={{ color: RED, fontSize: 11, marginTop: 8, textAlign: 'center' }}>Not enough Steel ({steel}/{FOUND_COST_STEEL})</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// In a gang — the hub.
// ---------------------------------------------------------------------
function GangHub({ gang, player, onNavigate }) {
  const [showPicker, setShowPicker] = useState(false)
  const boss = gang.members.some(m => m.id === PLAYER_MEMBER_ID && m.role === ROLES.BOSS)
  const openSpots = gang.capacity - gang.members.length

  return (
    <>
      {/* Identity header */}
      <div className="section">
        <div className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 44, width: 54, textAlign: 'center' }}>{gang.crest}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>
                {gang.name} <span style={{ color: DIM, fontSize: 12 }}>[{gang.tag}]</span>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 4, color: DIM, fontSize: 12 }}>
                <span>Lv {gang.level}</span>
                <span>{gang.members.length}/{gang.capacity} members</span>
                <span style={{ color: GOLD }}>{gang.power.toLocaleString()} PWR</span>
              </div>
            </div>
          </div>
          {/* Gang XP — climbs off member contributions. */}
          <GangXpBar gang={gang} />
        </div>
      </div>

      {/* Treasury */}
      <Treasury gang={gang} />

      {/* Perks */}
      <Perks gang={gang} boss={boss} />

      {/* OG controls */}
      {boss && <OgControls gang={gang} />}

      {/* Roster */}
      <div className="section">
        <div className="section-label">Members ({gang.members.length}/{gang.capacity})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {gang.members
            .slice()
            .sort((a, b) => roleRank(b.role) - roleRank(a.role) || b.power - a.power)
            .map(m => <MemberRow key={m.id} member={m} boss={boss} />)}
        </div>

        {/* Open spots — the OG can fill them with his own cards. */}
        {openSpots > 0 && boss && !gang.live && (
          <button className="btn btn-dark" onClick={() => { sfx.tap?.(); setShowPicker(true) }}
            style={{ width: '100%', marginTop: 10, padding: 12, borderStyle: 'dashed' }}>
            <i className="ti ti-plus" /> Fill a spot with your card ({openSpots} open)
          </button>
        )}
        {openSpots > 0 && !boss && (
          <div style={{ color: DIM, fontSize: 11, textAlign: 'center', marginTop: 10 }}>{openSpots} open spot{openSpots > 1 ? 's' : ''}</div>
        )}
        {openSpots === 0 && gang.capacity < 12 && (
          <div style={{ color: DIM, fontSize: 11, textAlign: 'center', marginTop: 10 }}>
            <i className="ti ti-lock" style={{ fontSize: 11, marginRight: 3 }} />Gang full — level up to unlock another spot (+1 per level, max 12).
          </div>
        )}
      </div>

      {/* Leave */}
      <div className="section">
        <button className="btn" onClick={() => { if (window.confirm(boss ? 'Disband your gang?' : 'Leave this gang?')) { leaveGang(); sfx.tap?.() } }}
          style={{ width: '100%', padding: 12, background: '#1e1e2a', border: `0.5px solid ${RED}55`, color: RED, fontWeight: 700 }}>
          <i className="ti ti-logout" /> {boss ? 'Disband Gang' : 'Leave Gang'}
        </button>
      </div>

      {showPicker && <CardPickerModal gang={gang} onClose={() => setShowPicker(false)} />}
    </>
  )
}

function GangXpBar({ gang }) {
  const p = gangLevelProgress(gang)
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: DIM, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>GANG XP → LV {p.level + 1}</span>
        <span style={{ color: DIM, fontSize: 10 }}>{p.inLevel.toLocaleString()} / {p.span.toLocaleString()}</span>
      </div>
      <div style={{ height: 5, background: '#1e1e2a', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p.pct}%`, background: `linear-gradient(90deg, ${GOLD}, #f0d080)`, borderRadius: 3 }} />
      </div>
      <div style={{ color: DIM, fontSize: 10, marginTop: 4 }}>Donations to the treasury level the gang up — {p.toNext.toLocaleString()} to go.</div>
    </div>
  )
}

function Treasury({ gang }) {
  const hustle = useHustle()
  const [showDonate, setShowDonate] = useState(false)
  const mine = getContribution(PLAYER_MEMBER_ID)
  return (
    <div className="section">
      <div className="section-label">Treasury</div>
      <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${GOLD}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-flame" style={{ color: GOLD, fontSize: 22 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>{(gang.treasury || 0).toLocaleString()}</div>
          <div style={{ color: DIM, fontSize: 11, marginTop: 1 }}>Gang Hustle · you gave {mine.toLocaleString()}</div>
        </div>
        <button className="btn btn-gold" onClick={() => { sfx.tap?.(); setShowDonate(true) }} style={{ padding: '9px 14px', flexShrink: 0 }}>
          Donate
        </button>
      </div>
      {showDonate && <DonateModal hustle={hustle} onClose={() => setShowDonate(false)} />}
    </div>
  )
}

function DonateModal({ hustle, onClose }) {
  const [amt, setAmt] = useState('')
  const n = Math.max(0, Math.floor(Number(amt) || 0))
  const quick = [100, 1000, 10000]
  const donate = () => {
    const give = Math.min(n, hustle)
    if (give <= 0) { sfx.deny?.(); return }
    // Live gangs: donate_to_gang charges Hustle server-side — don't double-spend.
    if (liveGangsEnabled()) {
      if (hustle < give) { sfx.deny?.(); return }
    } else if (!spendHustle(give)) { sfx.deny?.(); return }
    donateToTreasury(give)
    sfx.buy?.()
    onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 16 }} onClick={onClose}>
      <div className="card card-pad" style={{ width: '100%', maxWidth: 340 }} onClick={e => e.stopPropagation()}>
        <div style={{ color: '#fff', fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Donate Hustle</div>
        <div style={{ color: DIM, fontSize: 12, marginBottom: 14 }}>You hold {hustle.toLocaleString()} Hustle</div>
        <input value={amt} onChange={e => setAmt(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Amount" inputMode="numeric" autoFocus style={inputStyle} />
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {quick.map(q => (
            <button key={q} onClick={() => setAmt(String(Math.min(q, hustle)))} style={chipStyle}>+{q >= 1000 ? `${q / 1000}k` : q}</button>
          ))}
          <button onClick={() => setAmt(String(hustle))} style={chipStyle}>Max</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-dark" style={{ flex: 1, padding: 12 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" style={{ flex: 1, padding: 12, opacity: n > 0 && hustle > 0 ? 1 : 0.5 }} disabled={!(n > 0 && hustle > 0)} onClick={donate}>
            Donate {Math.min(n, hustle).toLocaleString()}
          </button>
        </div>
      </div>
    </div>
  )
}

function Perks({ gang, boss }) {
  return (
    <div className="section">
      <div className="section-label">Perks</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PERKS.map(perk => {
          const level = gang.perks?.[perk.id] || 0
          const maxed = level >= perk.maxLevel
          const cost = maxed ? 0 : perkCost(perk, level)
          const bonusNow = Math.round(level * perk.perLevel * 100)
          const bonusNext = Math.round((level + 1) * perk.perLevel * 100)
          const afford = (gang.treasury || 0) >= cost
          const canBuy = boss && !maxed && afford
          return (
            <div key={perk.id} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
              <div style={{ fontSize: 26, width: 34, textAlign: 'center' }}>{perk.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                  {perk.name} <span style={{ color: DIM, fontSize: 11 }}>· Lv {level}/{perk.maxLevel}</span>
                </div>
                <div style={{ color: GOLD, fontSize: 11, marginTop: 2 }}>
                  +{bonusNow}% {perk.effect}{!maxed && <span style={{ color: DIM }}> → +{bonusNext}%</span>}
                </div>
              </div>
              <button
                className="btn"
                onClick={() => { if (buyPerk(perk.id)) sfx.buy?.(); else sfx.deny?.() }}
                disabled={!canBuy}
                style={{
                  flexShrink: 0, padding: '8px 12px', borderRadius: 10, fontSize: 11, fontWeight: 700, minWidth: 72,
                  background: canBuy ? GOLD : '#1e1e2a', color: canBuy ? '#0a0a0f' : DIM,
                  border: canBuy ? 'none' : '0.5px solid #2a2a3a', cursor: canBuy ? 'pointer' : 'default',
                }}
              >
                {maxed ? 'MAX' : !boss ? 'OG only' : cost.toLocaleString()}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OgControls({ gang }) {
  return (
    <div className="section">
      <div className="section-label">OG Controls</div>
      <div className="card card-pad">
        <Label text="Enrollment" />
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {Object.values(ENROLLMENT).map(mode => {
            const m = ENROLL_META[mode]; const on = gang.enrollment === mode
            return (
              <button key={mode} onClick={() => { setEnrollment(mode); sfx.tap?.() }} style={{
                flex: 1, padding: '9px 2px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                background: on ? `${m.color}22` : '#13131f', color: on ? m.color : DIM,
                border: `1px solid ${on ? m.color : '#2a2a3a'}`, cursor: 'pointer',
              }}><i className={`ti ${m.icon}`} style={{ fontSize: 12, marginRight: 3 }} />{m.label}</button>
            )
          })}
        </div>
        <Label text={`Minimum level to join: ${gang.minLevel || 'none'}`} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Stepper onClick={() => { setMinLevel(Math.max(0, gang.minLevel - 1)); sfx.tap?.() }} icon="ti-minus" />
          <div style={{ flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: 600 }}>{gang.minLevel}</div>
          <Stepper onClick={() => { setMinLevel(gang.minLevel + 1); sfx.tap?.() }} icon="ti-plus" />
        </div>
      </div>
    </div>
  )
}

function MemberRow({ member, boss }) {
  const rm = ROLE_META[member.role]
  const isPlayer = member.id === PLAYER_MEMBER_ID
  const canManage = boss && !isPlayer
  return (
    <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10 }}>
      <div style={{ width: 40, height: 40, flexShrink: 0 }}>
        {member.avatar || member.isCard
          ? <Avatar src={member.avatar} emoji={member.emoji} size={40} radius={10} />
          : <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1e1e2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{member.emoji}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {member.name}{isPlayer && <span style={{ color: GOLD, fontSize: 10 }}> · you</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: 11 }}>
          <span style={{ color: rm.color, fontWeight: 700 }}><i className={`ti ${rm.icon}`} style={{ fontSize: 11, marginRight: 2 }} />{rm.label}</span>
          <span style={{ color: DIM }}>Lv {member.level}</span>
          <span style={{ color: GOLD }}>{member.power.toLocaleString()} PWR</span>
        </div>
      </div>
      {canManage && (
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          {member.role === ROLES.MEMBER
            ? <IconBtn icon="ti-arrow-up" color={BLUE} title="Promote" onClick={() => { promoteMember(member.id); sfx.tap?.() }} />
            : <IconBtn icon="ti-arrow-down" color={DIM} title="Demote" onClick={() => { demoteMember(member.id); sfx.tap?.() }} />}
          <IconBtn icon="ti-x" color={RED} title="Kick" onClick={() => { kickMember(member.id); sfx.tap?.() }} />
        </div>
      )}
    </div>
  )
}

// OG fills an open spot from his own card collection.
function CardPickerModal({ gang, onClose }) {
  useCardCounts()   // re-render when collection changes
  const flat = flatAtLevel(useUpgrades(), 1)
  const inGang = new Set(gang.members.filter(m => m.isCard).map(m => m.cardId))
  const owned = getOwnedTuples().filter(t => !inGang.has(t.id))

  const pick = (card, level) => {
    const power = atkOf(card, flat) + defOf(card, flat)
    const ok = addCardMember({ cardId: card.id, name: card.name, avatar: card.avatar, emoji: card.emoji, level, power })
    if (ok) sfx.buy?.(); else sfx.deny?.()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 320, display: 'flex', flexDirection: 'column' }} onClick={onClose}>
      <div className="card" style={{ marginTop: 'auto', borderRadius: '18px 18px 0 0', maxHeight: '80%', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: '#2a2a3a', borderRadius: 2, margin: '10px auto 6px' }} />
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, padding: '4px 16px 10px' }}>Fill a spot with your card</div>
        <div style={{ overflowY: 'auto', padding: '0 16px 20px' }}>
          {owned.length === 0
            ? <div style={{ color: DIM, fontSize: 13, textAlign: 'center', padding: 30 }}>No more cards to add. Pull packs to grow your collection.</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {owned.map(t => {
                  const card = CARDS_COLLECTION.find(c => c.id === t.id)
                  if (!card) return null
                  const color = RARITY_COLORS[card.rarity] || GOLD
                  const power = atkOf(card, flat) + defOf(card, flat)
                  return (
                    <button key={`${t.id}:${t.level}`} onClick={() => pick(card, t.level)} className="card card-pad"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, textAlign: 'left', border: `0.5px solid ${color}44`, cursor: 'pointer' }}>
                      <Avatar src={card.avatar} emoji={card.emoji} size={38} radius={8} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                        <div style={{ color: GOLD, fontSize: 10, marginTop: 2 }}>{power.toLocaleString()} PWR</div>
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

// ---- little shared bits ---------------------------------------------
function roleRank(role) { return role === ROLES.BOSS ? 2 : role === ROLES.OFFICER ? 1 : 0 }
function Label({ text }) { return <div style={{ color: DIM, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>{text}</div> }
function Stepper({ onClick, icon }) {
  return <button onClick={onClick} style={{ width: 44, height: 40, borderRadius: 10, background: '#13131f', border: '0.5px solid #2a2a3a', color: '#fff', fontSize: 16, cursor: 'pointer' }}><i className={`ti ${icon}`} /></button>
}
function IconBtn({ icon, color, title, onClick }) {
  return <button title={title} onClick={onClick} style={{ width: 32, height: 32, borderRadius: 8, background: '#1e1e2a', border: `0.5px solid ${color}55`, color, fontSize: 14, cursor: 'pointer' }}><i className={`ti ${icon}`} /></button>
}
const inputStyle = { width: '100%', boxSizing: 'border-box', background: '#0a0a0f', border: '0.5px solid #2a2a3a', borderRadius: 10, padding: '11px 13px', color: '#fff', fontSize: 14, marginBottom: 14 }
const chipStyle = { flex: 1, padding: '9px 2px', borderRadius: 10, background: '#13131f', border: '0.5px solid #2a2a3a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
