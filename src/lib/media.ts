import { supabase } from './supabase'
import type { Media } from './types'
import type { UserId } from '../store/session'

const MAX_EDGE = 2048
const THUMB_EDGE = 420
const BLUR_EDGE = 16

/** Picks the smallest format this browser can actually encode. */
const encodeType = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  // Safari only gained WebP encoding in 14; older ones silently return PNG,
  // which would be far larger than the JPEG we can fall back to.
  return canvas.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg'
})()

const extFor = (type: string) => (type === 'image/webp' ? 'webp' : type === 'image/jpeg' ? 'jpg' : 'bin')

/**
 * Decodes to a bitmap with EXIF rotation applied.
 *
 * Phone cameras record orientation as metadata rather than rotating the pixels,
 * so skipping this produces sideways photos from every iPhone.
 */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Older Safari lacks the orientation option; <img> applies it natively.
    const img = new Image()
    img.decoding = 'async'
    img.src = URL.createObjectURL(file)
    await img.decode()
    URL.revokeObjectURL(img.src)
    return img
  }
}

function draw(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), encodeType, quality),
  )
}

export interface ProcessedImage {
  full: Blob
  thumb: Blob
  blur: string
  width: number
  height: number
}

/** Resizes, re-encodes, and builds a thumbnail plus an inline blur placeholder. */
export async function processImage(file: File): Promise<ProcessedImage> {
  const source = await decode(file)
  const sourceWidth = 'naturalWidth' in source ? source.naturalWidth : source.width
  const sourceHeight = 'naturalHeight' in source ? source.naturalHeight : source.height

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight))
  const width = Math.round(sourceWidth * scale)
  const height = Math.round(sourceHeight * scale)

  const full = await toBlob(draw(source, width, height), 0.82)

  const thumbScale = Math.min(1, THUMB_EDGE / Math.max(width, height))
  const thumb = await toBlob(draw(source, Math.round(width * thumbScale), Math.round(height * thumbScale)), 0.7)

  // A handful of pixels, stretched and blurred by CSS while the real image
  // loads. Small enough to live in the database row itself.
  const blurScale = Math.min(1, BLUR_EDGE / Math.max(width, height))
  const blur = draw(source, Math.max(1, Math.round(width * blurScale)), Math.max(1, Math.round(height * blurScale)))
    .toDataURL(encodeType, 0.5)

  if ('close' in source) source.close()
  return { full, thumb, blur, width, height }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Not connected')
  const { data, error } = await supabase.functions.invoke('media-sign', { body })
  if (error) throw error
  return data as T
}

async function put(url: string, blob: Blob, contentType: string) {
  const response = await fetch(url, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': contentType },
  })
  if (!response.ok) throw new Error(`Upload failed (${response.status})`)
}

/**
 * Compresses an image, uploads it and its thumbnail, and records the row.
 * Returns the new media id.
 */
