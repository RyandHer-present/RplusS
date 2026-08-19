/**
 * Thin wrapper over the Vibration API.
 *
 * Works on Sarah's Android/Chrome. iOS Safari does not implement it at all, so
 * on Ry's phone every call is a no-op — the UI never depends on it firing.
 */
const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

type Pattern = 'tap' | 'select' | 'send' | 'error' | 'success'

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  select: 12,
  send: [10, 30, 18],
  error: [40, 60, 40],
  success: [12, 40, 24],
}

export function haptic(pattern: Pattern = 'tap') {
  if (!supported) return
  try {
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    // Some browsers throw if the page has never been interacted with. Ignore.
  }
}

export const hapticsSupported = supported
