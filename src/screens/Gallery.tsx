import { useEffect, useRef, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { MediaImage } from '../components/MediaImage'
import { MediaViewer } from '../components/MediaViewer'
import { useGallery, type GalleryPost } from '../store/gallery'
import { USERS, useSession } from '../store/session'
import { haptic } from '../lib/haptics'
import './Gallery.css'

export default function Gallery() {
  const me = useSession((s) => s.user)!
  const posts = useGallery((s) => s.posts)
  const status = useGallery((s) => s.status)
  const uploading = useGallery((s) => s.uploading)
  const progress = useGallery((s) => s.progress)
  const error = useGallery((s) => s.error)
  const load = useGallery((s) => s.load)
  const subscribe = useGallery((s) => s.subscribe)
  const post = useGallery((s) => s.post)

  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<GalleryPost | null>(null)

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => subscribe(), [subscribe])

  return (
    <div className="screen-scroll">
      <ScreenHeader title="Gallery" sub={posts.length ? `${posts.length} posts` : undefined} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void post(file, me)
        }}
      />

      <button
        type="button"
        className="gallery-add"
        disabled={uploading}
        onClick={() => {
          haptic('select')
          fileRef.current?.click()
        }}
      >
        {uploading ? (progress ?? 'Uploading…') : 'Add a photo or video'}
      </button>

      {error && <p className="gallery-error">{error}</p>}

      {status === 'ready' && posts.length === 0 && (
        <p className="gallery-empty">Nothing here yet.</p>
      )}

      <div className="gallery-grid">
        {posts.map((item) => (
          <button
            key={item.id}
            type="button"
            className="gallery-cell"
            onClick={() => {
              haptic('tap')
              setOpen(item)
            }}
          >
            {item.media && <MediaImage media={item.media} alt={item.caption ?? ''} />}
            {item.media?.kind === 'video' && (
              <span className="gallery-play" aria-label="Video">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
              </span>
            )}
            <span className="gallery-who">{item.author_id === me ? 'You' : USERS[item.author_id].initial}</span>
          </button>
        ))}
      </div>

      {open?.media && (
        <MediaViewer
          media={open.media}
          caption={open.author_id === me ? 'You' : USERS[open.author_id].name}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
