// Dev-mode gate for test-only affordances (e.g. the "+20 packs" button).
// Hidden from normal players in production. Enabled when ANY of:
//   • running on localhost / 127.0.0.1 (your dev server), or
//   • the URL has ?dev=1 — which persists via localStorage so it stays on
//     across reloads on the live site. Turn it back off with ?dev=0.
let cached = null

export function isDevMode() {
  if (cached !== null) return cached
  try {
    const dev = new URLSearchParams(window.location.search).get('dev')
    if (dev === '0') { localStorage.removeItem('pe_dev'); cached = false; return cached }  // explicit off wins, even on localhost
    if (dev === '1') localStorage.setItem('pe_dev', '1')
    const host = window.location.hostname
    const onLocalhost = host === 'localhost' || host === '127.0.0.1'
    cached = onLocalhost || localStorage.getItem('pe_dev') === '1'
  } catch {
    cached = false
  }
  return cached
}
