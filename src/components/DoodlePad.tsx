import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/haptics'
import './DoodlePad.css'

const COLORS = ['#ffffff', '#21d4fd', '#ff5cf0', '#ffb347', '#35e08a', '#ff4d6a']
const SIZES = [3, 7, 14]

interface Props {
  onClose: () => void
  onSend: (file: File) => void
  busy?: boolean
}

/** Finger-drawn note. Exports a transparent PNG on a dark card. */
export function DoodlePad({ onClose, onSend, busy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Back the canvas at device resolution so strokes are not soft, but cap it
    // so a 3x phone does not allocate a needlessly huge buffer.
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
  }, [])

  const pointAt = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const stroke = (to: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !last.current) return

    ctx.strokeStyle = color
    ctx.lineWidth = size
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    last.current = to
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#12121d'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setDirty(false)
    haptic('error')
  }

  const send = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return
      onSend(new File([blob], 'doodle.png', { type: 'image/png' }))
    }, 'image/png')
  }

  return createPortal(
    <div className="doodle" role="dialog" aria-modal="true">
      <header className="doodle-bar">
        <button type="button" className="doodle-cancel" onClick={onClose}>
          Cancel
        </button>
        <span className="doodle-title">Doodle</span>
        <button type="button" className="doodle-send" disabled={!dirty || busy} onClick={send}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </header>

      <canvas
        ref={canvasRef}
        className="doodle-canvas"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drawing.current = true
          last.current = pointAt(e)
          // A tap with no drag should still leave a dot.
          stroke(pointAt(e))
          setDirty(true)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          stroke(pointAt(e))
        }}
        onPointerUp={() => {
          drawing.current = false
          last.current = null
        }}
        onPointerCancel={() => {
          drawing.current = false
          last.current = null
        }}
      />

      <footer className="doodle-tools">
        <div className="doodle-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`doodle-color ${color === c ? 'is-active' : ''}`}
              style={{ background: c }}
              aria-label={c}
              onClick={() => {
                setColor(c)
                haptic('tap')
              }}
            />
          ))}
        </div>
        <div className="doodle-sizes">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={`doodle-size ${size === s ? 'is-active' : ''}`}
              aria-label={`Brush ${s}`}
              onClick={() => {
                setSize(s)
                haptic('tap')
              }}
            >
              <span style={{ width: s + 4, height: s + 4 }} />
            </button>
          ))}
          <button type="button" className="doodle-clear" onClick={clear}>
            Clear
          </button>
        </div>
      </footer>
    </div>,
    document.body,
  )
}
