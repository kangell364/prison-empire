// Pinch-zoom + drag-pan gesture controller for SVG maps.
//
// Returns:
//   view       — { scale, tx, ty } — apply as <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
//   ref        — attach to the container div whose size matches the SVG viewBox
//   handlers   — spread on the container div (pointer events)
//   zoomed     — true once scale > 1.001 (cheap "is the user zoomed in" check)
//   resetView  — () => void — snap back to scale 1
//   suppressTap— () => boolean — call inside onClick to decide whether a tap
//                should fire; returns true when the gesture was a drag/pinch.
//
// One-finger drag only pans when already zoomed in, so at default zoom the
// page can still scroll past the map area.

import { useRef, useState } from 'react'

const MIN_SCALE_DEFAULT = 1
const MAX_SCALE_DEFAULT = 8
// Total pointermove distance (client px) past which we treat the gesture as
// a drag and swallow the click that would otherwise fire on release.
const TAP_SLOP_PX = 6

export function useMapGestures({ viewW, viewH, minScale = MIN_SCALE_DEFAULT, maxScale = MAX_SCALE_DEFAULT } = {}) {
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const ref = useRef(null)
  const pointersRef    = useRef(new Map())  // pointerId -> { x, y } in client coords
  const pinchRef       = useRef(null)        // last pinch frame { dist, mid: { x, y } }
  const dragMovedRef   = useRef(0)           // accumulated client-px movement since pointerdown

  function clientToViewBox(clientX, clientY) {
    const r = ref.current.getBoundingClientRect()
    return {
      x: ((clientX - r.left) / r.width)  * viewW,
      y: ((clientY - r.top)  / r.height) * viewH,
    }
  }

  function clamp(s) { return Math.max(minScale, Math.min(maxScale, s)) }

  // Apply a zoom factor `ratio` anchored on the viewBox point (anchorX, anchorY).
  // Keeps the world point currently under the anchor stuck to it after scaling.
  function zoomAt(anchorX, anchorY, ratio) {
    setView(v => {
      const newScale = clamp(v.scale * ratio)
      if (newScale === v.scale) return v
      const worldX = (anchorX - v.tx) / v.scale
      const worldY = (anchorY - v.ty) / v.scale
      return {
        scale: newScale,
        tx: anchorX - worldX * newScale,
        ty: anchorY - worldY * newScale,
      }
    })
  }

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    dragMovedRef.current = 0
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      pinchRef.current = {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        mid:  { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
    }
  }

  function onPointerMove(e) {
    if (!pointersRef.current.has(e.pointerId)) return
    const prev = pointersRef.current.get(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2 && pinchRef.current) {
      // Two-finger pinch: zoom by the ratio of new finger distance to old,
      // anchored on the midpoint between the fingers.
      const [a, b] = [...pointersRef.current.values()]
      const newDist = Math.hypot(b.x - a.x, b.y - a.y)
      const newMid  = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const ratio = newDist / pinchRef.current.dist
      const midSvg = clientToViewBox(pinchRef.current.mid.x, pinchRef.current.mid.y)
      zoomAt(midSvg.x, midSvg.y, ratio)
      pinchRef.current = { dist: newDist, mid: newMid }
      dragMovedRef.current += TAP_SLOP_PX + 1   // any pinch suppresses tap
    } else if (pointersRef.current.size === 1) {
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      dragMovedRef.current += Math.abs(dx) + Math.abs(dy)
      if (view.scale > 1) {
        const r = ref.current.getBoundingClientRect()
        const dxV = (dx / r.width)  * viewW
        const dyV = (dy / r.height) * viewH
        setView(v => ({ ...v, tx: v.tx + dxV, ty: v.ty + dyV }))
      }
    }
  }

  function onPointerUp(e) {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
  }

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  }

  return {
    view,
    ref,
    handlers,
    zoomed: view.scale > 1.001,
    resetView: () => setView({ scale: 1, tx: 0, ty: 0 }),
    suppressTap: () => dragMovedRef.current > TAP_SLOP_PX,
  }
}
