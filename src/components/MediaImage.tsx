import { useEffect, useState } from 'react'
import { resolveMediaUrls } from '../lib/media'
import type { Media } from '../lib/types'
import './MediaImage.css'

interface Props {
  media: Media
  /** Thumbnails are enough for grids; full size is for a single opened image. */
  size?: 'thumb' | 'full'
  alt?: string
}

/**
 * Shows the inline blur placeholder immediately, then fades in the real image
 * once its signed URL resolves. Nothing ever renders as an empty grey box.
 */
export function MediaImage({ media, size = 'thumb', alt = '' }: Props) {
  const key = size === 'thumb' ? (media.thumb_key ?? media.b2_key) : media.b2_key
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    resolveMediaUrls([key])
      .then((urls) => {
        if (!cancelled) setUrl(urls[key] ?? null)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return (
    <div
      className="media-image"
      style={{
        aspectRatio: media.width && media.height ? `${media.width} / ${media.height}` : undefined,
      }}
    >
      {media.blur && (
        <img className="media-blur" src={media.blur} alt="" aria-hidden="true" decoding="async" />
      )}
      {url && (
        <img
          className={`media-real ${loaded ? 'is-loaded' : ''}`}
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  )
}
