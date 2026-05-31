// Map data loader — fetches the us-atlas topojson once and decodes it into
// GeoJSON FeatureCollections for states + counties. Cached at module scope
// so all consumers share the same parsed payload.
//
// Counties have 5-digit FIPS IDs where the first 2 digits are the state FIPS.
// State IDs are 2-digit FIPS. Both are returned as strings.

import { useEffect, useState } from 'react'
import { feature, neighbors } from 'topojson-client'
import { geoContains } from 'd3-geo'

const URL = `${process.env.PUBLIC_URL || ''}/data/counties-10m.json`

let cached = null
let pending = null

async function loadOnce() {
  if (cached) return cached
  if (pending) return pending
  pending = (async () => {
    const res = await fetch(URL)
    if (!res.ok) throw new Error(`Failed to load map data (${res.status})`)
    const topo = await res.json()
    const states   = feature(topo, topo.objects.states)
    const counties = feature(topo, topo.objects.counties)
    // Precompute county neighbors once — used by Phase 3d adjacency rules.
    // topojson.neighbors returns an array of arrays, parallel to geometries.
    const countyNeighbors = neighbors(topo.objects.counties.geometries)
    const neighborsByCounty = {}
    topo.objects.counties.geometries.forEach((g, i) => {
      const id = String(g.id)
      neighborsByCounty[id] = countyNeighbors[i].map(j =>
        String(topo.objects.counties.geometries[j].id)
      )
    })
    cached = { states, counties, neighborsByCounty }
    return cached
  })()
  return pending
}

export function useMapData() {
  const [data, setData]   = useState(cached)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (cached) return
    let alive = true
    loadOnce()
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) setError(e) })
    return () => { alive = false }
  }, [])

  return { data, error }
}

// State-FIPS → 2-letter postal code lookup. Used to bridge our city data
// (which uses 'TX', 'NY', etc.) with the topojson (which uses '48', '36').
export const STATE_FIPS_TO_CODE = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO',
  '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI',
  '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN',
  '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA',
  '54': 'WV', '55': 'WI', '56': 'WY',
  // Territories — present in topojson but no cities in our data.
  '60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR', '78': 'VI',
}

export const STATE_CODE_TO_FIPS = Object.fromEntries(
  Object.entries(STATE_FIPS_TO_CODE).map(([fips, code]) => [code, fips])
)

// City → county FIPS lookup. For each city's lng/lat we point-in-polygon
// against the counties of just that state (orders of magnitude faster than
// scanning all 3,231 counties). Cached because the mapping is deterministic.
const cityCountyCache = new WeakMap()  // mapData → { [cityId]: fips }

export function buildCityCountyMap(mapData, cities) {
  if (!mapData || !cities) return {}
  if (cityCountyCache.has(mapData)) {
    const cached = cityCountyCache.get(mapData)
    // Reuse cache only if it covers every city we were given.
    if (cities.every(c => cached[c.id] !== undefined)) return cached
  }
  const byStateFips = {}
  mapData.counties.features.forEach(f => {
    const fips = String(f.id).padStart(5, '0')
    const sf = fips.slice(0, 2)
    ;(byStateFips[sf] ||= []).push(f)
  })

  const out = {}
  cities.forEach(c => {
    if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return
    const sf = STATE_CODE_TO_FIPS[c.state]
    const candidates = sf ? byStateFips[sf] || [] : []
    const point = [c.lng, c.lat]
    let found = null
    for (const f of candidates) {
      if (geoContains(f, point)) { found = f; break }
    }
    if (!found) {
      // Edge cases (coastal cities, projection precision): fall back to
      // nearest centroid in the city's state.
      let best = null, bestDist = Infinity
      for (const f of candidates) {
        const [cx, cy] = pathCentroid(f)
        const d = (cx - c.lng) ** 2 + (cy - c.lat) ** 2
        if (d < bestDist) { bestDist = d; best = f }
      }
      found = best
    }
    if (found) out[c.id] = String(found.id).padStart(5, '0')
  })
  cityCountyCache.set(mapData, out)
  return out
}

// Counties grouped by their 2-digit state FIPS, cached per mapData. Lets a
// point lookup scan just one state's counties instead of all ~3,231.
const countiesByStateCache = new WeakMap()
function countiesByState(mapData) {
  if (countiesByStateCache.has(mapData)) return countiesByStateCache.get(mapData)
  const byStateFips = {}
  mapData.counties.features.forEach(f => {
    const fips = String(f.id).padStart(5, '0')
    ;(byStateFips[fips.slice(0, 2)] ||= []).push(f)
  })
  countiesByStateCache.set(mapData, byStateFips)
  return byStateFips
}

// County FIPS (5-digit string) containing geographic point [lng, lat], or null.
// Finds the state by point-in-polygon first (~50 checks), then the county within
// that state — far cheaper than scanning every county. Falls back to a full
// county scan if the point misses every state (coastal/precision edge cases).
export function countyForPoint(mapData, lng, lat) {
  if (!mapData || typeof lng !== 'number' || typeof lat !== 'number') return null
  const point = [lng, lat]
  let stateFips = null
  for (const sf of mapData.states.features) {
    if (geoContains(sf, point)) { stateFips = String(sf.id).padStart(2, '0'); break }
  }
  const candidates = stateFips ? (countiesByState(mapData)[stateFips] || []) : mapData.counties.features
  for (const f of candidates) {
    if (geoContains(f, point)) return String(f.id).padStart(5, '0')
  }
  return null
}

// Lightweight centroid for a single GeoJSON feature — averages the first
// ring's coordinates. Good enough for the fallback-nearest tie-breaker.
function pathCentroid(feature) {
  const ring = (feature.geometry.type === 'Polygon')
    ? feature.geometry.coordinates[0]
    : feature.geometry.coordinates[0]?.[0] || []
  if (!ring.length) return [0, 0]
  let sx = 0, sy = 0
  ring.forEach(([x, y]) => { sx += x; sy += y })
  return [sx / ring.length, sy / ring.length]
}
