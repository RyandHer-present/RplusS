import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import gsap from 'gsap'
import { TABS, TabBar } from './TabBar'
import { Atmosphere } from './Atmosphere'
import { PointerFx } from './PointerFx'
import { AuroraBackground } from './AuroraBackground'
import { useUnread } from '../store/unread'
import { useSession } from '../store/session'
import { useVisuals } from '../store/visuals'
import { haptic } from '../lib/haptics'
import './Shell.css'

const SWIPE_DISTANCE = 60 // px before a swipe counts
const DIRECTION_LOCK = 12 // px before we decide horizontal vs vertical

function tabIndex(pathname: string) {
  return TABS.findIndex((t) => pathname.startsWith(t.to))
}

/** Drives the per-section palette shift. Falls back to the theme's own accent. */
function sectionName(pathname: string) {
  return TABS.find((t) => pathname.startsWith(t.to))?.to.slice(1) ?? 'you'
}

export function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const shellRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const prevIndex = useRef(tabIndex(location.pathname))
  const appShader = useVisuals((s) => s.enabled.appShader)
  const parallax = useVisuals((s) => s.enabled.parallax)
  const me = useSession((s) => s.user)
  const loadUnread = useUnread((s) => s.load)
  const subscribeUnread = useUnread((s) => s.subscribe)
  const markSeen = useUnread((s) => s.markSeen)

  useEffect(() => {
    if (!me) return
    void loadUnread(me)
    return subscribeUnread(me)
  }, [me, loadUnread, subscribeUnread])

  // Arriving at a section clears its dot.
  useEffect(() => {
    const tab = TABS.find((t) => location.pathname.startsWith(t.to))
    if (tab) markSeen(tab.to)
  }, [location.pathname, markSeen])

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

  // How far the current screen has scrolled, published as a 0..1 custom
  // property for the background layers to parallax against. Written straight to
  // the DOM — putting scroll position in React state would re-render the whole
  // app on every frame of a flick.
  //
  // Only the plain `.screen-scroll` sections take part. Chat scrolls through
  // Virtuoso and sits at the bottom of a long list, so it would peg the value
  // at 1 the moment it mounted and the effect would read as broken.
  useEffect(() => {
    if (!parallax) return
    const shell = shellRef.current
    const pane = paneRef.current
    if (!shell || !pane) return

    let queued = false
    let value = 0

    // A new section starts at the top; without this the layers stay parked
    // wherever the previous screen had pushed them.
    shell.style.setProperty('--scroll', '0')

    const paint = () => {
      queued = false
      shell.style.setProperty('--scroll', value.toFixed(4))
    }

    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement
      if (!el.classList?.contains('screen-scroll')) return
      // Saturates at 240px: past that the effect has said everything it has to.
      value = Math.min(el.scrollTop / 240, 1)
      if (!queued) {
        queued = true
        requestAnimationFrame(paint)
      }
    }

    // Scroll does not bubble, so the listener has to run in the capture phase
    // to see it from an ancestor.
    pane.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      pane.removeEventListener('scroll', onScroll, { capture: true })
      shell.style.removeProperty('--scroll')
    }
  }, [parallax, location.pathname])

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
    <div className="shell" ref={shellRef} data-section={sectionName(location.pathname)}>
      {/* The same shader the lock screen runs, dialled right down and pushed
          behind everything. One fullscreen triangle at capped DPR. */}
      {appShader && <AuroraBackground className="shell-shader" intensity={0.5} />}
      {/* Slow-drifting colour behind every screen. Pure CSS gradients on one
          composited layer, so it costs nothing per frame. */}
      <div className="shell-ambient" aria-hidden="true" />
      <Atmosphere />
      <div className="shell-pane" ref={paneRef}>
        <Outlet />
      </div>
      <TabBar />
      <PointerFx />
    </div>
  )
}
