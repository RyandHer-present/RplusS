// Presigned URLs for Backblaze B2.
//
// The B2 credentials never reach the browser. This function checks that the
// caller is signed in, then hands back a short-lived URL that permits exactly
// one upload or one download of one object.
//
// Uploads go browser -> B2 directly, so file bytes never pass through Supabase
// and never count against its bandwidth allowance.

import { AwsClient } from 'npm:aws4fetch@1.0.20'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const UPLOAD_TTL = 60 * 10 // 10 minutes to finish an upload
const DOWNLOAD_TTL = 60 * 60 * 6 // 6 hours; long enough to cache client-side

const ALLOWED_ORIGINS = ['https://ryandher-present.github.io', 'http://localhost:5173']

const MAX_BYTES: Record<string, number> = {
  image: 12 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  doodle: 4 * 1024 * 1024,
}

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o))
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  // --- who is asking ------------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers })
  }

  const { data: me } = await supabase.from('users').select('id').eq('auth_uid', auth.user.id).single()
  if (!me) {
    return new Response(JSON.stringify({ error: 'Unknown user' }), { status: 403, headers })
  }

  // --- storage config -----------------------------------------------------
  const bucket = Deno.env.get('B2_BUCKET')
  const endpoint = Deno.env.get('B2_ENDPOINT')
  const keyId = Deno.env.get('B2_KEY_ID')
  const appKey = Deno.env.get('B2_APP_KEY')
  if (!bucket || !endpoint || !keyId || !appKey) {
    return new Response(JSON.stringify({ error: 'Storage not configured' }), { status: 503, headers })
  }

  // B2's S3 endpoints encode their region, which SigV4 needs to match exactly.
  const region = endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/)?.[1] ?? 'us-west-004'
  const aws = new AwsClient({ accessKeyId: keyId, secretAccessKey: appKey, service: 's3', region })

  let body: { action?: string; kind?: string; ext?: string; contentType?: string; keys?: string[] }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers })
  }

  // --- hand back a download URL for keys the caller already knows ---------
  if (body.action === 'get') {
    const keys = (body.keys ?? []).slice(0, 60)
    const urls: Record<string, string> = {}

    for (const key of keys) {
      if (typeof key !== 'string' || key.includes('..')) continue
      const url = new URL(`${endpoint}/${bucket}/${encodeURI(key)}`)
      // Expiry belongs in the query string for a presigned URL. Passing it as
      // a header puts it in SignedHeaders, and B2 then rejects the request for
      // a signed header that was never sent.
      url.searchParams.set('X-Amz-Expires', String(DOWNLOAD_TTL))
      const signed = await aws.sign(new Request(url, { method: 'GET' }), { aws: { signQuery: true } })
      urls[key] = signed.url
    }

    return new Response(JSON.stringify({ urls, expiresIn: DOWNLOAD_TTL }), { headers })
  }

  // --- otherwise mint an upload URL --------------------------------------
  const kind = body.kind ?? ''
  if (!(kind in MAX_BYTES)) {
    return new Response(JSON.stringify({ error: 'Unknown media kind' }), { status: 400, headers })
  }

  // Extension is fixed to a safe set; the client never names the object.
  const ext = (body.ext ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const key = `${kind}/${me.id}/${crypto.randomUUID()}.${ext}`

  const uploadTarget = new URL(`${endpoint}/${bucket}/${encodeURI(key)}`)
  uploadTarget.searchParams.set('X-Amz-Expires', String(UPLOAD_TTL))

  // Content-Type is deliberately left out of the signature. The browser still
  // sends it and B2 still records it, but an unsigned header cannot break the
  // upload if it differs by so much as a charset.
  const signed = await aws.sign(new Request(uploadTarget, { method: 'PUT' }), {
    aws: { signQuery: true },
  })

  return new Response(
    JSON.stringify({ uploadUrl: signed.url, key, maxBytes: MAX_BYTES[kind] }),
    { headers },
  )
})
