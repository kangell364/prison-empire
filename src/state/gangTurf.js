// Gang turf standings — attributes owned blocks to GANGS and tallies them per
// county / per state, for the turf leaderboards on the map.
//
// The world's block ownership (blocksStore) predates gangs, so there's no stored
// block→gang link. We derive one here:
//   - the player's blocks  → the player's gang (myGang), or a "You" pseudo-gang
//     if they aren't in one yet;
//   - ambient AI turf       → spread deterministically across the 8 named gangs
//     (a stable per-cell hash), turning decorative crew turf into real gang turf;
//   - rival real players    → an "Independents" bucket until real multiplayer
//     groups rivals into gangs (then this resolver swaps to their real gang).
//
// Counting iterates the cells inside a county polygon (cached per FIPS) — only
// unlocked counties are scored, so this stays cheap (one county today).

import { geoBounds, geoContains } from 'd3-geo'
import { GRID, cellCenter, getBlock } from './blocksStore'
import { gangIdentity, getMyGangId, ALL_GANG_IDS } from './gangStore'

const YOU_SOLO = '__you__'          // player not in a gang
const INDIE    = '__independents__' // real rival players, no gang yet

// Same deterministic hash blocksStore uses for ambient state, salted differently
// so the gang spread is independent of the owner/tier rolls.
function frac(x) { return x - Math.floor(x) }
function cellHash(gx, gy, salt) {
  return Math.abs(frac(Math.sin(gx * 12.9898 + gy * 78.233 + salt * 37.719) * 43758.5453))
}
function ambientGangId(gx, gy) {
  const ids = ALL_GANG_IDS
  return ids[Math.floor(cellHash(gx, gy, 7) * ids.length) % ids.length]
}

// Which gang owns this block (or null if vacant / off-board).
function gangIdForBlock(gx, gy, b, myGangId) {
  if (!b || !b.owner) return null
  if (b.owner === 'you')   return myGangId || YOU_SOLO
  if (b.owner === 'rival') return INDIE
  // ambient AI crew (red / blue / purple)
  return ambientGangId(gx, gy)
}

// ---- map block coloring (relative to the player) -------------------
// A 3-color allegiance scheme so the map reads at a glance: GOLD = your own
// block, GREEN = your gang's turf (a gang-mate holds it), RED = anyone else
// (another gang, or an unaffiliated player). Green good, red bad.
export const ALLEGIANCE_COLORS = { you: '#c9a84c', gang: '#2ecc71', enemy: '#e74c3c' }

export function blockAllegiance(gx, gy, b, myGangId) {
  if (!b || !b.owner) return null
  if (b.owner === 'you') return 'you'
  const gid = gangIdForBlock(gx, gy, b, myGangId)
  return (myGangId && gid === myGangId) ? 'gang' : 'enemy'
}

// Color for an owned block on the turf map, relative to `myGangId` (or null).
export function blockColor(gx, gy, b, myGangId) {
  const a = blockAllegiance(gx, gy, b, myGangId)
  return a ? ALLEGIANCE_COLORS[a] : null
}

function identityFor(gid) {
  if (gid === YOU_SOLO) return { id: gid, name: 'You', tag: '', crest: '🎯', color: '#c9a84c', isMine: true }
  if (gid === INDIE)    return { id: gid, name: 'Independents', tag: '', crest: '🏴', color: '#888', isMine: false }
  return gangIdentity(gid)
}

// ---- county cell enumeration (cached per mapData+fips) --------------
const cellCache = new WeakMap()   // mapData → Map(fips → [[gx,gy],...])

function countyCells(mapData, fips) {
  let byFips = cellCache.get(mapData)
  if (!byFips) { byFips = new Map(); cellCache.set(mapData, byFips) }
  if (byFips.has(fips)) return byFips.get(fips)

  const feat = mapData.counties.features.find(f => String(f.id).padStart(5, '0') === fips)
  if (!feat) { byFips.set(fips, []); return [] }
  const [[w, s], [e, n]] = geoBounds(feat)
  const gx0 = Math.floor(w / GRID), gx1 = Math.floor(e / GRID)
  const gy0 = Math.floor(s / GRID), gy1 = Math.floor(n / GRID)
  const cells = []
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) {
      const [lat, lng] = cellCenter(gx, gy)
      if (geoContains(feat, [lng, lat])) cells.push([gx, gy])
    }
  }
  byFips.set(fips, cells)
  return cells
}

// ---- raw counts ----------------------------------------------------
// Block counts per gangId for one county. Returns a plain { gangId: count }.
function countyCounts(mapData, fips) {
  if (!mapData) return {}
  const myGangId = getMyGangId()
  const counts = {}
  for (const [gx, gy] of countyCells(mapData, fips)) {
    const gid = gangIdForBlock(gx, gy, getBlock(gx, gy), myGangId)
    if (gid) counts[gid] = (counts[gid] || 0) + 1
  }
  return counts
}

function countsToRows(counts, { topN = 50 } = {}) {
  return Object.entries(counts)
    .map(([gid, count]) => ({ ...identityFor(gid), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
}

// ---- public API ----------------------------------------------------

// Ranked gang rows for a single county. Each row: { id, name, tag, crest,
// color, isMine, count }.
export function gangCountyStandings(mapData, fips, opts) {
  return countsToRows(countyCounts(mapData, fips), opts)
}

// Ranked gang rows for a whole state = sum of its UNLOCKED counties.
export function gangStateStandings(mapData, stateFips, unlockedFips, opts) {
  const total = {}
  for (const fips of unlockedFips) {
    if (fips.slice(0, 2) !== stateFips) continue
    const c = countyCounts(mapData, fips)
    for (const gid in c) total[gid] = (total[gid] || 0) + c[gid]
  }
  return countsToRows(total, opts)
}
