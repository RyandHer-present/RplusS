import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { usePresence, POINTER_STALE } from '../store/presence'
import { USERS, useSession } from '../store/session'
import './PartnerPointer.css'

/*
 * Where they are touching.
 *
 * Positions are sent as a fraction of the viewport rather than in pixels,
 * because the two of you are almost never on the same size screen — a phone
 * and a desktop have to agree on "two thirds down the page", not on "at y=740".
 *
 * The dot is moved by writing a transform in an animation frame rather than
 * through React state. Sixteen re-renders a second of the whole tree, to move
 * one circle, would be a poor trade.
 */

/** How much of the gap to close each frame. Lower is smoother and laggier. */
const EASE = 0.18

export function PartnerPointer() {
  const dotRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const me = useSession((s) => s.user)
  const sendPointer = usePresence((s) => s.sendPointer)
  const clearPointer = usePresence((s) => s.clearPointer)

  // --- send ours ---------------------------------------------------------
  useEffect(() => {
    if (!me) return

    const send = (event: PointerEvent, down: boolean) => {
      sendPointer(
        event.clientX / window.innerWidth,
        event.clientY / window.innerHeight,
        location.pathname,
        down,
      )
    }

    const onMove = (e: PointerEvent) => send(e, e.pressure > 0 || e.buttons > 0)
    const onDown = (e: PointerEvent) => send(e, true)
    const onUp = (e: PointerEvent) => send(e, false)

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    // A finger lifted off a phone leaves no cursor behind, so say so.
    window.addEventListener('pointercancel', clearPointer)
    window.addEventListener('blur', clearPointer)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', clearPointer)
      window.removeEventListener('blur', clearPointer)
      clearPointer()
    }
  }, [me, location.pathname, sendPointer, clearPointer])

  // --- draw theirs -------------------------------------------------------
  useEffect(() => {
    let frame = 0
    let x = 0
    let y = 0
    let started = false

    const tick = () => {
      frame = requestAnimationFrame(tick)
      const dot = dotRef.current
      if (!dot) return

      const pointer = usePresence.getState().otherPointer
      const fresh =
        pointer &&
        Date.now() - pointer.at < POINTER_STALE &&
        pointer.path === location.pathname

      if (!fresh) {
        dot.style.opacity = '0'
        started = false
        return
      }

      const targetX = pointer.x * window.innerWidth
      const targetY = pointer.y * window.innerHeight

      // Jump to the first position rather than sliding in from the corner.
      if (!started) {
        x = targetX
        y = targetY
        started = true
      } else {
        x += (targetX - x) * EASE
        y += (targetY - y) * EASE
      }

      dot.style.opacity = '1'
      dot.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${pointer.down ? 1.5 : 1})`
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [location.pathname])

  const them = me === 'ry' ? USERS.sarah : USERS.ry

  return (
    <div className="partner-pointer" ref={dotRef} aria-hidden="true">
      <span className="partner-pointer-ring" />
      <span className="partner-pointer-name">{them.name}</span>
    </div>
  )
}
