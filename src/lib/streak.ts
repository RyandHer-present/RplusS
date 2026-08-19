/**
 * Streak maths, kept free of any date-library or timezone guesswork.
 *
 * Days are plain `YYYY-MM-DD` strings resolved in the poster's own timezone,
 * so a photo posted at 11pm counts for that night rather than sliding into
 * tomorrow because the server is on UTC.
 */

/** Today in the device's own timezone, as `YYYY-MM-DD`. */
export function localDay(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Shifts a `YYYY-MM-DD` string by whole days, staying calendar-correct. */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  // Constructing from parts (not parsing the string) keeps this in local time
  // and lets the Date object roll month and year boundaries for us.
  return localDay(new Date(y, m - 1, d + delta))
}

/**
 * Counts consecutive days ending today, or ending yesterday if nothing has been
 * posted yet today — so an unbroken streak does not appear to reset every
 * morning before you have had a chance to post.
 */
export function computeStreak(days: Iterable<string>, today = localDay()): number {
  const posted = new Set(days)
  if (posted.size === 0) return 0

  let cursor = posted.has(today) ? today : shiftDay(today, -1)
  if (!posted.has(cursor)) return 0

  let streak = 0
  while (posted.has(cursor)) {
    streak++
    cursor = shiftDay(cursor, -1)
  }
  return streak
}
