import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// Pin layout width to the actual visual viewport, regardless of how Chrome
// interprets the meta-viewport tag (Desktop-site mode, browser zoom, etc.
// can otherwise make the page render wider than the device screen).
function syncViewportVars() {
  const w = window.innerWidth
  const h = window.innerHeight
  document.documentElement.style.setProperty('--vw', w + 'px')
  document.documentElement.style.setProperty('--vh', h + 'px')
}
syncViewportVars()
window.addEventListener('resize', syncViewportVars)
window.addEventListener('orientationchange', syncViewportVars)

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
