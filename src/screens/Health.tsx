import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { useSession } from '../store/session'
import './Health.css'

type Level = 'ok' | 'warn' | 'down'

interface Check {
  id: string
  label: string
  /** What this proves, so a red light is actionable rather than alarming. */
  detail: string
  level: Level
  ms?: number
}

const TABLES = [
  { table: 'messages', label: 'Messages' },
  { table: 'notes', label: 'Notes' },
  { table: 'gallery', label: 'Gallery' },
  { table: 'fits', label: 'Fits' },
  { table: 'voice_notes', label: 'Voice notes' },
  { table: 'jams', label: 'Jams' },
  { table: 'media', label: 'Media rows' },
]

const since = (iso: string | null) => {
  if (!iso) return 'never'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Health() {
  const navigate = useNavigate()
  const isAdmin = useSession((s) => s.isAdmin)
  const [checks, setChecks] = useState<Check[]>([])
  const [counts, setCounts] = useState<{ label: string; count: number | null }[]>([])
  const [newest, setNewest] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const run = useCallback(async () => {
    setRunning(true)
    const results: Check[] = []

    results.push({
      id: 'config',
      label: 'Configuration',
      detail: supabaseConfigured
        ? 'URL and anon key are compiled into this build.'
        : 'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing from the build.',
      level: supabaseConfigured ? 'ok' : 'down',
    })

    if (!supabase) {
      setChecks(results)
      setRunning(false)
      return
    }

    // --- database ---------------------------------------------------------
    {
      const started = performance.now()
      const { error } = await supabase.from('messages').select('id', { head: true, count: 'exact' })
      const ms = Math.round(performance.now() - started)
      results.push({
        id: 'db',
        label: 'Database',
        detail: error ? error.message : 'Reachable, and row level security let this read through.',
        level: error ? 'down' : ms > 1200 ? 'warn' : 'ok',
        ms,
      })
    }

    // --- realtime ---------------------------------------------------------
    {
      const started = performance.now()
      const level = await new Promise<Level>((resolve) => {
        const channel = supabase!.channel(`health-${Date.now()}`)
        // A socket that never opens hangs rather than erroring, so the timeout
        // is the actual test.
        const timer = setTimeout(() => {
          void supabase!.removeChannel(channel)
          resolve('down')
        }, 6000)
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timer)
            void supabase!.removeChannel(channel)
            resolve(status === 'SUBSCRIBED' ? 'ok' : 'down')
          }
        })
      })
      results.push({
        id: 'realtime',
        label: 'Realtime',
        detail:
          level === 'ok'
            ? 'Subscribed. Live messages, presence and the shared board all ride on this.'
            : 'Could not open a channel. Everything still works, but nothing arrives without a refresh.',
        level,
        ms: Math.round(performance.now() - started),
      })
    }

    // --- media signing ----------------------------------------------------
    {
      const started = performance.now()
      // Deliberately an empty request: this asks whether the function is
      // deployed and answering, not whether it can sign a particular file.
      const { error } = await supabase.functions.invoke('media-sign', { body: { keys: [] } })
      const ms = Math.round(performance.now() - started)
      results.push({
        id: 'media',
        label: 'Media signing',
        detail: error
          ? `media-sign did not answer: ${error.message}. Photos and voice notes will not load.`
          : 'Deployed and answering. This is what turns stored files into viewable links.',
        level: error ? 'down' : 'ok',
        ms,
      })
    }

    setChecks(results)

    const sizes = await Promise.all(
      TABLES.map(async ({ table, label }) => {
        const { count, error } = await supabase!.from(table).select('id', { head: true, count: 'exact' })
        return { label, count: error ? null : (count ?? 0) }
      }),
    )
    setCounts(sizes)

    const { data } = await supabase
      .from('messages')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
    setNewest((data?.[0] as { created_at?: string } | undefined)?.created_at ?? null)
    setRunning(false)
  }, [])

  useEffect(() => {
    void run()
  }, [run])

  if (!isAdmin) {
    return (
      <div className="screen-scroll">
        <header className="screen-head">
          <h1 className="screen-title">Health</h1>
        </header>
        <p className="health-detail">Admin only.</p>
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
        <h1 className="screen-title">Health</h1>
        <p className="screen-sub">Whether anything is broken right now</p>
      </header>

      <section className="panel">
        <div className="health-head">
          <h2 className="panel-title">Checks</h2>
          <button type="button" className="health-rerun" onClick={() => void run()} disabled={running}>
            {running ? 'Checking…' : 'Run again'}
          </button>
        </div>

        {checks.map((check) => (
          <div key={check.id} className={`health-row is-${check.level}`}>
            <span className="health-dot" aria-hidden="true" />
            <div className="health-body">
              <p className="health-label">
                {check.label}
                {check.ms !== undefined && <span className="health-ms">{check.ms}ms</span>}
              </p>
              <p className="health-detail">{check.detail}</p>
            </div>
          </div>
        ))}
        {!checks.length && <p className="health-detail">Running…</p>}
      </section>

      <section className="panel">
        <h2 className="panel-title">Size</h2>
        <p className="panel-note">Last message {since(newest)}.</p>
        <div className="health-counts">
          {counts.map((row) => (
            <div key={row.label} className="health-count">
              <span className="health-count-n">{row.count === null ? '—' : row.count.toLocaleString()}</span>
              <span className="health-count-l">{row.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
