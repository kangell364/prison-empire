// Gang turf leaderboards for the map: a ranked gang list (by blocks owned), a
// per-county board, and the USA-overview state accordion (each state expands to
// its own gang board). Data comes from gangTurf.js, which attributes every owned
// block to a gang and tallies per county / per state.

import React, { useMemo, useState } from 'react'
import { useBlocksVersion } from '../state/blocksStore'
import { useGang } from '../state/gangStore'
import { gangCountyStandings, gangStateStandings } from '../state/gangTurf'

const GOLD = '#c9a84c'

// ---- ranked list (shared) ------------------------------------------
export function GangLeaderboard({ rows, emptyText = 'No turf claimed yet.' }) {
  if (!rows || !rows.length) {
    return <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>{emptyText}</div>
  }
  const top = rows[0].count || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r, i) => (
        <div key={r.id} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
          background: r.isMine ? `${GOLD}14` : '#13131f',
          border: `0.5px solid ${r.isMine ? `${GOLD}55` : '#22222e'}`,
        }}>
          <div style={{ width: 20, textAlign: 'center', color: i === 0 ? GOLD : '#777', fontSize: 13, fontWeight: 800 }}>{i + 1}</div>
          <div style={{ fontSize: 18, lineHeight: 1, width: 24, textAlign: 'center' }}>{r.crest}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: r.isMine ? GOLD : '#fff', fontSize: 13.5, fontWeight: r.isMine ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.name}{r.tag ? <span style={{ color: '#666', fontWeight: 600, marginLeft: 6, fontSize: 11 }}>[{r.tag}]</span> : null}
            </div>
            {/* strength bar relative to the leader */}
            <div style={{ height: 3, background: '#22222e', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(6, (r.count / top) * 100)}%`, height: '100%', background: r.color, opacity: 0.85 }} />
            </div>
          </div>
          <div style={{ color: '#ddd', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {r.count}<span style={{ color: '#666', fontSize: 10, marginLeft: 3, fontWeight: 600 }}>blk</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- county board --------------------------------------------------
export function CountyGangLeaderboard({ mapData, fips, title }) {
  const ver = useBlocksVersion()        // live-refresh on takeovers
  const { myGang } = useGang()          // refresh if you join / found / leave a gang
  const rows = useMemo(
    () => (mapData && fips ? gangCountyStandings(mapData, fips) : []),
    [mapData, fips, ver, myGang?.id],   // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <div>
      {title && (
        <div style={{ color: GOLD, fontSize: 11, fontWeight: 800, letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' }}>
          {title}
        </div>
      )}
      <GangLeaderboard rows={rows} emptyText="No gangs hold turf here yet." />
    </div>
  )
}

// ---- USA overview: one expandable row per active-turf state --------
function StateRow({ mapData, stateFips, stateName, unlockedFips, open, onToggle }) {
  const ver = useBlocksVersion()
  const { myGang } = useGang()
  const rows = useMemo(
    () => (open && mapData ? gangStateStandings(mapData, stateFips, unlockedFips) : []),
    [open, mapData, stateFips, unlockedFips, ver, myGang?.id],   // eslint-disable-line react-hooks/exhaustive-deps
  )
  const leader = rows[0]
  return (
    <div style={{ border: '0.5px solid #22222e', borderRadius: 12, overflow: 'hidden', background: '#0f0f18' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <i className={`ti ti-chevron-${open ? 'down' : 'right'}`} style={{ color: GOLD, fontSize: 15 }} />
        <span style={{ color: '#fff', fontSize: 14.5, fontWeight: 700, flex: 1 }}>{stateName}</span>
        {leader && !open && (
          <span style={{ color: '#888', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
            {leader.crest} {leader.name}
          </span>
        )}
      </button>
      {open && (
        <div style={{ padding: '2px 12px 14px' }}>
          <div style={{ color: GOLD, fontSize: 11, fontWeight: 800, letterSpacing: 0.8, margin: '4px 0 8px', textTransform: 'uppercase' }}>
            {stateName} Gang Leaderboard
          </div>
          <GangLeaderboard rows={rows} emptyText="No gangs hold turf here yet." />
        </div>
      )}
    </div>
  )
}

export function StateTurfAccordion({ mapData, unlockedFips, stateNameByFips }) {
  const [openFips, setOpenFips] = useState(null)
  // States that have any active (unlocked) turf, derived from the unlocked
  // county list — today just Texas. Grows as counties unlock.
  const states = useMemo(() => {
    const seen = new Map()
    for (const f of unlockedFips) {
      const sf = f.slice(0, 2)
      if (!seen.has(sf)) seen.set(sf, { fips: sf, name: (stateNameByFips && stateNameByFips[sf]) || sf })
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [unlockedFips, stateNameByFips])

  // Open the first (only) state by default so the board isn't a closed row.
  const effectiveOpen = openFips ?? (states.length === 1 ? states[0].fips : null)

  if (!states.length) {
    return <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>No states with active turf yet.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {states.map(s => (
        <StateRow
          key={s.fips}
          mapData={mapData}
          stateFips={s.fips}
          stateName={s.name}
          unlockedFips={unlockedFips}
          open={effectiveOpen === s.fips}
          onToggle={() => setOpenFips(effectiveOpen === s.fips ? '__none__' : s.fips)}
        />
      ))}
    </div>
  )
}
