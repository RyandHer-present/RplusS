import { usePanic } from '../store/panic'

const HOLD_MS = 550

/**
 * How the app gets hidden.
 *
 * Nothing on screen advertises this, which was the requirement — so the
 * gesture has to be one you would never make by accident and never make on
 * purpose for another reason:
 *
 *   phone — three fingers down at once, held for half a second
 *   desktop — Escape twice inside 400ms
 *
 * Three fingers rather than two: two is a pinch on the way to zooming a photo,
 * and this must not fire while someone is looking at the gallery.
 */
export function installPanicGesture(): () => void {
  let timer: number | undefined
  let lastEscape = 0

  const cancel = () => {
    window.clearTimeout(timer)
    timer = undefined
  }

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 3) {
      cancel()
      return
    }
    cancel()
    timer = window.setTimeout(() => {
      timer = undefined
      const { hidden, sealed, hide, reveal } = usePanic.getState()
      if (!hidden) hide()
      else if (!sealed) reveal()
    }, HOLD_MS)
  }

  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 3) cancel()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    const now = Date.now()
    if (now - lastEscape < 400) {
      lastEscape = 0
      const { hidden, sealed, hide, reveal } = usePanic.getState()
      if (!hidden) hide()
      else if (!sealed) reveal()
    } else {
      lastEscape = now
    }
  }

  // Passive: this only ever observes, and a non-passive touch listener on the
  // document would make every scroll in the app fractionally worse.
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', onTouchEnd, { passive: true })
  window.addEventListener('keydown', onKeyDown)

  return () => {
    cancel()
    document.removeEventListener('touchstart', onTouchStart)
    document.removeEventListener('touchend', onTouchEnd)
    document.removeEventListener('touchcancel', onTouchEnd)
    window.removeEventListener('keydown', onKeyDown)
  }
}
