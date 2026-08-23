import { supabase } from './supabase'

const DEVICE_KEY = 'rpluss.device'
const SESSION_KEY = 'rpluss.session'

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
  void send()
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

async function send() {
  try {
    await supabase!.functions.invoke('visit', {
      body: {
        deviceId: deviceId(),
        role: lastRole(),
        userAgent: navigator.userAgent.slice(0, 240),
        screen: `${screen.width}x${screen.height}`,
        language: navigator.language,
        timezone: tz(),
        referrer: document.referrer.slice(0, 200) || null,
      },
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
