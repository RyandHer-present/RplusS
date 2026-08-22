import { useEffect, useRef } from 'react'
import { useVisuals } from '../store/visuals'

/**
 * The two effects that have to follow a finger: a soft light under it, and a
 * ring left behind wherever you tap.
 *
 * Both are driven by writing CSS custom properties rather than React state —
 * a pointermove that re-rendered the tree would be a frame killer. Positions
 * are written once per animation frame, not once per event.
 */
export function PointerFx() {
  const spotlight = useVisuals((s) => s.enabled.spotlight)
  const ripple = useVisuals((s) => s.enabled.ripple)
  const lightRef = useRef<HTMLDivElement>(null)
  const rippleHost = useRef<HTMLDivElement>(null)

  // --- the light that trails your finger ---
  useEffect(() => {
    if (!spotlight) return
    const el = lightRef.current
    if (!el) return

    let x = 0
    let y = 0
    let queued = false
    let idle = 0

    const paint = () => {
      queued = false
      el.style.setProperty('--px', `${x}px`)
      el.style.setProperty('--py', `${y}px`)
    }

    const onMove = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      el.classList.add('is-lit')
      if (!queued) {
        queued = true
        requestAnimationFrame(paint)
      }
      // Fade out once the finger has been still for a moment, so a parked
      // cursor does not leave a permanent bright spot on the screen.
      window.clearTimeout(idle)
      idle = window.setTimeout(() => el.classList.remove('is-lit'), 900)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onMove)
      window.clearTimeout(idle)
    }
  }, [spotlight])

  // --- the ring left behind by a tap ---
  useEffect(() => {
    if (!ripple) return
    const host = rippleHost.current
    if (!host) return

    const onDown = (e: PointerEvent) => {
      // Scrolling a list drags the pointer; only a real press should ring.
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const ring = document.createElement('span')
      ring.className = 'fx-ring'
      ring.style.left = `${e.clientX}px`
      ring.style.top = `${e.clientY}px`
      ring.addEventListener('animationend', () => ring.remove(), { once: true })
      host.appendChild(ring)
      // Belt and braces: if the animation never fires (backgrounded tab), the
      // node still goes away rather than accumulating forever.
      window.setTimeout(() => ring.remove(), 1200)
    }

    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => window.removeEventListener('pointerdown', onDown)
  }, [ripple])

  return (
    <>
      <div className="fx-spotlight" ref={lightRef} aria-hidden="true" />
      <div className="fx-rings" ref={rippleHost} aria-hidden="true" />
    </>
  )
}
