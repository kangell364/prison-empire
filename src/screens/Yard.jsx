import React, { useState, useMemo } from 'react'
import { RANKED_PLAYERS, HIT_LIST, streetRep } from '../data/gameData'
import { Avatar } from '../components/Avatar'
import { CharacterDetailModal } from '../components/CharacterDetailModal'
import { usePlayerCard } from '../state/profileStore'

const GOLD   = '#c9a84c'
const SILVER = '#b0b0b0'
const BRONZE = '#cd7f32'
const RED    = '#e74c3c'
const DIM    = '#555'

// Compact bigint formatter — turns 2400000 into "2.4M Hustle", etc.
function formatHustle(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T'
  if (n >= 1e9)  return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (n >= 1e6)  return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3)  return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toLocaleString()
}

function timeAgo(days, hours) {
  if (days > 0)  return `${days}d ${hours}h ago`
  if (hours > 0) return `${hours}h ago`
  return 'just now'
}

const playerById = (() => {
  const m = {}
  RANKED_PLAYERS.forEach(p => { m[p.id] = p })
  return m
})()

export default function Yard() {
  const [tab, setTab] = useState('hits')
  const [detail, setDetail] = useState(null) // { character, actions }

  return (
    <div className="scroll-area animate-in">
      {/* Top tab switcher */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8 }}>
        <TabButton active={tab === 'hits'}  onClick={() => setTab('hits')}>
          <i className="ti ti-target" style={{ marginRight: 5, fontSize: 13 }} />
          Hit List
        </TabButton>
        <TabButton active={tab === 'kings'} onClick={() => setTab('kings')}>
          <i className="ti ti-trophy" style={{ marginRight: 5, fontSize: 13 }} />
          Yard Kings
        </TabButton>
      </div>

      {tab === 'hits'  && <HitListView  openDetail={setDetail} />}
      {tab === 'kings' && <YardKingsView openDetail={setDetail} />}

      {detail && (
        <CharacterDetailModal
          character={detail.character}
          actions={detail.actions || []}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1,
      background: active ? `${GOLD}18` : '#13131f',
      border: `0.5px solid ${active ? `${GOLD}44` : '#2a2a3a'}`,
      borderRadius: 12,
      padding: '10px 0',
      color: active ? GOLD : '#888',
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  )
}

// ---------------------------------------------------------------------
// Hit List
// ---------------------------------------------------------------------

function HitListView({ openDetail }) {
  const totalBounty = useMemo(() => HIT_LIST.reduce((sum, h) => sum + h.bountyHustle, 0), [])

  return (
    <>
      {/* Summary header */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          background: 'linear-gradient(135deg, #1a0808 0%, #100404 100%)',
          border: `1px solid ${RED}44`,
          borderRadius: 16, padding: 14,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ color: '#888', fontSize: 10, letterSpacing: 1.5, fontWeight: 600 }}>ACTIVE HITS</div>
            <div style={{ color: RED, fontSize: 26, fontWeight: 600, lineHeight: 1, marginTop: 4 }}>{HIT_LIST.length}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#888', fontSize: 10, letterSpacing: 1.5, fontWeight: 600 }}>TOTAL BOUNTY</div>
            <div style={{ color: GOLD, fontSize: 22, fontWeight: 600, lineHeight: 1, marginTop: 4 }}>
              {formatHustle(totalBounty)} <span style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>HUSTLE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div style={{ padding: '12px 16px 0', color: '#666', fontSize: 11, lineHeight: 1.5 }}>
        Hits are funded by other inmates. Add Hustle to grow a bounty, or move on the target yourself to claim it.
        Once posted, hits are final until claimed.
      </div>

      {/* Hit cards */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Active Hits</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {HIT_LIST.length === 0 ? (
            <div className="card card-pad" style={{ textAlign: 'center', color: DIM, fontSize: 12 }}>
              No hits posted right now. Visit a rival's profile to place one.
            </div>
          ) : (
            HIT_LIST
              .slice()
              .sort((a, b) => b.bountyHustle - a.bountyHustle)
              .map(hit => <HitCard key={hit.id} hit={hit} openDetail={openDetail} />)
          )}
        </div>
      </div>
    </>
  )
}

function HitCard({ hit, openDetail }) {
  const t = playerById[hit.targetId]
  if (!t) return null

  const showDetail = () => openDetail({
    character: t,
    actions: [
      { label: 'Add Bounty',     icon: 'ti-coin',  onClick: () => {}, kind: 'secondary' },
      { label: 'Move on Target', icon: 'ti-sword', onClick: () => {}, kind: 'danger' },
    ],
  })

  return (
    <div className="card card-pad" style={{
      padding: 14,
      borderColor: `${RED}44`,
      background: 'linear-gradient(135deg, #15090a 0%, #13131f 60%)',
      cursor: 'pointer',
    }} onClick={showDetail}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Avatar */}
        <Avatar src={t.avatar} emoji={t.emoji} size={56} radius={14}
          style={{ background: '#1e1e2a', border: `1px solid ${RED}44` }} />

        {/* Target info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 500 }}>{t.name}</div>
            <div style={{ color: DIM, fontSize: 10 }}>Lv {t.level}</div>
          </div>
          <div style={{ color: '#888', fontSize: 11, marginTop: 1 }}>
            {t.facility} — {t.state}
          </div>
          {/* Bounty */}
          <div style={{ color: RED, fontSize: 18, fontWeight: 600, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {formatHustle(hit.bountyHustle)} <span style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>HUSTLE</span>
          </div>
          <div style={{ color: DIM, fontSize: 10, marginTop: 2 }}>
            {hit.contributors} contributor{hit.contributors === 1 ? '' : 's'} · opened {timeAgo(hit.openedDaysAgo, hit.openedHoursAgo)}
          </div>
        </div>
      </div>

      {/* Actions — stopPropagation so the buttons don't also open the detail */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }} onClick={e => e.stopPropagation()}>
        <button className="btn btn-dark" style={{ flex: 1, padding: '10px 0', fontSize: 12 }}>
          <i className="ti ti-coin" style={{ fontSize: 14 }} /> Add Bounty
        </button>
        <button className="btn btn-red" style={{ flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600 }}>
          <i className="ti ti-sword" style={{ fontSize: 14 }} /> Move on Target
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Yard Kings
// ---------------------------------------------------------------------

function YardKingsView({ openDetail }) {
  const me = usePlayerCard()   // live player card (look + name), synced with SWAP/rename
  // The "you" leaderboard row, with live name/avatar over the static seed.
  const youRow = () => { const p = RANKED_PLAYERS.find(x => x.isYou); return { ...p, name: me.name, avatar: me.avatar, emoji: me.emoji } }
  // Top 3 overall by Street Rep
  const podium = useMemo(() => (
    RANKED_PLAYERS
      .slice()
      .sort((a, b) => streetRep(b) - streetRep(a))
      .slice(0, 3)
  ), [])

  const youRank = useMemo(() => {
    const sorted = RANKED_PLAYERS.slice().sort((a, b) => streetRep(b) - streetRep(a))
    return sorted.findIndex(p => p.isYou) + 1
  }, [])

  const categories = [
    { key: 'wins',    label: 'Heavy Hitters', subtitle: 'Most fights won this period',  metricLabel: 'WINS',   metric: p => p.wins,    icon: 'ti-flame' },
    { key: 'kos',     label: 'Stone Cold',    subtitle: 'Most takedowns this period',   metricLabel: 'KOs',    metric: p => p.kos,     icon: 'ti-skull' },
    { key: 'losses',  label: 'Fresh Fish',    subtitle: 'Most fights lost — the rookie wall of shame', metricLabel: 'LOSSES', metric: p => p.losses,  icon: 'ti-fish' },
    { key: 'defeats', label: 'Took the Bus',  subtitle: 'Most defeats — transferred out', metricLabel: 'DEFEATS', metric: p => p.defeats, icon: 'ti-bus' },
    { key: 'jobs',    label: 'Hustlers',      subtitle: 'Most jobs completed this period', metricLabel: 'JOBS', metric: p => p.jobs,     icon: 'ti-briefcase' },
  ]

  return (
    <>
      {/* Podium */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-label">Street Rep — Top 3</div>
        <Podium top3={podium} openDetail={openDetail} />
      </div>

      {/* Your rank */}
      <div style={{ padding: '0 16px', marginTop: 4, marginBottom: 14 }}>
        <div style={{
          background: '#13131f',
          border: `0.5px solid ${GOLD}44`,
          borderRadius: 12,
          padding: '10px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer',
        }} onClick={() => openDetail({ character: youRow() })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar src={me.avatar} emoji={me.emoji} size={28} radius={6} />
            <div>
              <div style={{ color: GOLD, fontSize: 12, fontWeight: 500 }}>You — {me.name}</div>
              <div style={{ color: DIM, fontSize: 10 }}>Street Rep: {streetRep(RANKED_PLAYERS.find(p => p.isYou)).toLocaleString()}</div>
            </div>
          </div>
          <div style={{ color: GOLD, fontSize: 18, fontWeight: 600 }}>#{youRank}</div>
        </div>
      </div>

      {/* Category leaderboards */}
      {categories.map(cat => (
        <CategoryLeaderboard key={cat.key} {...cat} openDetail={openDetail} />
      ))}

      {/* Footer — formula */}
      <div style={{ padding: '0 16px 0', marginTop: 4 }}>
        <div style={{
          background: '#0d0d15',
          border: '0.5px solid #1e1e2a',
          borderRadius: 12,
          padding: 12,
        }}>
          <div style={{ color: '#666', fontSize: 10, fontWeight: 600, letterSpacing: 1.2, marginBottom: 6 }}>HOW STREET REP IS SCORED</div>
          <div style={{ color: '#888', fontSize: 11, lineHeight: 1.6, fontFamily: 'ui-monospace, monospace' }}>
            (Takedowns − Defeats × 10) × 100<br />
            + (Wins − Losses × 5) × 5<br />
            + Jobs Completed
          </div>
          <div style={{ color: DIM, fontSize: 10, marginTop: 8 }}>
            Resets daily at midnight ET · weekly Sunday · monthly on the 1st
          </div>
        </div>
      </div>
    </>
  )
}

function Podium({ top3, openDetail }) {
  if (top3.length < 3) return null
  const [first, second, third] = top3
  const h1 = 78, h2 = 60, h3 = 46
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      gap: 8, padding: '8px 4px 0',
    }}>
      <PodiumColumn p={second} place={2} height={h2} color={SILVER} openDetail={openDetail} />
      <PodiumColumn p={first}  place={1} height={h1} color={GOLD}   isWinner openDetail={openDetail} />
      <PodiumColumn p={third}  place={3} height={h3} color={BRONZE} openDetail={openDetail} />
    </div>
  )
}

function PodiumColumn({ p, place, height, color, isWinner, openDetail }) {
  const me = usePlayerCard()
  // Live name/avatar for the player's own podium slot.
  const pc = p.isYou ? { ...p, name: me.name, avatar: me.avatar, emoji: me.emoji } : p
  return (
    <div
      onClick={() => openDetail({ character: pc })}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        minWidth: 0, maxWidth: 110, cursor: 'pointer',
      }}>
      {/* Avatar */}
      <Avatar src={pc.avatar} emoji={pc.emoji}
        size={isWinner ? 60 : 48}
        radius={12}
        style={{
          filter: `drop-shadow(0 0 ${isWinner ? 12 : 6}px ${color}88)`,
          marginBottom: 4,
        }} />

      {/* Name + score */}
      <div style={{
        color: '#fff', fontSize: 12, fontWeight: 500,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        maxWidth: '100%', textAlign: 'center',
      }}>{pc.name}</div>
      <div style={{ color, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
        {streetRep(p).toLocaleString()}
      </div>

      {/* Block */}
      <div style={{
        width: '100%', height,
        background: `linear-gradient(180deg, ${color}33 0%, ${color}10 100%)`,
        border: `1px solid ${color}66`,
        borderBottom: 'none',
        borderRadius: '8px 8px 0 0',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 6,
      }}>
        <div style={{
          color, fontSize: place === 1 ? 24 : 18, fontWeight: 700,
          textShadow: `0 0 8px ${color}66`,
        }}>{place}</div>
      </div>
    </div>
  )
}

function CategoryLeaderboard({ label, subtitle, metricLabel, metric, icon, openDetail }) {
  const me = usePlayerCard()
  const liveName = (p) => p.isYou ? me.name : p.name
  const liveAvatar = (p) => p.isYou ? me.avatar : p.avatar
  const liveEmoji = (p) => p.isYou ? me.emoji : p.emoji
  const ranked = useMemo(() => (
    RANKED_PLAYERS
      .slice()
      .sort((a, b) => metric(b) - metric(a))
      .slice(0, 10)
  ), [metric])

  return (
    <div className="section">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `${GOLD}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className={`ti ${icon}`} style={{ color: GOLD, fontSize: 14 }} />
          </div>
          <div>
            <div style={{ color: GOLD, fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>
              {label.toUpperCase()}
            </div>
            <div style={{ color: DIM, fontSize: 10 }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ color: DIM, fontSize: 9, fontWeight: 600, letterSpacing: 1 }}>{metricLabel}</div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {ranked.map((p, i) => (
          <div key={p.id}
            onClick={() => openDetail({ character: p.isYou ? { ...p, name: me.name, avatar: me.avatar, emoji: me.emoji } : p })}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              borderBottom: i < ranked.length - 1 ? '0.5px solid #1e1e2a' : 'none',
              background: p.isYou ? `${GOLD}10` : 'transparent',
              cursor: 'pointer',
            }}>
            <div style={{
              color: i === 0 ? GOLD : i === 1 ? SILVER : i === 2 ? BRONZE : DIM,
              fontSize: 12, fontWeight: 600, width: 18, textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}>{i + 1}</div>
            <Avatar src={liveAvatar(p)} emoji={liveEmoji(p)} size={28} radius={6} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                color: p.isYou ? GOLD : '#fff',
                fontSize: 13, fontWeight: 500,
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>
                {liveName(p)}{p.isYou ? ' (You)' : ''}
              </div>
            </div>
            <div style={{
              color: i === 0 ? GOLD : '#fff',
              fontSize: 13, fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}>{metric(p).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
