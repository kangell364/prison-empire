import React, { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const TOKEN = process.env.REACT_APP_MAPBOX_TOKEN

if (TOKEN) mapboxgl.accessToken = TOKEN

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#666'

export function MapboxMap({ cities, onCityClick, height = '60vh' }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-98.5795, 39.8283],
      zoom: 3.4,
      minZoom: 3,
      maxZoom: 14,
      maxBounds: [[-170, 15], [-50, 72]],
      attributionControl: false,
      // Two-finger pan/zoom on mobile so the page can still scroll vertically.
      cooperativeGestures: true,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('error', (e) => {
      const msg = e?.error?.message || e?.error?.toString() || 'Unknown map error'
      if (msg.includes('source') && msg.includes('not exist')) return
      console.error('Mapbox error:', e)
      setError(msg)
    })

    // Force a resize once the container has actually been laid out — fixes
    // the "all-gray, no tiles" case where Mapbox initialized before the
    // container had nonzero dimensions (common when rendered inside flex
    // containers or sheets that animate in).
    const resizeTimer = setTimeout(() => {
      try { map.resize() } catch {}
    }, 200)

    // Fallback: if 6 s pass and we have neither tiles nor an error, surface
    // a generic "still loading" hint so the user knows something is off.
    const loadFallbackTimer = setTimeout(() => {
      if (!loaded && !error) {
        setError('Tiles never loaded. Likely causes: token URL restriction blocking prison-empire.vercel.app, missing styles:tiles scope, or a network filter.')
      }
    }, 6000)

    map.on('load', () => {
      setLoaded(true)
      clearTimeout(loadFallbackTimer)
      try { map.resize() } catch {}
      // Tint the base style a touch warmer + darker so it feels like our app.
      try {
        map.setPaintProperty('water', 'fill-color', '#0a0e15')
        map.setPaintProperty('land', 'background-color', '#0d0d15')
      } catch {/* layer name varies by style version; safe to skip */}

      // ---- City source + layers --------------------------------------
      const features = (cities || [])
        .filter(c => typeof c.lat === 'number' && typeof c.lng === 'number')
        .map(c => ({
          type: 'Feature',
          properties: {
            id: c.id,
            name: c.name,
            tier: c.tier,
            isYours: !!c.isYours,
            hasOwner: !!c.owner && !c.isYours,
          },
          geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        }))

      map.addSource('cities', { type: 'geojson', data: { type: 'FeatureCollection', features } })

      // Glow halo behind each pin (bigger, blurry, semi-transparent)
      map.addLayer({
        id: 'cities-glow',
        type: 'circle',
        source: 'cities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'tier'], 1, 10, 3, 22],
          'circle-color': [
            'case',
            ['get', 'isYours'],  GOLD,
            ['get', 'hasOwner'], RED,
            DIM,
          ],
          'circle-opacity': 0.35,
          'circle-blur': 0.9,
        },
      })

      // Solid pin
      map.addLayer({
        id: 'cities',
        type: 'circle',
        source: 'cities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'tier'], 1, 5, 3, 10],
          'circle-color': [
            'case',
            ['get', 'isYours'],  GOLD,
            ['get', 'hasOwner'], RED,
            DIM,
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#0a0a0f',
        },
      })

      // City name labels — only show major cities at low zoom to avoid clutter
      map.addLayer({
        id: 'cities-label',
        type: 'symbol',
        source: 'cities',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 0, 4, 10, 7, 13],
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': [
            'case',
            ['get', 'isYours'],  GOLD,
            ['get', 'hasOwner'], RED,
            '#888',
          ],
          'text-halo-color': '#0a0a0f',
          'text-halo-width': 1.2,
        },
        filter: ['>=', ['get', 'tier'], 2],  // hide tier-1 labels until zoomed
      })

      // ---- Interactions ----------------------------------------------
      map.on('click', 'cities', (e) => {
        if (!e.features?.length) return
        const id = e.features[0].properties.id
        const city = cities.find(c => c.id === id)
        if (city && onCityClick) onCityClick(city)
      })
      // Also catch clicks on the glow layer (bigger tap target)
      map.on('click', 'cities-glow', (e) => {
        if (!e.features?.length) return
        const id = e.features[0].properties.id
        const city = cities.find(c => c.id === id)
        if (city && onCityClick) onCityClick(city)
      })

      map.on('mouseenter', 'cities', () => map.getCanvas().style.cursor = 'pointer')
      map.on('mouseleave', 'cities', () => map.getCanvas().style.cursor = '')
    })

    return () => {
      clearTimeout(resizeTimer)
      clearTimeout(loadFallbackTimer)
      try { map.remove() } catch {}
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fly to fit if the cities prop changes (e.g., new territory)
  useEffect(() => {
    if (!TOKEN) return
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('cities')
    if (!src || !cities) return
    src.setData({
      type: 'FeatureCollection',
      features: cities
        .filter(c => typeof c.lat === 'number' && typeof c.lng === 'number')
        .map(c => ({
          type: 'Feature',
          properties: {
            id: c.id,
            name: c.name,
            tier: c.tier,
            isYours: !!c.isYours,
            hasOwner: !!c.owner && !c.isYours,
          },
          geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        })),
    })
  }, [cities])

  if (!TOKEN) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0d0d15', color: '#888', fontSize: 12, padding: 20, textAlign: 'center',
      }}>
        Map unavailable — REACT_APP_MAPBOX_TOKEN is not set on this build.
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 16, overflow: 'hidden' }} />
      {error && (
        <div style={{
          position: 'absolute', left: 10, right: 10, bottom: 10,
          background: '#1a0808', border: '0.5px solid #8b1a1a',
          borderRadius: 8, padding: '8px 10px',
          color: '#ff8a8a', fontSize: 11, lineHeight: 1.4,
          fontFamily: 'ui-monospace, monospace',
          maxHeight: 80, overflow: 'auto',
        }}>
          <strong style={{ color: '#ff4747' }}>Mapbox error:</strong> {error}
        </div>
      )}
    </div>
  )
}
