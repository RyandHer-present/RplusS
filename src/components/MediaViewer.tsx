import { useEffect, useState } from 'react'
import { resolveMediaUrls } from '../lib/media'
import type { Media } from '../lib/types'
import './MediaViewer.css'

interface Props {
  media: Media
  caption?: string
  onClose: () => void
}

/** Full-screen viewer for a single photo or video. */
export function MediaViewer({ media, caption, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    resolveMediaUrls([media.b2_key]).then((urls) => {
      if (!cancelled) setUrl(urls[media.b2_key] ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [media.b2_key])

  // The hardware back button and Escape should both close this rather than
  // leaving the section entirely.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="viewer" onClick={onClose} role="dialog" aria-modal="true">
      <button type="button" className="viewer-close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      <div className="viewer-stage" onClick={(e) => e.stopPropagation()}>
        {!url && media.blur && <img className="viewer-blur" src={media.blur} alt="" aria-hidden="true" />}

        {url && media.kind === 'video' && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video className="viewer-media" src={url} controls autoPlay playsInline preload="metadata" />
        )}

        {url && media.kind !== 'video' && <img className="viewer-media" src={url} alt={caption ?? ''} />}
      </div>

      {caption && <p className="viewer-caption">{caption}</p>}
    </div>
  )
}
