// PIN login.
//
// A four-digit PIN is only 10,000 combinations, so the hash is not what makes
// this safe — the rate limiting is. The PIN is checked here, server-side, and
// never ships to the browser. On success we sign in as a real Supabase Auth
// user whose password exists only in this function's secrets, and return that
// genuine session to the client.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const MAX_ATTEMPTS = 8
const LOCKOUT_MINUTES = 15
const PBKDF2_ITERATIONS = 210_000

const ALLOWED_ORIGINS = [
  'https://ryandher-present.github.io',
  'http://localhost:5173',
]

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o))
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

/** Stored as `saltHex:hashHex`. */
async function verifyHash(pin: string, stored: string): Promise<boolean> {
  const [saltHex, expectedHex] = stored.split(':')
  if (!saltHex || !expectedHex) return false

  const salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  )
  const actualHex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')

  // Constant-time compare, so response timing cannot leak how much matched.
  if (actualHex.length !== expectedHex.length) return false
  let diff = 0
  for (let i = 0; i < actualHex.length; i++) diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown'

  // --- rate limit ---------------------------------------------------------
  const { data: record } = await admin
    .from('login_attempts')
    .select('attempts, locked_until')
    .eq('ip', ip)
    .maybeSingle()

  if (record?.locked_until && new Date(record.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(record.locked_until).getTime() - Date.now()) / 60000)
    return new Response(JSON.stringify({ error: `Too many tries. Wait ${mins} min.` }), {
      status: 429,
      headers,
    })
  }

  let pin: string
  try {
    pin = String(((await req.json()) as { pin?: unknown }).pin ?? '')
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers })
  }

  if (!/^\d{4}$/.test(pin)) {
    return new Response(JSON.stringify({ error: 'Wrong PIN' }), { status: 401, headers })
  }

  // --- check the PIN ------------------------------------------------------
  const { data: pins, error: pinsError } = await admin.from('pins').select('user_id, pin_hash')

  if (pinsError || !pins?.length) {
    // Deliberately vague to the caller; the detail belongs in the function logs.
    console.error('pins lookup failed', pinsError)
    return new Response(JSON.stringify({ error: 'Server unavailable' }), { status: 500, headers })
  }

  let matched: string | null = null
  for (const row of pins ?? []) {
    if (await verifyHash(pin, row.pin_hash)) {
      matched = row.user_id
      break
    }
  }

  if (!matched) {
    const attempts = (record?.attempts ?? 0) + 1
    await admin.from('login_attempts').upsert({
      ip,
      attempts,
      locked_until:
        attempts >= MAX_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    return new Response(JSON.stringify({ error: 'Wrong PIN' }), { status: 401, headers })
  }

  // --- issue a real session ----------------------------------------------
  const email = Deno.env.get(`${matched.toUpperCase()}_AUTH_EMAIL`)
  const password = Deno.env.get(`${matched.toUpperCase()}_AUTH_PASSWORD`)
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500, headers })
  }

  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: session, error } = await anon.auth.signInWithPassword({ email, password })

  if (error || !session.session) {
    return new Response(JSON.stringify({ error: 'Sign-in failed' }), { status: 500, headers })
  }

  await admin.from('login_attempts').delete().eq('ip', ip)

  return new Response(
    JSON.stringify({
      user: matched,
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
    }),
    { headers },
  )
})
