/**
 * Things arriving from outside the app.
 *
 * Two features land on the same mechanism, so they share an implementation:
 *
 *   Sharing in — the manifest declares a share target, and the browser opens
 *   the app with the shared text on the query string.
 *
 *   Shortcuts — an iOS Shortcut cannot call into a web app, but it can open a
 *   URL. So the same parameters are a documented way in, and a Shortcut that
 *   opens one behaves exactly like a share.
 *
 * Read once at startup and then stripped from the address bar, so a refresh
 * does not re-apply whatever was shared an hour ago.
 */

export interface Incoming {
  /** Screen to open, e.g. "chat". */
  to?: string
  /** Text to hand to that screen — a message body, or a link to save. */
  text?: string
}

const SCREENS = ['chat', 'notes', 'gallery', 'fits', 'jam', 'play', 'voice', 'search']

export function readIncoming(): Incoming | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  const shared = [params.get('text'), params.get('url'), params.get('title')]
    .filter(Boolean)
    .join(' ')
    .trim()
  const to = params.get('to')?.toLowerCase()

  if (!shared && !to) return null

  // Take it out of the URL before anything acts on it. Otherwise every
  // subsequent reload re-delivers the same share.
  const clean = window.location.pathname + window.location.hash
  window.history.replaceState(null, '', clean)

  return {
    // Anything unrecognised is ignored rather than trusted — this value comes
    // off a URL, which anything at all can construct.
    to: to && SCREENS.includes(to) ? to : undefined,
    text: shared || undefined,
  }
}

/**
 * Where a shared thing should go. A Spotify link belongs in Jam; everything
 * else is a message.
 */
export function destinationFor(text: string): string {
  return /open\.spotify\.com|spotify\.link/i.test(text) ? '/jam' : '/chat'
}
