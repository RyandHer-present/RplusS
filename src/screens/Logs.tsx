import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogs, type AuditEntry } from '../store/logs'
import { useSession, USERS, type UserId } from '../store/session'
import { fullStamp } from '../lib/dates'
import { haptic } from '../lib/haptics'
import './Logs.css'

type Tab = 'messages' | 'activity' | 'content' | 'stats'

const TABS: { id: Tab; label: string }[] = [
  { id: 'messages', label: 'Messages' },
  { id: 'activity', label: 'Activity' },
  { id: 'content', label: 'Content' },
  { id: 'stats', label: 'Stats' },
]

const ENTITY_LABEL: Record<string, string> = {
  messages: 'message',
  notes: 'note',
  fits: 'fit',
  gallery: 'gallery post',
  voice_notes: 'voice note',
  jams: 'jam link',
  media: 'file',
}

function actorName(actor: string | null) {
  if (actor === 'admin') return 'Admin'
  if (actor === 'ry' || actor === 'sarah') return USERS[actor].name
  return 'Unknown'
}

function duration(ms: number) {
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

function MessageLog({ entries }: { entries: AuditEntry[] }) {
  const relevant = entries.filter(
    (e) =>
      e.entity === 'messages' &&
      (e.action === 'delete' || (e.action === 'update' && e.detail && 'body' in e.detail)),
  )

  if (!relevant.length) return <p className="log-empty">No edits or unsends recorded yet.</p>

  return (
    <div className="log-list">
      {relevant.map((entry) => {
        const detail = entry.detail as Record<string, { from?: unknown; to?: unknown }> & {
          body?: unknown
          sender_id?: unknown
        }

        if (entry.action === 'delete') {
          return (
            <article key={entry.id} className="log-row is-delete">
              <header>
                <span className="log-tag is-delete">Unsent</span>
                <span className="log-when">{fullStamp(entry.at)}</span>
              </header>
              <p className="log-body">{String(detail.body ?? '(no text)')}</p>
              <footer>
                sent by {actorName(String(detail.sender_id ?? ''))} · removed by {actorName(entry.actor)}
              </footer>
            </article>
          )
        }

        const change = detail.body as { from?: unknown; to?: unknown }
        return (
          <article key={entry.id} className="log-row is-edit">
            <header>
              <span className="log-tag is-edit">Edited</span>
              <span className="log-when">{fullStamp(entry.at)}</span>
            </header>
            <p className="log-body is-before">{String(change?.from ?? '')}</p>
            <p className="log-body is-after">{String(change?.to ?? '')}</p>
            <footer>by {actorName(entry.actor)}</footer>
          </article>
        )
      })}
    </div>
  )
}

export default function Logs() {
  const navigate = useNavigate()
  const isAdmin = useSession((s) => s.isAdmin)
  const { audit, presence, stats, status, error, load } = useLogs()
  const [tab, setTab] = useState<Tab>('messages')

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  const contentEntries = useMemo(
    () => audit.filter((e) => e.action === 'insert' && e.entity !== 'media'),
    [audit],
  )

  // Coming online and signing in belong on the same timeline — read together
  // they answer "was that them", which neither does alone.
  const activityRows = useMemo(() => {
    const rows = [
      ...presence.map((e) => ({ kind: 'presence' as const, at: e.at, presence: e })),
      ...audit
        .filter((e) => e.action === 'login' || e.action === 'login_failed')
        .map((e) => ({ kind: 'signin' as const, at: e.at, signin: e })),
    ]
    return rows.sort((a, b) => b.at.localeCompare(a.at))
  }, [presence, audit])

  if (!isAdmin) {
    return (
      <div className="screen-scroll">
        <p className="log-empty">Admin only.</p>
      </div>
    )
  }

  return (
    <div className="screen-scroll">
      <button type="button" className="screen-back" onClick={() => navigate(-1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Back
      </button>

      <header className="screen-head">
        <h1 className="screen-title">Logs</h1>
        <p className="screen-sub">{audit.length} events</p>
      </header>

      <div className="log-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`log-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => {
              haptic('select')
              setTab(t.id)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {status === 'loading' && <p className="log-empty">Loading…</p>}
      {error && <p className="log-error">{error}</p>}

      {tab === 'messages' && <MessageLog entries={audit} />}

      {tab === 'activity' && (
        <div className="log-list">
          {activityRows.length === 0 && <p className="log-empty">No sessions recorded yet.</p>}
          {activityRows.map((row) => {
            if (row.kind === 'presence') {
              const entry = row.presence
              return (
                <div
                  key={`p${entry.id}`}
                  className={`log-line ${entry.event === 'online' ? 'is-on' : 'is-off'}`}
                >
                  <span className="log-dot" aria-hidden="true" />
                  <span className="log-line-who">{USERS[entry.user_id].name}</span>
                  <span className="log-line-what">
                    {entry.event === 'online' ? 'came online' : 'went offline'}
                  </span>
                  <span className="log-when">{fullStamp(entry.at)}</span>
                </div>
              )
            }

            const entry = row.signin
            const failed = entry.action === 'login_failed'
            const ip = (entry.detail as { ip?: unknown } | null)?.ip
            return (
              <div key={`s${entry.id}`} className={`log-line ${failed ? 'is-delete' : 'is-on'}`}>
                <span className={`log-dot ${failed ? '' : 'is-add'}`} aria-hidden="true" />
                <span className="log-line-who">{failed ? 'Someone' : actorName(entry.actor)}</span>
                <span className="log-line-what">
                  {failed ? 'got the PIN wrong' : 'signed in'}
                  {typeof ip === 'string' ? ` from ${ip}` : ''}
                </span>
                <span className="log-when">{fullStamp(entry.at)}</span>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'content' && (
        <div className="log-list">
          {contentEntries.length === 0 && <p className="log-empty">Nothing posted yet.</p>}
          {contentEntries.map((entry) => {
            const detail = (entry.detail ?? {}) as Record<string, unknown>
            const who = detail.author_id ?? detail.sender_id ?? detail.owner_id ?? entry.actor
            return (
              <div key={entry.id} className="log-line">
                <span className="log-dot is-add" aria-hidden="true" />
                <span className="log-line-who">{actorName(String(who ?? ''))}</span>
                <span className="log-line-what">added a {ENTITY_LABEL[entry.entity] ?? entry.entity}</span>
                <span className="log-when">{fullStamp(entry.at)}</span>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'stats' && stats && (
        <div className="stats">
          <div className="stat-grid">
            {(['ry', 'sarah'] as UserId[]).map((user) => (
              <div key={user} className="stat-card">
                <span className="stat-value">{stats.totals[user]}</span>
                <span className="stat-label">{USERS[user].name}’s messages</span>
                <span className="stat-note">{stats.words[user].toLocaleString()} words</span>
              </div>
            ))}
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-value">{stats.perDay}</span>
              <span className="stat-label">messages a day</span>
              <span className="stat-note">over {stats.activeDays} active days</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {stats.busiestHour ? `${stats.busiestHour.hour}:00` : '—'}
              </span>
              <span className="stat-label">busiest hour</span>
              <span className="stat-note">{stats.busiestHour?.count ?? 0} messages</span>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-value">
                {stats.medianReplyMs ? duration(stats.medianReplyMs) : '—'}
              </span>
              <span className="stat-label">typical reply time</span>
              <span className="stat-note">median, gaps under 6h</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.edited + stats.unsent}</span>
              <span className="stat-label">edits &amp; unsends</span>
              <span className="stat-note">
                {stats.edited} edited · {stats.unsent} unsent
              </span>
            </div>
          </div>

          <section className="stat-block">
            <h2>Time on the site</h2>
            {(['ry', 'sarah'] as UserId[]).map((user) => (
              <div key={user} className="stat-row">
                <span>{USERS[user].name}</span>
                <span>
                  {duration(stats.sessionsByUser[user].totalMs)} · {stats.sessionsByUser[user].count} sessions
                </span>
              </div>
            ))}
          </section>

          <section className="stat-block">
            <h2>Posted</h2>
            {Object.entries(stats.content).length === 0 && <p className="log-empty">Nothing yet.</p>}
            {Object.entries(stats.content).map(([entity, count]) => (
              <div key={entity} className="stat-row">
                <span>{ENTITY_LABEL[entity] ?? entity}</span>
                <span>{count}</span>
              </div>
            ))}
          </section>

          {stats.topEmoji.length > 0 && (
            <section className="stat-block">
              <h2>Most used emoji</h2>
              <div className="chips">
                {stats.topEmoji.map(([emoji, count]) => (
                  <span key={emoji} className="stat-chip">
                    {emoji} {count}
                  </span>
                ))}
              </div>
            </section>
          )}

          {stats.topWords.length > 0 && (
            <section className="stat-block">
              <h2>Most used words</h2>
              <div className="chips">
                {stats.topWords.map(([word, count]) => (
                  <span key={word} className="stat-chip">
                    {word} <small>{count}</small>
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
