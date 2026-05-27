import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const GOLD = '#c9a84c'
const RED  = '#e74c3c'
const DIM  = '#888'

// Free dark basemap from Carto. No API key, served by their public CDN.
// Falls back to OSM tiles if Carto ever becomes unreachable.
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

export function LeafletMap({ cities, onCityClick, height = '60vh' }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [39.8283, -98.5795],   // geographic center of contiguous US
      zoom: 4,
      minZoom: 3,
      maxZoom: 12,
      maxBounds: [[15, -170], [72, -50]],
      maxBoundsViscosity: 0.8,
      zoomControl: true,
      attributionControl: false,
      // On mobile, disable dragging so single-finger scrolls the page.
      // Desktop keeps full pan/zoom.
      dragging: !L.Browser.mobile,
      tap: !L.Browser.mobile,
      scrollWheelZoom: !L.Browser.mobile,
    })
    mapRef.current = map

    const tiles = L.tileLayer(DARK_TILES, {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: ATTRIBUTION,
    })
    tiles.on('tileerror', (e) => {
      console.warn('Tile load error:', e)
      setError('Tiles failed to load — your network may be blocking the tile server.')
    })
    tiles.addTo(map)

    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)

    // Force a resize once the container has dimensions
    const resizeTimer = setTimeout(() => {
      try { map.invalidateSize() } catch {}
    }, 200)

    return () => {
      clearTimeout(resizeTimer)
      try { map.remove() } catch {}
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Render / re-render city pins when the list changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !cities) return

    // Layer group so we can wipe + redraw on prop change
    const layer = L.layerGroup().addTo(map)

    cities.forEach(c => {
      if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return
      const color  = c.isYours ? GOLD : c.owner ? RED : DIM
      const radius = c.tier === 3 ? 8 : c.tier === 2 ? 6 : 4

      // Glow halo (non-interactive)
      L.circleMarker([c.lat, c.lng], {
        radius: radius * 2.4,
        weight: 0,
        fillColor: color,
        fillOpacity: 0.25,
        interactive: false,
      }).addTo(layer)

      // Solid pin (clickable)
      const pin = L.circleMarker([c.lat, c.lng], {
        radius,
        color: '#0a0a0f',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(layer)

      pin.on('click', () => onCityClick && onCityClick(c))

      // Permanent label on tier 2+ cities
      if (c.tier >= 2) {
        pin.bindTooltip(c.name, {
          permanent: true,
          direction: 'bottom',
          offset: [0, radius + 2],
          className: 'city-label',
        })
      } else {
        pin.bindTooltip(c.name, { direction: 'top', offset: [0, -radius] })
      }
    })

    return () => { map.removeLayer(layer) }
  }, [cities, onCityClick])

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div ref={containerRef} style={{
        width: '100%', height: '100%',
        borderRadius: 16, overflow: 'hidden',
        background: '#0d0d15',
      }} />
      {error && (
        <div style={{
          position: 'absolute', left: 10, right: 10, bottom: 10,
          background: '#1a0808', border: '0.5px solid #8b1a1a',
          borderRadius: 8, padding: '8px 10px',
          color: '#ff8a8a', fontSize: 11, lineHeight: 1.4,
          fontFamily: 'ui-monospace, monospace',
        }}>
          <strong style={{ color: '#ff4747' }}>Map error:</strong> {error}
        </div>
      )}
    </div>
  )
}
