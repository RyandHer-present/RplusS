// Web push fan-out.
//
// Called by a trigger on audit_log, the same way the Discord ping is. It looks
// up the *other* person's devices and pushes to each one.
//
// The encryption is written out here rather than pulled from a library on
// purpose: this runs against Apple's push service on a phone that is the whole
// point of the feature, and a dependency that breaks is a silent failure nobody
// notices for a week. Everything below is RFC 8291 (aes128gcm) and RFC 8292
// (VAPID), both of which are stable and short.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const B64 = {
  encode: (b: ArrayBuffer | Uint8Array): string => {
    const bytes = b instanceof Uint8Array ? b : new Uint8Array(b)
    let s = ''
    for (const byte of bytes) s += String.fromCharCode(byte)
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode: (s: string): Uint8Array => {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  },
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const utf8 = (s: string) => new TextEncoder().encode(s)

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

/** HKDF with a single-block output, which is all any of these need. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const prk = await hmac(salt, ikm)
  const out = await hmac(prk, concat(info, new Uint8Array([1])))
  return out.slice(0, length)
}

/** RFC 8291: encrypt a payload for one subscription. */
async function encrypt(payload: string, p256dh: string, authSecret: string) {
  const uaPublic = B64.decode(p256dh)
  const auth = B64.decode(authSecret)

  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey))

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, ephemeral.privateKey, 256),
  )

  // The key derivation is salted with the subscription's auth secret and bound
  // to both public keys, so a payload can only be read by that one device.
  const ikm = await hkdf(auth, shared, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  // 0x02 is the last-record padding delimiter.
  const plaintext = concat(utf8(payload), new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, plaintext),
  )

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext)
}

/** RFC 8292: the signed token that proves who is sending. */
async function vapidHeader(endpoint: string, publicKey: string, privateKey: string) {
  const audience = new URL(endpoint).origin
  const header = B64.encode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = B64.encode(
    utf8(
      JSON.stringify({
        aud: audience,
        // Twelve hours; push services reject anything longer than 24.
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: 'mailto:push@rpluss.invalid',
      }),
    ),
  )
  const unsigned = `${header}.${claims}`

  const raw = B64.decode(privateKey)
  const point = B64.decode(publicKey)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: B64.encode(raw),
    x: B64.encode(point.slice(1, 33)),
    y: B64.encode(point.slice(33, 65)),
    ext: true,
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ])
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(unsigned)),
  )
  return `vapid t=${unsigned}.${B64.encode(signature)}, k=${publicKey}`
}

const WORDING: Record<string, { title: string; body: string; path: string }> = {
  messages: { title: 'New message', body: 'sent you a message', path: '/chat' },
  fits: { title: 'New fit', body: 'posted a fit', path: '/fits' },
  gallery: { title: 'New photo', body: 'added to the gallery', path: '/gallery' },
  notes: { title: 'New note', body: 'wrote a note', path: '/notes' },
  voice_notes: { title: 'Voice note', body: 'sent a voice note', path: '/voice' },
  jams: { title: 'New jam', body: 'shared something to listen to', path: '/jam' },
}

const NAMES: Record<string, string> = { ry: 'Ry', sarah: 'Sarah' }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) {
    // Not configured is a valid state — it is how push gets switched off.
    return new Response(JSON.stringify({ skipped: 'no vapid keys' }), { status: 200 })
  }

  let body: { actor?: string; entity?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const { actor, entity, action } = body
  if (action !== 'insert' || !actor || !entity) {
    return new Response(JSON.stringify({ skipped: 'not a notifiable event' }), { status: 200 })
  }

  const wording = WORDING[entity]
  if (!wording) return new Response(JSON.stringify({ skipped: `no wording for ${entity}` }), { status: 200 })

  // Whoever did it does not get told about it.
  const recipient = actor === 'ry' ? 'sarah' : actor === 'sarah' ? 'ry' : null
  if (!recipient) return new Response(JSON.stringify({ skipped: 'admin action' }), { status: 200 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', recipient)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!subs?.length) return new Response(JSON.stringify({ sent: 0, reason: 'no devices' }), { status: 200 })

  const payload = JSON.stringify({
    title: wording.title,
    body: `${NAMES[actor] ?? 'Someone'} ${wording.body}`,
    path: wording.path,
    at: new Date().toISOString(),
  })

  const results = await Promise.all(
    subs.map(async (sub) => {
      try {
        const encrypted = await encrypt(payload, sub.p256dh, sub.auth)
        const authorization = await vapidHeader(sub.endpoint, publicKey, privateKey)
        const res = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            Authorization: authorization,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: '86400',
            Urgency: 'normal',
          },
          body: encrypted,
        })

        // The push service is the authority on whether a device still exists.
        // 404 and 410 mean it is gone for good, so the row goes with it.
        if (res.status === 404 || res.status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          return { id: sub.id, status: res.status, removed: true }
        }
        if (res.ok) {
          await supabase
            .from('push_subscriptions')
            .update({ last_sent_at: new Date().toISOString() })
            .eq('id', sub.id)
        }
        return { id: sub.id, status: res.status, detail: res.ok ? undefined : await res.text() }
      } catch (e) {
        return { id: sub.id, error: String(e) }
      }
    }),
  )

  return new Response(JSON.stringify({ recipient, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
