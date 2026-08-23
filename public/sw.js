/*
 * Service worker.
 *
 * Two jobs, and deliberately no more: make the app open instantly and survive
 * a dead connection, without ever serving stale data.
 *
 * The split that matters is between the shell and the content. Built assets
 * carry a content hash in their filename, so a given URL's bytes never change
 * and can be cached forever. The HTML entry point has no hash, so it is fetched
 * from the network first and only falls back to cache when offline — otherwise
 * a deploy would never reach a phone that had opened the app once.
 *
 * Everything that is not same-origin is left alone entirely. Supabase and
 * Backblaze requests must not be touched: caching a message list would show
 * one of you a conversation that has moved on, which is worse than a spinner.
 */

const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`

const BASE = new URL('./', self.location).pathname
const INDEX = `${BASE}index.html`

// Enough to render something recognisable with no connection at all.
const PRECACHE = [BASE, INDEX, `${BASE}manifest.webmanifest`, `${BASE}icon-180.png`]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      // Individually, so one 404 cannot fail the whole install.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS])
      const names = await caches.keys()
      await Promise.all(names.map((name) => (keep.has(name) ? null : caches.delete(name))))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // --- the page itself ---------------------------------------------------
  // Network first: a deploy has to be able to reach a phone that already has
  // the old one cached.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          const cache = await caches.open(SHELL)
          cache.put(INDEX, fresh.clone())
          return fresh
        } catch {
          const cached = await caches.match(INDEX)
          return cached ?? Response.error()
        }
      })(),
    )
    return
  }

  // --- hashed build output -----------------------------------------------
  // The filename changes whenever the bytes do, so a hit is always correct.
  if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached

        const fresh = await fetch(request)
        if (fresh.ok) {
          const cache = await caches.open(ASSETS)
          cache.put(request, fresh.clone())
        }
        return fresh
      })(),
    )
    return
  }

  // --- icons, manifest, anything else we ship ----------------------------
  // Serve what we have, refresh it in the background for next time.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request)
      const network = fetch(request)
        .then((fresh) => {
          if (fresh.ok) caches.open(SHELL).then((cache) => cache.put(request, fresh.clone()))
          return fresh
        })
        .catch(() => cached ?? Response.error())

      return cached ?? network
    })(),
  )
})

// Lets the page tell a waiting worker to take over immediately, rather than
// waiting for every tab to close.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting()
})
