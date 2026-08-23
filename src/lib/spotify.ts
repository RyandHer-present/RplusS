/*
 * What a Spotify link points at.
 *
 * The oEmbed endpoint answers for any public track, album, playlist, artist,
 * episode or show with no login, no API key and no registered app, and it sends
 * `access-control-allow-origin: *`, so the browser can ask it directly. That is
 * the whole reason this tier of the Spotify work needs nothing set up.
 *
 * Jam invites are the exception and always will be. They are `spotify.link`
 * shortlinks standing for a live session rather than a piece of content, and
 * the endpoint times out on them rather than answering — so callers get null
 * and the screen says "Jam invite" instead of showing a blank card.
 */

export interface Preview {
  title: string
  thumbUrl: string | null
  embedUrl: string | null
}

interface OEmbed {
  title?: string
  thumbnail_url?: string
  iframe_url?: string
}

/** Repeat lookups of the same link are common while a screen re-renders. */
const cache = new Map<string, Preview | null>()

/** Shortlinks stand for a live session, which has nothing to describe. */
export function previewable(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('spotify.com')
  } catch {
    return false
  }
}

export async function fetchPreview(url: string): Promise<Preview | null> {
  if (!previewable(url)) return null

  const hit = cache.get(url)
  if (hit !== undefined) return hit

  try {
    // Spotify is slow to refuse a link it cannot describe, and this runs while
    // someone waits to post, so it is not allowed to hang.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)

    const response = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
      { signal: controller.signal },
    )
    clearTimeout(timer)

    if (!response.ok) {
      cache.set(url, null)
      return null
    }

    const body = (await response.json()) as OEmbed
    if (!body.title) {
      cache.set(url, null)
      return null
    }

    const preview: Preview = {
      title: body.title,
      thumbUrl: body.thumbnail_url ?? null,
      embedUrl: body.iframe_url ?? null,
    }
    cache.set(url, preview)
    return preview
  } catch {
    // Offline, blocked, timed out, or not a link Spotify will describe.
    cache.set(url, null)
    return null
  }
}
