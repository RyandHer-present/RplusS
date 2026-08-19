import type { UserId } from '../store/session'

export type VerifyResult = { user: UserId } | { error: string }

/**
 * PIN verification.
 *
 * Phase 2 points this at a Supabase Edge Function that checks a bcrypt hash and
 * mints a session JWT. Until that exists there is a local dev path, but the PINs
 * are read from `.env.local` (gitignored) rather than written here — this repo
 * and its built bundle are both public, so a literal PIN in source would leak.
 *
 * With no env values configured, sign-in is simply unavailable. That is
 * deliberate: the deployed Phase 3 build should not have a working lock.
 */
const DEV_PINS: Record<string, UserId> = {}

if (import.meta.env.VITE_DEV_PIN_RY) DEV_PINS[import.meta.env.VITE_DEV_PIN_RY] = 'ry'
if (import.meta.env.VITE_DEV_PIN_SARAH) DEV_PINS[import.meta.env.VITE_DEV_PIN_SARAH] = 'sarah'

export const authConfigured = Object.keys(DEV_PINS).length > 0

export async function verifyPin(pin: string): Promise<VerifyResult> {
  // Matches realistic network latency so the UI timing we tune now stays honest
  // once this becomes a real round trip.
  await new Promise((r) => setTimeout(r, 260))

  if (!authConfigured) {
    return { error: 'Not connected yet' }
  }

  const user = DEV_PINS[pin]
  return user ? { user } : { error: 'Wrong PIN' }
}
