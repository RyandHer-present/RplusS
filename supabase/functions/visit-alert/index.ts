// Visit alerting.
//
// Posts to Discord when someone opens the site, with the address they came
// from. This runs server-side for two reasons, and the first one is not
// optional:
//
//  1. The webhook URL is a credential. Anyone holding it can post to the
//     channel and can DELETE the webhook outright. The browser bundle is
//     public — it is served off GitHub Pages from a public repo — so a webhook
//     shipped to the client would be readable by exactly the person this is
//     meant to catch, who could then silence it. Here it lives in the function
//     secret store and never leaves the server.
//  2. Only the server sees the real client address. In the browser you would
//     have to ask some third-party "what is my IP" service, which means
//     handing every visit to another company and trusting their answer.
//
// The endpoint is deliberately unauthenticated — it has to fire before anyone
// logs in — so the throttling below is what stops it being used as a way to
// spam the channel.

import { createClient } from 'jsr:@supabase/supabase-js@2'

/** At most one alert per address in this many hours. */
const QUIET_HOURS = 12

/** And no more than this many alerts an hour in total, whatever happens. */
const GLOBAL_HOURLY_CAP = 20

const MAX_FIELD = 300

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

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, MAX_FIELD)
  return trimmed.length ? trimmed : null
}

/** Discord renders this as a card. Kept short enough to read on a phone. */
function buildMessage(opts: {
  ip: string
  hits: number
  firstSeen: string
  isNew: boolean
  userAgent: string | null
  referrer: string | null
}) {
  const { ip, hits, firstSeen, isNew, userAgent, referrer } = opts
  return {
    username: 'R+S watch',
    embeds: [
      {
        title: isNew ? 'New address opened the site' : 'Site opened',
        color: isNew ? 0xff5cf0 : 0x21d4fd,
        fields: [
          { name: 'IP', value: '`' + ip + '`', inline: true },
          { name: 'Visits', value: String(hits), inline: true },
          { name: 'First seen', value: `<t:${Math.floor(new Date(firstSeen).getTime() / 1000)}:R>`, inline: true },
          { name: 'Browser', value: userAgent ? '`' + userAgent + '`' : 'unknown' },
          ...(referrer ? [{ name: 'Came from', value: '`' + referrer + '`' }] : []),
        ],
        footer: {
          text: isNew
            ? 'Never seen before. Worth a look.'
            : `Quiet for ${QUIET_HOURS}h per address.`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  // Nothing here is worth failing a page load over. Every path below returns
  // 200 with a quiet body; the detail goes to the function logs.
  const ok = () => new Response(JSON.stringify({ ok: true }), { headers })

  const webhook = Deno.env.get('DISCORD_WEBHOOK_URL')
  if (!webhook) {
    console.error('DISCORD_WEBHOOK_URL is not set')
    return ok()
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown'

  let body: { ua?: unknown; ref?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // A body is a nicety, not a requirement.
  }
  const userAgent = clean(body.ua)
  const referrer = clean(body.ref)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const now = new Date()

  const { data: existing } = await admin
    .from('visit_log')
    .select('first_seen, hits, last_alert')
    .eq('ip', ip)
    .maybeSingle()

  const hits = (existing?.hits ?? 0) + 1
  const firstSeen = existing?.first_seen ?? now.toISOString()
  const isNew = !existing

  // Record the visit whether or not it earns an alert, so the history is
  // complete even during a quiet period.
  await admin.from('visit_log').upsert({
    ip,
    first_seen: firstSeen,
    last_seen: now.toISOString(),
    hits,
    last_alert: existing?.last_alert ?? null,
    user_agent: userAgent,
    referrer,
  })

  // --- should this one speak up? -------------------------------------------

  const quietUntil = existing?.last_alert
    ? new Date(existing.last_alert).getTime() + QUIET_HOURS * 3_600_000
    : 0
  if (quietUntil > now.getTime()) return ok()

  // A public endpoint can be called by anyone with the URL. Per-address
  // throttling handles the ordinary case; this is the backstop that stops a
  // caller with a lot of addresses turning the channel into a firehose.
  const { count } = await admin
    .from('visit_log')
    .select('ip', { count: 'exact', head: true })
    .gt('last_alert', new Date(now.getTime() - 3_600_000).toISOString())

  if ((count ?? 0) >= GLOBAL_HOURLY_CAP) {
    console.warn('hourly alert cap reached, staying quiet')
    return ok()
  }

  // --- tell Discord ---------------------------------------------------------

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildMessage({ ip, hits, firstSeen, isNew, userAgent, referrer })),
    })
    if (!res.ok) {
      console.error('discord rejected the post', res.status, await res.text())
      return ok()
    }
  } catch (err) {
    console.error('could not reach discord', err)
    return ok()
  }

  await admin.from('visit_log').update({ last_alert: now.toISOString() }).eq('ip', ip)

  return ok()
})
