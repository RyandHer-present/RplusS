import { useEffect, useMemo } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { useFits, postedToday, streakFor } from '../store/fits'
import { USERS, useSession } from '../store/session'
import { storageReady } from '../lib/storage'
import type { Fit } from '../lib/types'
import './Fits.css'

function groupByDay(fits: Fit[]) {
  const days = new Map<string, Fit[]>()
  for (const fit of fits) {
    const list = days.get(fit.day)
    if (list) list.push(fit)
    else days.set(fit.day, [fit])
  }
  return [...days.entries()]
}

function dayLabel(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return date.toLocaleDateString([], { weekday: 'long' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function Fits() {
  const me = useSession((s) => s.user)!
  const other = me === 'ry' ? 'sarah' : 'ry'

  const fits = useFits((s) => s.fits)
  const status = useFits((s) => s.status)
  const load = useFits((s) => s.load)
  const subscribe = useFits((s) => s.subscribe)

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => subscribe(), [subscribe])

  const myStreak = useMemo(() => streakFor(fits, me), [fits, me])
  const theirStreak = useMemo(() => streakFor(fits, other), [fits, other])
  const done = useMemo(() => postedToday(fits, me), [fits, me])
  const days = useMemo(() => groupByDay(fits), [fits])

  return (
    <div className="screen-scroll">
      <ScreenHeader title="Fits" sub={done ? 'posted today' : 'not posted yet'} />

      <section className="streaks">
        <div className={`streak ${done ? 'is-active' : ''}`}>
          <span className="streak-count">{myStreak}</span>
          <span className="streak-label">your streak</span>
          <span className="streak-unit">{myStreak === 1 ? 'day' : 'days'}</span>
        </div>
        <div className="streak is-other">
          <span className="streak-count">{theirStreak}</span>
          <span className="streak-label">{USERS[other].name}</span>
          <span className="streak-unit">{theirStreak === 1 ? 'day' : 'days'}</span>
        </div>
      </section>

      {!done && (
        <p className="fits-nudge">
          {myStreak > 0
            ? `Post today to keep ${myStreak} going.`
            : 'Post a fit to start a streak.'}
        </p>
      )}

      <button type="button" className="fits-post" disabled={!storageReady}>
        {storageReady ? 'Post today’s fit' : 'Photo storage not connected yet'}
      </button>

      {status === 'ready' && fits.length === 0 && (
        <p className="fits-empty">Nothing posted yet.</p>
      )}

      {days.map(([day, dayFits]) => (
        <section key={day} className="fit-day">
          <h2 className="fit-day-label">{dayLabel(day)}</h2>
          <div className="fit-grid">
            {dayFits.map((fit) => (
              <figure key={fit.id} className="fit-card">
                <div className="fit-image" data-owner={fit.author_id} />
                <figcaption>{fit.author_id === me ? 'You' : USERS[fit.author_id].name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
