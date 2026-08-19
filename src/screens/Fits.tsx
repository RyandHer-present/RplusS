import { useEffect, useMemo, useRef, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { MediaImage } from '../components/MediaImage'
import { MediaViewer } from '../components/MediaViewer'
import { OwnerTabs } from '../components/OwnerTabs'
import { useFits, streakFor } from '../store/fits'
import { USERS, other, useSession, type UserId } from '../store/session'
import { localDay } from '../lib/streak'
import { dayLabel, timeLabel } from '../lib/dates'
import { storageReady } from '../lib/storage'
import { haptic } from '../lib/haptics'
import type { Fit } from '../lib/types'
import './Fits.css'

const ORDER: UserId[] = ['ry', 'sarah']

export default function Fits() {
  const me = useSession((s) => s.user)
  const isAdmin = useSession((s) => s.isAdmin)

  const fits = useFits((s) => s.fits)
  const status = useFits((s) => s.status)
  const load = useFits((s) => s.load)
  const subscribe = useFits((s) => s.subscribe)
  const post = useFits((s) => s.post)
  const remove = useFits((s) => s.remove)
  const uploading = useFits((s) => s.uploading)
  const uploadError = useFits((s) => s.uploadError)

  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<Fit | null>(null)
  const [tab, setTab] = useState<UserId>(me ? other(me) : 'ry')

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => subscribe(), [subscribe])

  const today = localDay()

  const todays = useMemo(() => {
    const map: Partial<Record<UserId, Fit>> = {}
    for (const fit of fits) {
      // Sorted newest first, so the first match for a day is the latest one.
      if (fit.day === today && !map[fit.author_id]) map[fit.author_id] = fit
    }
    return map
  }, [fits, today])

  const streaks = useMemo(
    () => ({ ry: streakFor(fits, 'ry'), sarah: streakFor(fits, 'sarah') }),
    [fits],
  )

  const counts = useMemo(
    () => ({
      ry: fits.filter((f) => f.author_id === 'ry').length,
      sarah: fits.filter((f) => f.author_id === 'sarah').length,
    }),
    [fits],
  )

  // Everything except today, newest day first.
  const past = useMemo(() => {
    const days = new Map<string, Fit[]>()
    for (const fit of fits) {
      if (fit.author_id !== tab || fit.day === today) continue
      const list = days.get(fit.day)
      if (list) list.push(fit)
      else days.set(fit.day, [fit])
    }
    return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [fits, tab, today])

  const doneToday = Boolean(me && todays[me])

  return (
    <div className="screen-scroll">
      <ScreenHeader title="Fits" sub={doneToday ? 'posted today' : me ? 'not posted yet' : undefined} />

      <section className="today">
        <h2 className="today-label">Today</h2>
        <div className="today-pair">
          {ORDER.map((owner) => {
            const fit = todays[owner]
            const isMe = owner === me
            return (
              <div key={owner} className={`today-card ${fit ? 'has-fit' : ''}`}>
                <button
                  type="button"
                  className="today-frame"
                  disabled={!fit}
                  onClick={() => {
                    if (!fit) return
                    haptic('tap')
                    setOpen(fit)
                  }}
                >
                  {fit?.media ? (
                    <MediaImage media={fit.media} alt={`${USERS[owner].name} today`} />
                  ) : (
                    <span className="today-empty">{isMe ? 'Your turn' : 'Nothing yet'}</span>
                  )}
                </button>
                <div className="today-meta">
                  <span className="today-who">{isMe ? 'You' : USERS[owner].name}</span>
                  <span className={`today-streak ${streaks[owner] > 0 ? 'is-live' : ''}`}>
                    {streaks[owner]}
                    <small>{streaks[owner] === 1 ? 'day' : 'days'}</small>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file && me) void post(file, me)
        }}
      />

      {me && (
        <>
          <button
            type="button"
            className="fits-post"
            disabled={!storageReady || uploading}
            onClick={() => {
              haptic('select')
              fileRef.current?.click()
            }}
          >
            {!storageReady
              ? 'Photo storage not connected yet'
              : uploading
                ? 'Uploading…'
                : doneToday
                  ? 'Replace today’s fit'
                  : 'Post today’s fit'}
          </button>

          {!doneToday && streaks[me] > 0 && (
            <p className="fits-nudge">Post today to keep {streaks[me]} going.</p>
          )}
        </>
      )}

      {uploadError && <p className="fits-error">{uploadError}</p>}

      <h2 className="past-label">Past fits</h2>
      <OwnerTabs value={tab} onChange={setTab} counts={counts} me={me} />

      {status === 'ready' && past.length === 0 && (
        <p className="fits-empty">Nothing further back yet.</p>
      )}

      {past.map(([day, dayFits]) => (
        <section key={day} className="fit-day">
          <h3 className="fit-day-label">
            {dayLabel(day)}
            <span>{timeLabel(dayFits[0].created_at)}</span>
          </h3>
          <div className="fit-grid">
            {dayFits.map((fit) => (
              <button
                key={fit.id}
                type="button"
                className="fit-card"
                onClick={() => {
                  haptic('tap')
                  setOpen(fit)
                }}
              >
                {fit.media && <MediaImage media={fit.media} alt="" />}
              </button>
            ))}
          </div>
        </section>
      ))}

      {open?.media && (
        <MediaViewer
          media={open.media}
          caption={`${open.author_id === me ? 'You' : USERS[open.author_id].name} · ${dayLabel(open.day)}`}
          onDelete={isAdmin ? () => {
            void remove(open.id)
            setOpen(null)
          } : undefined}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
