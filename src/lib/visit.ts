const ONCE_KEY = 'rpluss.visit'
const WEBHOOK = import.meta.env.VITE_DISCORD_WEBHOOK_URL as string | undefined

/**
 * Posts to Discord when the site is opened, with the address it was opened
 * from.
 *
 * This runs entirely in the browser, which means the webhook URL is in the
 * deployed bundle and anyone who opens the site can read it. That is a
 * deliberate trade for having no setup and no server: the cost is that a
 * visitor could post to the channel themselves, or delete the webhook. If that
 * happens, make a new webhook in Discord and put it in `.env`.
 *
 * Fire and forget. Nothing in here is allowed to be visible on the page.
 */
export function reportVisit() {
  if (!WEBHOOK) return

  // One report per browser session. A new tab or a fresh open counts again;
  // a refresh does not.
  try {
    if (sessionStorage.getItem(ONCE_KEY)) return
    sessionStorage.setItem(ONCE_KEY, '1')
  } catch {
    // Private mode with storage disabled. Report anyway.
  }

  void send()
}

async function send() {
  let ip = 'unknown'
  try {
    const res = await fetch('https://api.ipify.org?format=json')
    const body = (await res.json()) as { ip?: string }
    if (body.ip) ip = body.ip
  } catch {
    // Blocked, offline, or ipify is down. Still worth saying someone opened it.
  }

  // Enough alongside the address to tell at a glance whether this is one of
  // you two on a known device or someone else entirely.
  const details = [
    `**IP** \`${ip}\``,
    `**Device** \`${navigator.userAgent.slice(0, 240)}\``,
    `**Screen** \`${screen.width}x${screen.height}\``,
    `**Language** \`${navigator.language}\``,
    `**Timezone** \`${tz()}\``,
    document.referrer ? `**Came from** \`${document.referrer.slice(0, 200)}\`` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const payload = {
    username: 'R+S watch',
    embeds: [
      {
        title: 'Someone opened the site',
        description: details,
        color: 0xff5cf0,
        timestamp: new Date().toISOString(),
      },
    ],
  }

  // Plain JSON is the normal way to do this and Discord does answer the
  // preflight it triggers. If that ever stops being true the request throws
  // before it leaves the browser, so fall back to multipart, which is a
  // CORS-safelisted content type and needs no preflight at all. The fallback's
  // reply is opaque, but there is nothing to do with an answer anyway.
  try {
    const res = await fetch(WEBHOOK!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok || res.status === 204) return
  } catch {
    // Fall through.
  }

  try {
    const form = new FormData()
    form.append('payload_json', JSON.stringify(payload))
    await fetch(WEBHOOK!, { method: 'POST', body: form, mode: 'no-cors' })
  } catch {
    // Never surfaces.
  }
}

function tz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
