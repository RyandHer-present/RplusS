// "Someone opened the site" alert.
//
// The Discord webhook URL lives in this function's secrets and never leaves the
// server. That is the whole reason this function exists: the previous version
// posted to Discord from the browser, which meant the URL was compiled into the
// bundle for anyone to read, and someone duly found it and abused it.
//
// The address is read from the request headers here rather than asked of a
// third party, so there is no ipify call to be blocked, and no value the caller
// can set for themselves.

import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Per-address quiet period. An alert fires the moment someone arrives; further
 * opens from that same address inside this window are counted but not posted,
 * and the next alert says how many were held back. Flood protection only —
 * lower it if you would rather have the noise.
 */
const COOLDOWN_SECONDS = 60

const ALLOWED_ORIGINS = ['https://ryandher-present.github.io', 'http://localhost:5173']

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o))
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

/**
 * Everything the browser sends is untrusted display text. Cap its length and
 * drop backticks and control characters, so a crafted user agent cannot break
 * out of its code span and forge the rest of the message.
 */
function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const stripped = value.replace(/[\u0000-\u001f\u007f`]/g, ' ').trim().slice(0, max)
  return stripped.length ? stripped : null
}

const NAMES: Record<string, string> = { ry: 'Ry', sarah: 'Sarah', admin: 'admin' }

/** Milliseconds as something a person reads at a glance. */
function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  const webhook = Deno.env.get('DISCORD_WEBHOOK_URL')
  // Not configured is a valid state — it is how the alerts get switched off.
  if (!webhook) return new Response(JSON.stringify({ ok: true }), { headers })

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown'

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    // An empty body is fine; the address alone is still worth reporting.
  }

  const leaving = body.event === 'leave'

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // --- flood protection ----------------------------------------------------
  // Keyed by address *and* event, so an arrival cannot swallow the departure
  // that follows it a minute later. Each kind gets its own quiet period.
  const key = leaving ? `${ip}#leave` : ip

  const now = Date.now()
  const { data: seen } = await admin
    .from('visit_alerts')
    .select('last_alert_at, suppressed')
    .eq('ip', key)
    .maybeSingle()

  const since = seen ? now - new Date(seen.last_alert_at).getTime() : Infinity

  if (since < COOLDOWN_SECONDS * 1000) {
    await admin
      .from('visit_alerts')
      .update({ suppressed: (seen?.suppressed ?? 0) + 1 })
      .eq('ip', key)
    // Deliberately indistinguishable from a delivered alert. The caller has no
    // business knowing whether one was sent.
    return new Response(JSON.stringify({ ok: true }), { headers })
  }

  const held = seen?.suppressed ?? 0
  await admin
    .from('visit_alerts')
    .upsert({ ip: key, last_alert_at: new Date(now).toISOString(), suppressed: 0 })

  // --- known device --------------------------------------------------------
  const deviceId = clean(body.deviceId, 64)
  const role = typeof body.role === 'string' ? NAMES[body.role] ?? null : null

  let deviceLine = 'id not sent'
  let deviceKnown = false

  if (deviceId) {
    const { data: device } = await admin
      .from('visit_devices')
      .select('first_seen_at, visits')
      .eq('device_id', deviceId)
      .maybeSingle()

    if (device) {
      deviceKnown = true
      const first = new Date(device.first_seen_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      // A departure is the same visit as the arrival that preceded it, so it
      // reports the count without adding to it.
      const count = leaving ? device.visits : device.visits + 1
      deviceLine = `seen before — ${count} visits since ${first}`

      if (!leaving) {
        await admin
          .from('visit_devices')
          .update({
            last_seen_at: new Date(now).toISOString(),
            visits: device.visits + 1,
            last_role: role,
          })
          .eq('device_id', deviceId)
      }
    } else {
      deviceLine = leaving ? 'not recorded arriving' : '**NEW — never seen before**'
      if (!leaving) {
        await admin.from('visit_devices').insert({ device_id: deviceId, last_role: role })
      }
    }
  }

  // --- post it -------------------------------------------------------------
  // Discord renders these in whoever is reading, in their own timezone, so the
  // time is right on a phone in another country without any conversion here.
  const unix = Math.floor(now / 1000)

  const lines = [
    `**When** <t:${unix}:f> (<t:${unix}:R>)`,
    `**IP** \`${ip}\``,
    `**Who** ${role ? `signed in as \`${role}\`` : '`not signed in`'}`,
    `**Device** ${deviceLine}`,
  ]

  if (leaving) {
    const stayed = typeof body.stayedMs === 'number' ? body.stayedMs : null
    if (stayed !== null && stayed >= 0) {
      lines.push(`**Stayed** \`${duration(stayed)}\``)
    }
  }

  const ua = clean(body.userAgent, 240)
  const screen = clean(body.screen, 20)
  const language = clean(body.language, 20)
  const timezone = clean(body.timezone, 60)
  const referrer = clean(body.referrer, 200)

  if (ua) lines.push(`**Browser** \`${ua}\``)
  if (screen) lines.push(`**Screen** \`${screen}\``)
  if (language) lines.push(`**Language** \`${language}\``)
  if (timezone) lines.push(`**Timezone** \`${timezone}\``)
  if (referrer) lines.push(`**Came from** \`${referrer}\``)
  if (held) {
    lines.push(`\n_${held} more open${held === 1 ? '' : 's'} from this address were held back._`)
  }

  // Red for anything unrecognised, pink for a known device that is signed in,
  // so the colour alone tells you whether to look closer.
  const known = role !== null && deviceKnown

  const title = leaving
    ? known
      ? 'Left the site'
      : 'Left the site — unrecognised'
    : known
      ? 'Site opened'
      : 'Site opened — unrecognised'

  const payload = {
    username: 'R+S watch',
    embeds: [
      {
        title,
        description: lines.join('\n'),
        // Grey for a departure: a record, rather than something to look at now.
        color: leaving ? 0x8e8e96 : known ? 0xff5cf0 : 0xff3b30,
        timestamp: new Date(now).toISOString(),
        footer: { text: new Date(now).toUTCString() },
      },
    ],
  }

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    // A dead or rate-limited webhook must not become an error on the page.
    console.error('discord post failed', error)
  }

  return new Response(JSON.stringify({ ok: true }), { headers })
})
