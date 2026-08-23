import { useEffect, useMemo, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { useJams, isLive, kindOf, LIVE_HOURS, type Jam } from '../store/jams'
import { USERS, useSession } from '../store/session'
import { groupByDate, dayLabel, timeLabel } from '../lib/dates'
import { haptic } from '../lib/haptics'
import './Jam.css'

const KIND_LABEL: Record<string, string> = {
  jam: 'Jam',
  playlist: 'Playlist',
  album: 'Album',
  track: 'Song',
  artist: 'Artist',
  episode: 'Episode',
  show: 'Podcast',
  link: 'Link',
}

/** Spotify gives these a list inside the player, which needs the room. */
const TALL = new Set(['playlist', 'album', 'show', 'artist'])

function JamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  )
}

/** How long ago, in the shortest form that is still honest. */
function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function JamRow({ jam, me, onEnd, onRemove }: {
  jam: Jam
  me: string | null
  onEnd: (id: string, ended: boolean) => void
  onRemove: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [playing, setPlaying] = useState(false)
  const live = isLive(jam)
  const mine = jam.author_id === me

  const copy = async () => {
    haptic('tap')
    try {
      await navigator.clipboard.writeText(jam.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard refused — the link is on screen and selectable anyway.
    }
  }

  return (
    <article className={`jam-row ${live ? 'is-live' : 'is-over'}`}>
      <div className="jam-row-head">
        <span className="jam-kind">
          <JamIcon />
          {KIND_LABEL[jam.kind] ?? 'Link'}
        </span>
        {live && (
          <span className="jam-live">
            <span className="jam-live-dot" aria-hidden="true" />
            live
          </span>
        )}
        {jam.ended_at && <span className="jam-ended">ended</span>}
        {!live && !jam.ended_at && <span className="jam-stale">probably over</span>}
      </div>

      <div className="jam-body">
        {jam.thumb_url && (
          <img className="jam-art" src={jam.thumb_url} alt="" loading="lazy" width={56} height={56} />
        )}
        <div className="jam-body-text">
          {jam.title ? (
            <p className="jam-title">{jam.title}</p>
          ) : (
            <p className="jam-title is-unknown">
              {jam.kind === 'jam' ? 'Jam invite' : 'Spotify link'}
            </p>
          )}
          {jam.note && <p className="jam-note">{jam.note}</p>}
        </div>
      </div>

      {playing && jam.embed_url && (
        <iframe
          className={`jam-embed ${TALL.has(jam.kind) ? 'is-tall' : ''}`}
          src={jam.embed_url}
          title={jam.title ?? 'Spotify player'}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
      )}

      <p className="jam-meta">
        <span className="jam-who">{USERS[jam.author_id]?.name ?? jam.author_id}</span>
        <span className="jam-dot" aria-hidden="true">·</span>
        <span title={timeLabel(jam.created_at)}>{ago(jam.created_at)}</span>
        <span className="jam-dot" aria-hidden="true">·</span>
        <span>{timeLabel(jam.created_at)}</span>
      </p>

      <div className="jam-actions">
        <a
          className="jam-open"
          href={jam.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => haptic('send')}
        >
          Open in Spotify
        </a>
        {jam.embed_url && (
          <button
            type="button"
            className="jam-btn"
            onClick={() => {
              haptic('select')
              setPlaying((p) => !p)
            }}
          >
            {playing ? 'Hide player' : 'Play here'}
          </button>
        )}
        <button type="button" className="jam-btn" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="jam-btn"
          onClick={() => {
            haptic('select')
            onEnd(jam.id, !jam.ended_at)
          }}
        >
          {jam.ended_at ? 'Still going' : 'Mark ended'}
        </button>
        {mine && (
          <button
            type="button"
            className="jam-btn is-danger"
            onClick={() => {
              haptic('error')
              onRemove(jam.id)
            }}
          >
            Delete
          </button>
        )}
      </div>
    </article>
  )
}

export default function Jam() {
  const me = useSession((s) => s.user)

  const jams = useJams((s) => s.jams)
  const status = useJams((s) => s.status)
  const saving = useJams((s) => s.saving)
  const error = useJams((s) => s.error)
  const load = useJams((s) => s.load)
  const enrichMissing = useJams((s) => s.enrichMissing)
  const subscribe = useJams((s) => s.subscribe)
  const post = useJams((s) => s.post)
  const setEnded = useJams((s) => s.setEnded)
  const remove = useJams((s) => s.remove)

  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => subscribe(), [subscribe])

  // Anything posted before previews existed gets filled in once, in the
  // background. Does nothing at all in the normal case.
  useEffect(() => {
    void enrichMissing()
  }, [jams.length, enrichMissing])

  // "live" is a function of the clock, not of the data, so nothing would
  // re-render when a jam ages out without a tick.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const live = useMemo(() => jams.filter(isLive), [jams])
  const past = useMemo(() => jams.filter((j) => !isLive(j)), [jams])
  const days = useMemo(() => groupByDate(past, (j) => j.created_at), [past])

  const submit = async () => {
    if (!me || !url.trim()) return
    haptic('send')
    const ok = await post(url, note, me)
    if (ok) {
      setUrl('')
      setNote('')
    }
  }

  const paste = async () => {
    haptic('tap')
    try {
      const text = await navigator.clipboard.readText()
      if (text) setUrl(text)
    } catch {
      // Safari and Firefox refuse without a gesture they like; typing works.
    }
  }

  const preview = url.trim() ? KIND_LABEL[kindOf(url.trim())] : null

  return (
    <div className="screen-scroll">
      <ScreenHeader
        title="Jam Links"
        sub={live.length ? `${live.length} live now` : `${jams.length} shared`}
      />

      <section className="jam-composer">
        <div className="jam-input-row">
          <input
            className="jam-input"
            type="url"
            inputMode="url"
            placeholder="Paste a Spotify link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
          <button type="button" className="jam-btn" onClick={paste}>
            Paste
          </button>
        </div>

        <input
          className="jam-input"
          type="text"
          placeholder="Say something about it (optional)"
          value={note}
          maxLength={140}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />

        <div className="jam-composer-foot">
          {preview && <span className="jam-preview">{preview} detected</span>}
          <button
            type="button"
            className="jam-post"
            disabled={!url.trim() || saving}
            onClick={() => void submit()}
          >
            {saving ? 'Sharing…' : 'Share'}
          </button>
        </div>

        {error && <p className="jam-error">{error}</p>}
      </section>

      {status === 'loading' && jams.length === 0 && <p className="jam-empty">Loading…</p>}

      {status === 'ready' && jams.length === 0 && (
        <p className="jam-empty">
          Nothing yet. Start a Jam in Spotify, tap share, and paste the link here.
        </p>
      )}

      {live.length > 0 && (
        <section className="jam-section">
          <h2 className="jam-heading">Live now</h2>
          {live.map((jam) => (
            <JamRow key={jam.id} jam={jam} me={me} onEnd={setEnded} onRemove={remove} />
          ))}
        </section>
      )}

      {days.map(([day, items]) => (
        <section className="jam-section" key={day}>
          <h2 className="jam-heading">{dayLabel(day)}</h2>
          {items.map((jam) => (
            <JamRow key={jam.id} jam={jam} me={me} onEnd={setEnded} onRemove={remove} />
          ))}
        </section>
      ))}

      {jams.length > 0 && (
        <p className="jam-footnote">
          A Jam link only works while the host has it open. Anything older than{' '}
          {LIVE_HOURS} hours is assumed over.
        </p>
      )}
    </div>
  )
}
