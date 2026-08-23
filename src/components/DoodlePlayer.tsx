import { useEffect, useRef, useState } from 'react'
import type { Stroke } from '../lib/types'
import './DoodlePlayer.css'

/**
 * Watches a doodle being drawn again.
 *
 * Speed is per-point rather than per-stroke, so a long sweeping line takes
 * longer than a short flick — which is what makes it look like someone drawing
 * rather than a progress bar. The recording has no timestamps in it (they would
 * roughly double the stored size for something nobody would notice), so this is
 * a plausible pace rather than the true one.
 */

const POINTS_PER_SECOND = 90
const PEN_LIFT_MS = 120

interface Props {
  strokes: Stroke[]
  /** The finished image, shown before playing and after it ends. */
  poster?: React.ReactNode
}

export function DoodlePlayer({ strokes, poster }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frame = useRef<number | undefined>(undefined)
  const [playing, setPlaying] = useState(false)

  const total = strokes.reduce((n, s) => n + s.p.length, 0)

  useEffect(() => {
    if (!playing) return
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)

    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = '#12121d'
    ctx.fillRect(0, 0, rect.width, rect.height)

    // Flattened to one list so the whole drawing advances at a steady pace and
    // the gap between strokes is a real pause rather than a dropped frame.
    const steps: { stroke: Stroke; index: number }[] = []
    for (const stroke of strokes) {
      for (let i = 0; i < stroke.p.length; i++) steps.push({ stroke, index: i })
    }

    let drawn = 0
    let started: number | null = null
    let pauseUntil = 0

    const tick = (now: number) => {
      if (started === null) started = now
      if (now < pauseUntil) {
        frame.current = requestAnimationFrame(tick)
        return
      }

      const due = Math.min(steps.length, Math.floor(((now - started) / 1000) * POINTS_PER_SECOND))

      while (drawn < due) {
        const step = steps[drawn]
        const { stroke, index } = step
        const [x, y] = stroke.p[index]

        if (index === 0) {
          // Pen down: pause briefly, as a hand would between strokes.
          if (drawn > 0) {
            pauseUntil = now + PEN_LIFT_MS
            started += PEN_LIFT_MS
          }
          ctx.beginPath()
          ctx.strokeStyle = stroke.c
          ctx.lineWidth = Math.max(1, stroke.w * rect.width)
          ctx.moveTo(x * rect.width, y * rect.height)
          // A single-point stroke is a tap, and should still leave a dot.
          if (stroke.p.length === 1) {
            ctx.lineTo(x * rect.width, y * rect.height)
            ctx.stroke()
          }
        } else {
          ctx.lineTo(x * rect.width, y * rect.height)
          ctx.stroke()
        }

        drawn++
        if (pauseUntil > now) break
      }

      if (drawn >= steps.length) {
        setPlaying(false)
        return
      }
      frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    }
  }, [playing, strokes])

  if (!strokes.length) return <>{poster}</>

  return (
    <div className="doodle-player">
      {playing ? <canvas ref={canvasRef} className="doodle-player-canvas" /> : poster}
      <button
        type="button"
        className="doodle-replay"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? 'Stop' : 'Watch it being drawn'}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        )}
        <span>{playing ? 'Stop' : 'Watch'}</span>
      </button>
      <span className="doodle-player-count">{total} points</span>
    </div>
  )
}
