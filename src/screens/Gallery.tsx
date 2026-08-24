import { useEffect, useMemo, useRef, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { MediaImage } from '../components/MediaImage'
import { HeartBadge } from '../components/HeartBadge'
import { MediaViewer } from '../components/MediaViewer'
import { OwnerTabs } from '../components/OwnerTabs'
import { useGallery, type GalleryPost } from '../store/gallery'
import { USERS, other, useSession, type UserId } from '../store/session'
import { groupByDate, dayLabel, timeLabel } from '../lib/dates'
import { haptic } from '../lib/haptics'
import './Gallery.css'

export default function Gallery() {
  const me = useSession((s) => s.user)
  const isAdmin = useSession((s) => s.isAdmin)

  const posts = useGallery((s) => s.posts)
  const status = useGallery((s) => s.status)
  const uploading = useGallery((s) => s.uploading)
  const progress = useGallery((s) => s.progress)
  const error = useGallery((s) => s.error)
  const load = useGallery((s) => s.load)
  const subscribe = useGallery((s) => s.subscribe)
  const post = useGallery((s) => s.post)
  const remove = useGallery((s) => s.remove)

  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<GalleryPost | null>(null)
  // Opens on the other person's side — theirs is the part you have not seen.
  const [tab, setTab] = useState<UserId>(me ? other(me) : 'ry')

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => subscribe(), [subscribe])

  const counts = useMemo(
    () => ({
      ry: posts.filter((p) => p.author_id === 'ry').length,
      sarah: posts.filter((p) => p.author_id === 'sarah').length,
    }),
    [posts],
  )

  const days = useMemo(
    () => groupByDate(posts.filter((p) => p.author_id === tab), (p) => p.created_at),
    [posts, tab],
  )

  // Anything posted on this calendar date in an earlier year.
  const onThisDay = useMemo(() => {
    const now = new Date()
    return posts.filter((p) => {
      const at = new Date(p.created_at)
      return (
        at.getFullYear() < now.getFullYear() &&
        at.getMonth() === now.getMonth() &&
        at.getDate() === now.getDate()
      )
    })
  }, [posts])

  const mine = tab === me

  return (
    <div className="screen-scroll">
      <ScreenHeader title="Gallery" sub={`${counts.ry + counts.sarah} posts`} />

      {onThisDay.length > 0 && (
        <section className="on-this-day">
          <h2 className="on-this-day-label">
            On this day
            <span>{new Date(onThisDay[0].created_at).getFullYear()}</span>
          </h2>
          <div className="on-this-day-row" data-no-swipe>
            {onThisDay.map((item) => (
              <button
                key={item.id}
                type="button"
                className="on-this-day-cell"
                onClick={() => {
                  haptic('tap')
                  setOpen(item)
                }}
              >
                {item.media && <MediaImage media={item.media} alt="" />}
              </button>
            ))}
          </div>
        </section>
      )}

      <OwnerTabs value={tab} onChange={setTab} counts={counts} me={me} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file && me) void post(file, me)
        }}
      />

      {me && mine && (
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
      )}

      {error && <p className="gallery-error">{error}</p>}

      {status === 'ready' && days.length === 0 && (
        <p className="gallery-empty">
          {mine ? 'You haven’t posted anything yet.' : `Nothing from ${USERS[tab].name} yet.`}
        </p>
      )}

      {days.map(([day, items]) => (
        <section key={day} className="gallery-day">
          <h2 className="gallery-day-label">
            {dayLabel(day)}
            <span>{timeLabel(items[0].created_at)}</span>
          </h2>
          <div className="gallery-grid">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="gallery-cell"
                onClick={() => {
                  haptic('tap')
                  setOpen(item)
                }}
              >
                {item.media && <MediaImage media={item.media} alt="" />}
                {item.media?.kind === 'video' && (
                  <span className="gallery-play" aria-label="Video">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5.5v13l11-6.5z" />
                    </svg>
                  </span>
                )}
                <HeartBadge entity="gallery" id={item.id} />
              </button>
            ))}
          </div>
        </section>
      ))}

      {open?.media && (
        <MediaViewer
          likeEntity="gallery"
          likeId={open.id}
          media={open.media}
          caption={`${open.author_id === me ? 'You' : USERS[open.author_id].name} · ${timeLabel(open.created_at)}`}
          // Only the author can unsend; admin can remove anything.
          onDelete={
            open.author_id === me || isAdmin
              ? () => {
                  void remove(open.id)
                  setOpen(null)
                }
              : undefined
          }
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
