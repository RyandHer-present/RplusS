import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { AuroraBackground } from '../components/AuroraBackground'
import { verifyPin, authConfigured } from '../lib/auth'
import { useSession } from '../store/session'
import { haptic } from '../lib/haptics'
import './Lock.css'

const PIN_LENGTH = 4
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

export default function Lock() {
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const signIn = useSession((s) => s.signIn)

  const root = useRef<HTMLDivElement>(null)
  const dotsRef = useRef<HTMLDivElement>(null)
  // Guards against a second submit firing while the first is still in flight.
  const busy = useRef(false)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.lock-mark', { y: 20, opacity: 0, duration: 0.8 })
        .from('.lock-names', { y: 12, opacity: 0, duration: 0.6 }, '-=0.5')
        .from('.lock-dot', { scale: 0, opacity: 0, duration: 0.45, stagger: 0.05 }, '-=0.35')
        .from('.key', { y: 14, opacity: 0, duration: 0.4, stagger: 0.02 }, '-=0.3')
    }, root)
    return () => ctx.revert()
  }, [])

  const submit = useCallback(
    async (value: string) => {
      busy.current = true
      setStatus('checking')
      const result = await verifyPin(value)

      if ('user' in result) {
        haptic('success')
        setStatus('idle')
        setMessage('')
        // Let the fill animation land before the screen leaves.
        gsap.to(root.current, {
          opacity: 0,
          scale: 1.04,
          duration: 0.45,
          ease: 'power2.in',
          onComplete: () => signIn(result.user),
        })
        return
      }

      haptic('error')
      setStatus('error')
      setMessage(result.error)
      gsap.fromTo(
        dotsRef.current,
        { x: 0 },
        { x: 0, keyframes: { x: [-10, 9, -7, 5, -3, 0] }, duration: 0.5, ease: 'power2.out' },
      )
      window.setTimeout(() => {
        setPin('')
        setStatus('idle')
        busy.current = false
      }, 520)
    },
    [signIn],
  )

  const press = useCallback(
    (key: string) => {
      if (busy.current) return

      if (key === '⌫') {
        haptic('tap')
        setPin((p) => p.slice(0, -1))
        setMessage('')
        return
      }
      if (!/^\d$/.test(key)) return

      haptic('select')
      setMessage('')
      setPin((p) => {
        if (p.length >= PIN_LENGTH) return p
        const next = p + key
        if (next.length === PIN_LENGTH) void submit(next)
        return next
      })
    },
    [submit],
  )

  // Physical keyboard, for desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') press('⌫')
      else if (/^\d$/.test(e.key)) press(e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press])

  return (
    <div className="lock" ref={root}>
      <AuroraBackground className="lock-bg" />

      <div className="lock-inner">
        <header className="lock-head">
          <h1 className="lock-mark">
            R<span>+</span>S
          </h1>
          <p className="lock-names">Enter your PIN</p>
        </header>

        <div className="lock-entry">
          <div
            className={`lock-dots ${status === 'error' ? 'is-error' : ''}`}
            ref={dotsRef}
            role="status"
            aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span key={i} className={`lock-dot ${i < pin.length ? 'is-filled' : ''}`} />
            ))}
          </div>
          <p className={`lock-msg ${message ? 'is-shown' : ''}`}>
            {message || (status === 'checking' ? 'Checking…' : ' ')}
          </p>
        </div>

        <div className="keypad">
          {KEYS.map((key, i) =>
            key === '' ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                className="key"
                type="button"
                onClick={() => press(key)}
                aria-label={key === '⌫' ? 'Delete' : key}
              >
                {key}
              </button>
            ),
          )}
        </div>

        {!authConfigured && (
          <p className="lock-note">Not connected to the server yet — Phase 2</p>
        )}
      </div>
    </div>
  )
}
