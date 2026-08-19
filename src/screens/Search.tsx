import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { USERS, useSession, type UserId } from '../store/session'
import { fullStamp } from '../lib/dates'
import { haptic } from '../lib/haptics'
import './Search.css'

interface Hit {
  kind: 'message' | 'note'
  id: string
  who: UserId
  title: string | null
  body: string
  at: string
}

/** Wraps every match in the text so the reason a result matched is obvious. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'))

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i}>{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

export default function Search() {
  const navigate = useNavigate()
  const me = useSession((s) => s.user)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced so a fast typist does not fire a query per keystroke.
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setHits([])
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(async () => {
      if (!supabase) return
      // Escape the wildcards so a literal % or _ searches for itself.
      const pattern = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`

      const [messages, notes] = await Promise.all([
        supabase.from('messages').select('id, sender_id, body, created_at').ilike('body', pattern).order('created_at', { ascending: false }).limit(60),
        supabase.from('notes').select('id, author_id, title, body, created_at').or(`body.ilike.${pattern},title.ilike.${pattern}`).order('created_at', { ascending: false }).limit(60),
      ])

      if (cancelled) return

      const found: Hit[] = [
        ...(messages.data ?? []).map((m) => ({
          kind: 'message' as const,
          id: m.id as string,
          who: m.sender_id as UserId,
          title: null,
          body: (m.body ?? '') as string,
          at: m.created_at as string,
        })),
        ...(notes.data ?? []).map((n) => ({
          kind: 'note' as const,
          id: n.id as string,
          who: n.author_id as UserId,
          title: (n.title ?? null) as string | null,
          body: (n.body ?? '') as string,
          at: n.created_at as string,
        })),
      ].sort((a, b) => b.at.localeCompare(a.at))

      setHits(found)
      setSearching(false)
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      setSearching(false)
    }
  }, [query])

  const counts = useMemo(
    () => ({
      message: hits.filter((h) => h.kind === 'message').length,
      note: hits.filter((h) => h.kind === 'note').length,
    }),
    [hits],
  )

  return (
    <div className="search">
      <header className="search-bar">
        <div className="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            placeholder="Search messages and notes"
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear">
              ✕
            </button>
          )}
        </div>
        <button type="button" className="search-cancel" onClick={() => navigate(-1)}>
          Done
        </button>
      </header>

      <div className="search-results">
        {query.trim().length >= 2 && !searching && hits.length === 0 && (
          <p className="search-empty">Nothing found for “{query.trim()}”.</p>
        )}

        {hits.length > 0 && (
          <p className="search-count">
            {counts.message} message{counts.message === 1 ? '' : 's'} · {counts.note} note
            {counts.note === 1 ? '' : 's'}
          </p>
        )}

        {hits.map((hit) => (
          <button
            key={`${hit.kind}-${hit.id}`}
            type="button"
            className="search-hit"
            onClick={() => {
              haptic('tap')
              navigate(hit.kind === 'message' ? '/chat' : '/notes')
            }}
          >
            <span className="search-hit-head">
              <span className={`search-kind is-${hit.kind}`}>{hit.kind}</span>
              <span className="search-who">{hit.who === me ? 'You' : USERS[hit.who].name}</span>
              <span className="search-when">{fullStamp(hit.at)}</span>
            </span>
            {hit.title && (
              <span className="search-hit-title">
                <Highlight text={hit.title} query={query.trim()} />
              </span>
            )}
            <span className="search-hit-body">
              <Highlight text={hit.body} query={query.trim()} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
