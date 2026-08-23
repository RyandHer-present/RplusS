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

/*
 * Push.
 *
 * Three jobs now, then. A push arrives whether or not the app is open, which is
 * the entire reason this feature exists — on iOS the page is not merely hidden
 * when closed, it is gone, and this worker is the only thing left running.
 *
 * The badge is set here as well as in the app, because setting it from the page
 * only ever works while the page exists.
 */

const NOTIFY_TAG = 'rpluss'

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload = {}
      try {
        payload = event.data ? event.data.json() : {}
      } catch {
        // A push with no readable payload still means "something happened", so
        // it is worth showing rather than swallowing.
      }

      const title = payload.title || 'R+S'
      const body = payload.body || 'Something new'
      const path = payload.path || '/chat'

      // Count what is already waiting so a second notification replaces the
      // first rather than stacking, and the icon number stays truthful.
      const existing = await self.registration.getNotifications({ tag: NOTIFY_TAG })
      const count = existing.length + 1

      if (self.registration.showNotification) {
        await self.registration.showNotification(title, {
          body,
          tag: NOTIFY_TAG,
          renotify: true,
          icon: './icon-192.png',
          badge: './icon-192.png',
          data: { path },
          timestamp: payload.at ? Date.parse(payload.at) : Date.now(),
        })
      }

      if (self.navigator && 'setAppBadge' in self.navigator) {
        try {
          await self.navigator.setAppBadge(count)
        } catch {
          // Permission or platform. The notification itself still landed.
        }
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = (event.notification.data && event.notification.data.path) || '/chat'

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Reuse an open tab rather than opening a second copy of the app.
      for (const client of clients) {
        if (client.url.includes('/RplusS') && 'focus' in client) {
          await client.focus()
          client.postMessage({ type: 'navigate', path })
          return
        }
      }
      await self.clients.openWindow(`/RplusS/#${path}`)
    })(),
  )
})

// A subscription can be rotated by the browser without asking. When that
// happens the old endpoint is dead and the page has to register the new one, so
// the app is told the next time it opens.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) client.postMessage({ type: 'resubscribe' })
    })(),
  )
})
