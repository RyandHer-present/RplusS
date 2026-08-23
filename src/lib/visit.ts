import { supabase } from './supabase'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/visit`

const DEVICE_KEY = 'rpluss.device'
const SESSION_KEY = 'rpluss.session'
const ARRIVED_KEY = 'rpluss.arrived'

/**
 * Tells the `visit` Edge Function that the page was opened.
 *
 * Nothing sensitive is in here. The Discord webhook and the address lookup both
 * live server-side now — an earlier version did both from the browser, which
 * put the webhook URL in the bundle where someone found it and abused it. All
 * this sends is what only the browser knows; the address comes from the request
 * headers at the other end, where the caller cannot choose it.
 *
 * Fires on every open and every refresh. The quiet period that stops that
 * becoming a flood is enforced in the function, not here, so a visitor cannot
 * skip it by clearing storage.
 *
 * Fire and forget. Nothing in here is allowed to be visible on the page.
 */
export function reportVisit() {
  if (!supabase) return

  try {
    sessionStorage.setItem(ARRIVED_KEY, String(Date.now()))
  } catch {
    // Storage disabled. The leave report simply omits how long they stayed.
  }

  void send('enter')
  watchForLeaving()
}

/**
 * Reports the moment they go.
 *
 * A leaving page cannot wait for a normal request, and on a phone it is often
 * never "unloaded" at all — it is backgrounded and killed later with nothing
 * running. So this fires on `pagehide` and on the tab being hidden, whichever
 * comes first, and sends a beacon: the browser takes ownership of delivering
 * it after the page is gone.
 *
 * The beacon is sent as text/plain deliberately. It is one of the three types
 * that need no CORS preflight, and a beacon cannot answer a preflight, so any
 * other content type would simply never arrive. The function reads the body as
 * JSON regardless of what the header claims.
 */
function watchForLeaving() {
  let sent = false

  const leave = () => {
    if (sent) return
    sent = true

    const payload = JSON.stringify({ ...details(), event: 'leave', stayedMs: stayed() })
    try {
      navigator.sendBeacon(FUNCTION_URL, new Blob([payload], { type: 'text/plain' }))
    } catch {
      // Nothing to be done from a page that is already going.
    }
  }

  // Coming back after being hidden counts as arriving again, so a phone put
  // down and picked up reads as leave then enter rather than going quiet.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') leave()
    else if (sent) {
      sent = false
      void send('enter')
    }
  }

  window.addEventListener('pagehide', leave)
  document.addEventListener('visibilitychange', onVisibility)
}

/** How long this visit has lasted, or null when it cannot be known. */
function stayed(): number | null {
  try {
    const started = Number(sessionStorage.getItem(ARRIVED_KEY))
    return started ? Date.now() - started : null
  } catch {
    return null
  }
}

/**
 * A random id kept in local storage, so the alert can say whether this browser
 * has been here before. It identifies a browser, not a person, and it is the
 * browser's own — clearing site data earns a fresh one and the next alert reads
 * as a new device, which is the right way round for a warning to fail.
 */
function deviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    // Private mode with storage disabled. Every visit looks new; fine.
    return null
  }
}

/**
 * Who this browser was last signed in as, read straight from the persisted
 * store rather than the React tree — this runs before the app mounts, and the
 * point is to know who it is *before* the lock screen is answered.
 */
function lastRole(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { role?: unknown } }
    const role = parsed.state?.role
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}

/** Everything the browser knows that is worth saying, on either event. */
function details() {
  return {
    deviceId: deviceId(),
    role: lastRole(),
    userAgent: navigator.userAgent.slice(0, 240),
    screen: `${screen.width}x${screen.height}`,
    language: navigator.language,
    timezone: tz(),
    referrer: document.referrer.slice(0, 200) || null,
  }
}

async function send(event: 'enter' | 'leave') {
  try {
    await supabase!.functions.invoke('visit', {
      body: { ...details(), event },
    })
  } catch {
    // Offline, blocked, or the function is down. Never surfaces.
  }
}

function tz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
