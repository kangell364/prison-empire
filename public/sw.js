// Minimal service worker — exists ONLY to make the app installable on Android
// (Chrome requires a registered SW with a fetch handler to offer "Add to home
// screen"). It deliberately does NO caching: every request goes straight to the
// network, so a new Vercel deploy is always picked up immediately and we never
// reintroduce the stale-content problems an offline cache would cause.
//
// If we ever want true offline support, this is where a cache strategy goes —
// but during active testing, network-only is the safe choice.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  // Pass through to the network. (Having a fetch handler at all is what satisfies
  // the installability criteria; we don't intercept or cache anything.)
  event.respondWith(fetch(event.request))
})