export async function uploadImage(file: File, me: UserId): Promise<string> {
  if (!supabase) throw new Error('Not connected')

  const { full, thumb, blur, width, height } = await processImage(file)
  const ext = extFor(encodeType)

  const main = await invoke<{ uploadUrl: string; key: string; maxBytes: number }>({
    kind: 'image',
    ext,
    contentType: encodeType,
  })
  if (full.size > main.maxBytes) throw new Error('That image is too large')

  const thumbSlot = await invoke<{ uploadUrl: string; key: string }>({
    kind: 'image',
    ext,
    contentType: encodeType,
  })

  await Promise.all([put(main.uploadUrl, full, encodeType), put(thumbSlot.uploadUrl, thumb, encodeType)])

  const { data, error } = await supabase
    .from('media')
    .insert({
      owner_id: me,
      kind: 'image',
      b2_key: main.key,
      thumb_key: thumbSlot.key,
      blur,
      width,
      height,
      bytes: full.size,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Could not save media')
  return (data as Media).id
}

/**
 * Swaps storage keys for temporary download URLs.
 *
 * Results are cached until shortly before they expire, which keeps repeat views
 * off both the signing function and Backblaze's daily transaction allowance.
 */
const urlCache = new Map<string, { url: string; expires: number }>()

export async function resolveMediaUrls(keys: string[]): Promise<Record<string, string>> {
  const now = Date.now()
  const resolved: Record<string, string> = {}
  const missing: string[] = []

  for (const key of keys) {
    const hit = urlCache.get(key)
    if (hit && hit.expires > now) resolved[key] = hit.url
    else missing.push(key)
  }

  if (missing.length) {
    const { urls, expiresIn } = await invoke<{ urls: Record<string, string>; expiresIn: number }>({
      action: 'get',
      keys: missing,
    })
    // Expire our copy a minute early so a URL never dies mid-render.
    const expires = now + (expiresIn - 60) * 1000
    for (const [key, url] of Object.entries(urls)) {
      urlCache.set(key, { url, expires })
      resolved[key] = url
    }
  }

  return resolved
}

/* ------------------------------------------------------------------ video -- */

interface VideoMeta {
  poster: Blob
  thumb: Blob
  blur: string
  width: number
  height: number
  durationMs: number
}

/**
 * Pulls a poster frame out of a video file.
 *
 * iOS Safari will not paint a video to a canvas until playback has actually
 * started, so this nudges it into playing muted and inline before seeking.
 */
async function grabPoster(file: File): Promise<VideoMeta> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  video.src = URL.createObjectURL(file)

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Could not read that video'))
    })

    // Silent, inline playback is permitted without a gesture; without it the
    // canvas draw below comes out as an empty black frame on iOS.
    try {
      await video.play()
    } catch {
      // Some browsers refuse; seeking alone is often enough there.
    }

    const target = Math.min(video.duration * 0.1 || 0, 1)
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve()
      video.currentTime = target
      // If seeking never fires, carry on with whatever frame is showing.
      window.setTimeout(resolve, 1200)
    })
    video.pause()

    const sourceWidth = video.videoWidth || 720
    const sourceHeight = video.videoHeight || 1280

    const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight))
    const width = Math.round(sourceWidth * scale)
    const height = Math.round(sourceHeight * scale)

    const poster = await toBlob(draw(video, width, height), 0.8)

    const thumbScale = Math.min(1, THUMB_EDGE / Math.max(width, height))
    const thumb = await toBlob(
      draw(video, Math.round(width * thumbScale), Math.round(height * thumbScale)),
      0.7,
    )

    const blurScale = Math.min(1, BLUR_EDGE / Math.max(width, height))
    const blur = draw(
      video,
      Math.max(1, Math.round(width * blurScale)),
      Math.max(1, Math.round(height * blurScale)),
    ).toDataURL(encodeType, 0.5)

    return {
      poster,
      thumb,
      blur,
      width: sourceWidth,
      height: sourceHeight,
      durationMs: Math.round((video.duration || 0) * 1000),
    }
  } finally {
    URL.revokeObjectURL(video.src)
    video.src = ''
  }
}

/**
 * Uploads a video plus a generated poster frame.
 *
 * The video itself is uploaded as recorded. Re-encoding to 720p in the browser
 * needs WebCodecs plus an MP4 muxer and behaves inconsistently across the two
 * phones this has to work on, so it is deliberately left out for now rather
 * than shipped half-working. The size ceiling below is what protects storage
 * in the meantime.
 */
export async function uploadVideo(file: File, me: UserId): Promise<string> {
  if (!supabase) throw new Error('Not connected')

  const meta = await grabPoster(file)
  const videoExt = (file.name.split('.').pop() ?? 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
  const imageExt = extFor(encodeType)

  const slot = await invoke<{ uploadUrl: string; key: string; maxBytes: number }>({
    kind: 'video',
    ext: videoExt,
    contentType: file.type || 'video/mp4',
  })

  if (file.size > slot.maxBytes) {
    const mb = Math.round(slot.maxBytes / (1024 * 1024))
    throw new Error(`That video is over ${mb}MB. Trim it and try again.`)
  }

  const thumbSlot = await invoke<{ uploadUrl: string; key: string }>({
    kind: 'image',
    ext: imageExt,
    contentType: encodeType,
  })

  await Promise.all([
    put(slot.uploadUrl, file, file.type || 'video/mp4'),
    put(thumbSlot.uploadUrl, meta.thumb, encodeType),
  ])

  const { data, error } = await supabase
    .from('media')
    .insert({
      owner_id: me,
      kind: 'video',
      b2_key: slot.key,
      thumb_key: thumbSlot.key,
      blur: meta.blur,
      width: meta.width,
      height: meta.height,
      duration_ms: meta.durationMs,
      bytes: file.size,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Could not save video')
  return (data as Media).id
}

/** Uploads an already-encoded audio blob (see lib/recorder.ts). */
export async function uploadAudio(
  blob: Blob,
  me: UserId,
  durationMs: number,
): Promise<string> {
  if (!supabase) throw new Error('Not connected')

  const slot = await invoke<{ uploadUrl: string; key: string; maxBytes: number }>({
    kind: 'audio',
    ext: 'mp3',
    contentType: 'audio/mpeg',
  })
  if (blob.size > slot.maxBytes) throw new Error('That recording is too long')

  await put(slot.uploadUrl, blob, 'audio/mpeg')

  const { data, error } = await supabase
    .from('media')
    .insert({
      owner_id: me,
      kind: 'audio',
      b2_key: slot.key,
      duration_ms: durationMs,
      bytes: blob.size,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Could not save recording')
  return (data as Media).id
}
