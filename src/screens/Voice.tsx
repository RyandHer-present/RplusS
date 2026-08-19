import { useEffect, useRef, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { VoicePlayer } from '../components/VoicePlayer'
import { VoiceRecorder } from '../lib/recorder'
import { useVoice } from '../store/voice'
import { USERS, useSession } from '../store/session'
import { haptic } from '../lib/haptics'
import './Voice.css'

const LIVE_BARS = 40

function formatClock(ms: number) {
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function dayLabel(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function Voice() {
  const me = useSession((s) => s.user)
  const isAdmin = useSession((s) => s.isAdmin)
  const notes = useVoice((s) => s.notes)
  const status = useVoice((s) => s.status)
  const saving = useVoice((s) => s.saving)
  const error = useVoice((s) => s.error)
  const load = useVoice((s) => s.load)
  const subscribe = useVoice((s) => s.subscribe)
  const save = useVoice((s) => s.save)
  const markListened = useVoice((s) => s.markListened)
  const removeNote = useVoice((s) => s.remove)

  const recorderRef = useRef<VoiceRecorder | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [levels, setLevels] = useState<number[]>([])
  const [micError, setMicError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => subscribe(), [subscribe])

  // Releasing the microphone matters more than usual here: leaving it open
  // keeps the recording indicator lit on the phone's status bar.
  useEffect(() => () => recorderRef.current?.cancel(), [])

  const start = async () => {
    setMicError(null)
    const recorder = new VoiceRecorder()
    recorder.onLevel = (level) =>
      setLevels((prev) => [...prev.slice(-(LIVE_BARS - 1)), Math.min(1, level * 2.6)])

    try {
      await recorder.start()
    } catch {
      setMicError('Microphone blocked. Allow it in your browser settings.')
      return
    }

    recorderRef.current = recorder
    setRecording(true)
    setElapsed(0)
    setLevels([])
    haptic('success')

    const startedAt = Date.now()
    timerRef.current = window.setInterval(() => setElapsed(Date.now() - startedAt), 200)
  }

  const stop = async () => {
    const recorder = recorderRef.current
    if (!recorder) return

    window.clearInterval(timerRef.current)
    setRecording(false)
    haptic('send')

    const result = await recorder.stop()
    recorderRef.current = null
    setLevels([])

    // Anything under a second is almost always a mis-tap.
    if (result.durationMs < 1000 || !me) return
    await save(result, me)
  }

  const discard = () => {
    window.clearInterval(timerRef.current)
    recorderRef.current?.cancel()
    recorderRef.current = null
    setRecording(false)
    setLevels([])
    haptic('error')
  }

  return (
    <div className="screen-scroll">
      <ScreenHeader title="Voice" sub={notes.length ? `${notes.length} saved` : undefined} />

      {me && (
      <section className={`rec ${recording ? 'is-live' : ''}`}>
        {recording ? (
          <>
            <div className="rec-wave" aria-hidden="true">
              {Array.from({ length: LIVE_BARS }).map((_, i) => (
                <span
                  key={i}
                  className="rec-bar"
                  style={{ height: `${Math.max(8, (levels[i] ?? 0) * 100)}%` }}
                />
              ))}
            </div>
            <div className="rec-controls">
              <button type="button" className="rec-discard" onClick={discard}>
                Discard
              </button>
              <span className="rec-clock">{formatClock(elapsed)}</span>
              <button type="button" className="rec-stop" onClick={() => void stop()}>
                Stop
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="rec-start"
            disabled={saving}
            onClick={() => void start()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
              <path d="M5 11.5a7 7 0 0 0 14 0M12 18.5V21.5" />
            </svg>
            {saving ? 'Saving…' : 'Hold a thought'}
          </button>
        )}
      </section>
      )}

      {(micError || error) && <p className="rec-error">{micError ?? error}</p>}

      {status === 'ready' && notes.length === 0 && !recording && (
        <p className="voice-empty">Nothing recorded yet.</p>
      )}

      <div className="voice-list">
        {notes.map((note) => (
          <article key={note.id} className="voice-item">
            <header className="voice-item-head">
              <span className="voice-who">{note.author_id === me ? 'You' : USERS[note.author_id].name}</span>
              <span className="voice-head-right">
                <span className="voice-when">{dayLabel(note.created_at)}</span>
                {(note.author_id === me || isAdmin) && (
                  <button
                    type="button"
                    className={`voice-delete ${confirming === note.id ? 'is-confirming' : ''}`}
                    onClick={() => {
                      // Two taps: a voice note cannot be recovered once gone.
                      if (confirming !== note.id) {
                        setConfirming(note.id)
                        haptic('tap')
                        window.setTimeout(
                          () => setConfirming((c) => (c === note.id ? null : c)),
                          3000,
                        )
                        return
                      }
                      haptic('error')
                      void removeNote(note.id)
                      setConfirming(null)
                    }}
                  >
                    {confirming === note.id ? 'Sure?' : 'Delete'}
                  </button>
                )}
              </span>
            </header>
            <VoicePlayer note={note} onPlayed={() => void markListened(note.id)} />
          </article>
        ))}
      </div>
    </div>
  )
}
