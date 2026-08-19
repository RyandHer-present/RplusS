import { supabase, supabaseConfigured } from './supabase'
import type { UserId } from '../store/session'

export type VerifyResult = { user: UserId } | { error: string }

/**
 * The PIN is checked server-side by the `pin-login` Edge Function, which holds
 * the hashes and the rate limiting. It is never compared in the browser, and it
 * appears nowhere in this repo or the deployed bundle.
 *
 * On success the function returns a real Supabase session, which we install
 * here so every later request carries a proper identity for RLS to check.
 */
export const authConfigured = supabaseConfigured

export async function verifyPin(pin: string): Promise<VerifyResult> {
  if (!supabase) return { error: 'Not connected' }

  try {
    const { data, error } = await supabase.functions.invoke('pin-login', {
      body: { pin },
    })

    if (error) {
      // Non-2xx responses land here; the body still carries our message.
      const message = await readFunctionError(error)
      return { error: message }
    }

    const { user, access_token, refresh_token } = data as {
      user: UserId
      access_token: string
      refresh_token: string
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })
    if (sessionError) return { error: 'Could not start session' }

    return { user }
  } catch {
    return { error: 'No connection' }
  }
}

/** Pulls the server's message out of a FunctionsHttpError without leaking internals. */
async function readFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      // Fall through to the generic message.
    }
  }
  return 'Something went wrong'
}

export async function signOutRemote() {
  await supabase?.auth.signOut()
}
