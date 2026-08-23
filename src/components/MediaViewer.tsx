import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { resolveMediaUrls, saveToDevice } from '../lib/media'
import { DoodlePlayer } from './DoodlePlayer'
import { haptic } from '../lib/haptics'
import type { Media } from '../lib/types'
import './MediaViewer.css'

interface Props {
  media: Media
  caption?: string
  onClose: () => void
  /** Omitted when the viewer has no right to remove this. */
  onDelete?: () => void
}

/** Full-screen viewer for a single photo or video. */
export function MediaViewer({ media, caption, onClose, onDelete }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let cancelled = false
    resolveMediaUrls([media.b2_key]).then((urls) => {
      if (!cancelled) setUrl(urls[media.b2_key] ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [media.b2_key])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    setSaving(true)
    haptic('tap')
    try {
      const how = await saveToDevice(media)
      setSaved(how === 'shared' ? 'Saved' : 'Downloaded')
      haptic('success')
    } catch {
      setSaved('Could not save')
    } finally {
      setSaving(false)
      window.setTimeout(() => setSaved(null), 2200)
    }
  }

  // Rendered into <body>. The scroll pane sets will-change: transform, which
  // makes it a containing block for fixed positioning — without the portal the
  // "full screen" overlay is trapped inside the pane and sits under the tab bar.
  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true">
      <button type="button" className="viewer-close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      <div className="viewer-stage" onClick={onClose}>
        {!url && media.blur && <img className="viewer-blur" src={media.blur} alt="" aria-hidden="true" />}

        {url && media.kind === 'video' && (
          <video
            className="viewer-media"
            src={url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {url && media.kind !== 'video' && media.strokes?.length ? (
          <div className="viewer-media" onClick={(e) => e.stopPropagation()}>
            <DoodlePlayer
              strokes={media.strokes}
              poster={<img className="viewer-media" src={url} alt={caption ?? ''} />}
            />
          </div>
        ) : null}

        {url && media.kind !== 'video' && !media.strokes?.length && (
          <img className="viewer-media" src={url} alt={caption ?? ''} onClick={(e) => e.stopPropagation()} />
        )}
      </div>

      {caption && <p className="viewer-caption">{caption}</p>}

      <div className="viewer-actions">
        <button type="button" className="viewer-action" onClick={() => void save()} disabled={saving || !url}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4.5 19.5h15" />
          </svg>
          {saving ? 'Saving…' : (saved ?? 'Save')}
        </button>

        {onDelete && (
          <button
            type="button"
            className={`viewer-action is-danger ${confirming ? 'is-confirming' : ''}`}
            onClick={() => {
              // Two taps, because this cannot be undone.
              if (!confirming) {
                setConfirming(true)
                haptic('tap')
                window.setTimeout(() => setConfirming(false), 3000)
                return
              }
              haptic('error')
              onDelete()
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5 7.5 20h9l1-13.5M10.5 10v6M13.5 10v6" />
            </svg>
            {confirming ? 'Tap again' : 'Delete'}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
