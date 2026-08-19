import { useEffect, useRef, useState } from 'react'
import { resolveMediaUrls } from '../lib/media'
import { haptic } from '../lib/haptics'
import type { VoiceNote } from '../lib/types'
import './VoicePlayer.css'

const SPEEDS = [1, 1.5, 2]

function formatTime(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

interface Props {
  note: VoiceNote
  onPlayed: () => void
}

export function VoicePlayer({ note, onPlayed }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const barsRef = useRef<HTMLDivElement>(null)

  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [ready, setReady] = useState(false)

  const duration = (note.media?.duration_ms ?? 0) / 1000
  const peaks = note.peaks?.length ? note.peaks : new Array(48).fill(0.35)
  const progress = duration > 0 ? Math.min(1, time / duration) : 0

  // Picking up where you left off, remembered per note on this device.
  const resumeKey = `rpluss.voice.${note.id}`

  const ensureLoaded = async () => {
    const audio = audioRef.current
    if (!audio || audio.src) return
    const urls = await resolveMediaUrls([note.media!.b2_key])
    audio.src = urls[note.media!.b2_key]
    const saved = Number(localStorage.getItem(resumeKey) ?? 0)
    if (saved > 0 && saved < duration - 1) audio.currentTime = saved
    setReady(true)
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime = () => {
      setTime(audio.currentTime)
      // Cheap enough to write every tick, and means a killed tab still resumes.
      localStorage.setItem(resumeKey, String(audio.currentTime))
    }
    const onEnd = () => {
      setPlaying(false)
      setTime(0)
      localStorage.removeItem(resumeKey)
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
    }
  }, [resumeKey])

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return
    haptic('tap')

    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }

    await ensureLoaded()
    audio.playbackRate = speed
    await audio.play()
    setPlaying(true)
    if (!note.listened_at) onPlayed()
  }

  const scrub = (clientX: number) => {
    const bars = barsRef.current
    const audio = audioRef.current
    if (!bars || !audio || !duration) return

    const rect = bars.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    audio.currentTime = ratio * duration
    setTime(ratio * duration)
  }

  return (
    <div className={`vp ${note.listened_at ? '' : 'is-unheard'}`}>
      <audio ref={audioRef} preload="none" />

      <button type="button" className="vp-play" onClick={() => void toggle()} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? (
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h3v14H8zM13 5h3v14h-3z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
        )}
      </button>

      <div className="vp-body">
        <div
          className="vp-bars"
          ref={barsRef}
          onPointerDown={(e) => {
            if (!ready) return
            e.currentTarget.setPointerCapture(e.pointerId)
            scrub(e.clientX)
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1 && ready) scrub(e.clientX)
          }}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          tabIndex={0}
        >
          {peaks.map((peak, i) => (
            <span
              key={i}
              className={`vp-bar ${i / peaks.length <= progress ? 'is-played' : ''}`}
              // Floor keeps silent stretches visible instead of collapsing to nothing.
              style={{ height: `${Math.max(12, peak * 100)}%` }}
            />
          ))}
        </div>

        <div className="vp-meta">
          <span>{formatTime(playing || time ? time : duration)}</span>
          <button
            type="button"
            className="vp-speed"
            onClick={() => {
              const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
              setSpeed(next)
              if (audioRef.current) audioRef.current.playbackRate = next
              haptic('select')
            }}
          >
            {speed}×
          </button>
        </div>
      </div>
    </div>
  )
}
