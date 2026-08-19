import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { AuroraBackground } from '../components/AuroraBackground'
import { verifyPin, authConfigured } from '../lib/auth'
import { useSession } from '../store/session'
import { haptic } from '../lib/haptics'
import { sfx } from '../lib/sound'
import './Lock.css'

const PIN_LENGTH = 4
const BACKSPACE = 'back'
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', BACKSPACE]

/**
 * Drawn rather than typed. The `⌫` character renders as a blank box in the
 * rounded system font on iOS, which made the key look broken.
 */
function BackspaceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5h10.5a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H9L3 12z" />
      <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
    </svg>
  )
}

export default function Lock() {
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [adminMode, setAdminMode] = useState(false)
  const signIn = useSession((s) => s.signIn)

  const root = useRef<HTMLDivElement>(null)
  const dotsRef = useRef<HTMLDivElement>(null)
  const busy = useRef(false)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.lock-mark', { y: 26, opacity: 0, duration: 0.9 })
        .from('.lock-names', { y: 12, opacity: 0, duration: 0.6 }, '-=0.55')
        .from('.lock-dot', { scale: 0, opacity: 0, duration: 0.5, stagger: 0.06, ease: 'back.out(2)' }, '-=0.4')
        .from('.key', { y: 18, opacity: 0, scale: 0.85, duration: 0.45, stagger: 0.025 }, '-=0.35')
    }, root)
    return () => ctx.revert()
  }, [])

  const reject = useCallback((text: string) => {
    haptic('error')
    sfx.reject()
    setStatus('error')
    setMessage(text)
    gsap.fromTo(
      dotsRef.current,
      { x: 0 },
      { x: 0, keyframes: { x: [-12, 11, -8, 6, -3, 0] }, duration: 0.55, ease: 'power2.out' },
    )
    window.setTimeout(() => {
      setPin('')
      setStatus('idle')
      busy.current = false
    }, 560)
  }, [])

  const submit = useCallback(
    async (value: string) => {
      busy.current = true
      setStatus('checking')
      const result = await verifyPin(value)

      // The corner is not decoration: an admin PIN typed on the normal screen
      // is refused, and a personal PIN typed on the admin screen likewise.
      if ('user' in result && (result.user === 'admin') !== adminMode) {
        reject('Wrong PIN')
        return
      }

      if ('user' in result) {
        haptic('success')
        sfx.unlock()
        setStatus('idle')
        setMessage('')

        // Let the last dot land, then lift the whole screen away.
        gsap.to(root.current, {
          opacity: 0,
          scale: 1.06,
          filter: 'blur(6px)',
          duration: 0.5,
          ease: 'power2.in',
          onComplete: () => signIn(result.user),
        })
        return
      }

      reject(result.error)
    },
    [signIn, adminMode, reject],
  )

  const press = useCallback(
    (key: string) => {
      if (busy.current) return

      if (key === BACKSPACE) {
        setPin((p) => {
          if (!p.length) return p
          haptic('tap')
          sfx.back()
          return p.slice(0, -1)
        })
        setMessage('')
        return
      }
      if (!/^\d$/.test(key)) return

      setMessage('')
      setPin((p) => {
        if (p.length >= PIN_LENGTH) return p
        haptic('select')
        // Pitch climbs with each digit, so entry sounds like progress.
        sfx.key(p.length)
        const next = p + key
        if (next.length === PIN_LENGTH) void submit(next)
        return next
      })
    },
    [submit],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') press(BACKSPACE)
      else if (/^\d$/.test(e.key)) press(e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press])

  return (
    <div className={`lock ${adminMode ? 'is-admin' : ''}`} ref={root}>
      <AuroraBackground className="lock-bg" />
      <div className="lock-veil" aria-hidden="true" />

      {/* Deliberately unlabelled. Tapping it again returns to the normal screen. */}
      <button
        type="button"
        className="lock-corner"
        aria-label={adminMode ? 'Leave admin sign-in' : 'Admin sign-in'}
        onClick={() => {
          haptic('tap')
          sfx.tab()
          setPin('')
          setMessage('')
          setAdminMode((on) => !on)
        }}
      />

      <div className="lock-inner">
        <header className="lock-head">
          <h1 className="lock-mark">
            R<span>+</span>S
          </h1>
          <p className="lock-names">{adminMode ? 'Admin' : 'Enter your PIN'}</p>
        </header>

        <div className="lock-entry">
          <div
            className={`lock-dots ${status === 'error' ? 'is-error' : ''} ${
              status === 'checking' ? 'is-checking' : ''
            }`}
            ref={dotsRef}
            role="status"
            aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span key={i} className={`lock-dot ${i < pin.length ? 'is-filled' : ''}`}>
                <span className="lock-dot-core" />
              </span>
            ))}
          </div>
          <p className={`lock-msg ${message ? 'is-shown' : ''}`}>
            {message || (status === 'checking' ? 'Checking…' : ' ')}
          </p>
        </div>

        <div className="keypad">
          {KEYS.map((key, i) =>
            key === '' ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                className={`key ${key === BACKSPACE ? 'is-back' : ''}`}
                type="button"
                onPointerDown={(e) => {
                  // Fires on touch-down rather than click, so the response
                  // lands under your finger instead of after you lift it.
                  e.preventDefault()
                  press(key)
                }}
                aria-label={key === BACKSPACE ? 'Delete' : key}
              >
                <span className="key-ink" aria-hidden="true" />
                <span className="key-face">{key === BACKSPACE ? <BackspaceIcon /> : key}</span>
              </button>
            ),
          )}
        </div>

        {!authConfigured && <p className="lock-note">Not connected to the server yet</p>}
      </div>
    </div>
  )
}
