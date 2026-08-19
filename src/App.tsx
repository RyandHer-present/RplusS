import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import './App.css'

/**
 * Phase 1 holding screen. Its only job is to prove the whole pipeline works
 * end to end — build, deploy, and correct rendering on a real phone.
 * The real shell and lock screen land in Phase 3.
 */
export default function App() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.mark', { y: 24, opacity: 0, duration: 0.9 })
        .from('.sub', { y: 12, opacity: 0, duration: 0.7 }, '-=0.55')
        .from('.dot', { scale: 0, opacity: 0, duration: 0.5, stagger: 0.08 }, '-=0.4')
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <div className="screen" ref={root}>
      <div className="aurora" aria-hidden="true" />
      <main className="center">
        <h1 className="mark">R<span>+</span>S</h1>
        <p className="sub">under construction</p>
        <div className="dots" aria-hidden="true">
          <i className="dot" /><i className="dot" /><i className="dot" />
        </div>
      </main>
    </div>
  )
}
