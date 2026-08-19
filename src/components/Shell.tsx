import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import gsap from 'gsap'
import { TABS, TabBar } from './TabBar'
import { haptic } from '../lib/haptics'
import './Shell.css'

const SWIPE_DISTANCE = 60 // px before a swipe counts
const DIRECTION_LOCK = 12 // px before we decide horizontal vs vertical

function tabIndex(pathname: string) {
  return TABS.findIndex((t) => pathname.startsWith(t.to))
}

export function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const paneRef = useRef<HTMLDivElement>(null)
  const prevIndex = useRef(tabIndex(location.pathname))

  // Slide the incoming screen in from whichever side it lives on, so movement
  // through the app matches the tab order.
  useEffect(() => {
    const index = tabIndex(location.pathname)
    const direction = index > prevIndex.current ? 1 : index < prevIndex.current ? -1 : 0
    prevIndex.current = index

    const pane = paneRef.current
    if (!pane) return

    gsap.fromTo(
      pane,
      { x: direction * 26, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.34, ease: 'power3.out', clearProps: 'transform' },
    )
  }, [location.pathname])

  // Swipe between sections.
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return

    let startX = 0
    let startY = 0
    let axis: 'x' | 'y' | null = null
    let tracking = false

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      // Anything that scrolls sideways on its own opts out via this attribute.
      if ((e.target as HTMLElement).closest('[data-no-swipe]')) return
      tracking = true
      axis = null
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking || axis === 'y') return
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY

      if (!axis) {
        if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return
        // Vertical wins ties — scrolling must never feel hijacked.
        axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
      }
    }

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      if (axis !== 'x') return

      const dx = e.changedTouches[0].clientX - startX
      if (Math.abs(dx) < SWIPE_DISTANCE) return

      const current = tabIndex(location.pathname)
      const next = dx < 0 ? current + 1 : current - 1
      if (next < 0 || next >= TABS.length || current === -1) return

      haptic('select')
      navigate(TABS[next].to)
    }

    pane.addEventListener('touchstart', onStart, { passive: true })
    pane.addEventListener('touchmove', onMove, { passive: true })
    pane.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      pane.removeEventListener('touchstart', onStart)
      pane.removeEventListener('touchmove', onMove)
      pane.removeEventListener('touchend', onEnd)
    }
  }, [location.pathname, navigate])

  return (
    <div className="shell">
      {/* Slow-drifting colour behind every screen. Pure CSS gradients on one
          composited layer, so it costs nothing per frame. */}
      <div className="shell-ambient" aria-hidden="true" />
      <div className="shell-pane" ref={paneRef}>
        <Outlet />
      </div>
      <TabBar />
    </div>
  )
}
