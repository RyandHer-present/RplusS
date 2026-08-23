import { useRef, useState } from 'react'
import { usePanic } from '../store/panic'
import { verifyPin } from '../lib/auth'
import './PanicScreen.css'

const KEYS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
]

/** The PIN is four digits; see supabase/functions/pin-login. */
const PIN_LENGTH = 4

const OPS: Record<string, (a: number, b: number) => number> = {
  '÷': (a, b) => a / b,
  '×': (a, b) => a * b,
  '−': (a, b) => a - b,
  '+': (a, b) => a + b,
}

/**
 * What is on screen when the app is hidden.
 *
 * It is a working calculator rather than a blank page on purpose: a screen that
 * does nothing when touched is more conspicuous than the app was. Someone can
 * pick this up and use it and find a calculator.
 */
export function PanicScreen() {
  const sealed = usePanic((s) => s.sealed)
  const unseal = usePanic((s) => s.unseal)

  const [shown, setShown] = useState('0')
  const [pending, setPending] = useState<{ value: number; op: string } | null>(null)
  const [fresh, setFresh] = useState(true)
  const [checking, setChecking] = useState(false)

  /*
   * Every digit actually pressed, which is not the same as what the display
   * shows. A calculator that showed "0412" while you typed it would not be a
   * calculator, so the display drops leading zeros exactly as it should — and
   * that made a PIN starting with 0 impossible to enter. This buffer keeps the
   * keystrokes, the display keeps pretending, and the PIN is checked against
   * what was typed.
   */
  const typed = useRef('')

  // The way back in when the page was reloaded while hidden: type the PIN and
  // press equals. Nothing on screen says so.
  const tryPin = async (candidate: string) => {
    setChecking(true)
    const result = await verifyPin(candidate)
    setChecking(false)
    if ('user' in result) {
      unseal()
      return true
    }
    return false
  }

  const press = (key: string) => {
    if (key === 'C') {
      typed.current = ''
      setShown('0')
      setPending(null)
      setFresh(true)
      return
    }

    if (key === '=') {
      // Only attempted at the real PIN length. Verification is rate limited to
      // eight tries, and spending one on every equals press would let ordinary
      // arithmetic lock the way back in.
      if (sealed && !checking && typed.current.length === PIN_LENGTH) {
        void tryPin(typed.current).then((ok) => {
          if (!ok) {
            typed.current = ''
            setShown('0')
            setFresh(true)
          }
        })
        return
      }
      if (pending) {
        const result = OPS[pending.op](pending.value, Number(shown))
        setShown(String(Number(result.toFixed(10))))
        setPending(null)
        setFresh(true)
      }
      return
    }

    if (key in OPS) {
      const current = Number(shown)
      const value = pending ? OPS[pending.op](pending.value, current) : current
      setShown(String(Number(value.toFixed(10))))
      setPending({ value, op: key })
      setFresh(true)
      return
    }

    if (key === '±') {
      setShown((s) => (s.startsWith('-') ? s.slice(1) : s === '0' ? s : `-${s}`))
      return
    }

    if (key === '%') {
      setShown((s) => String(Number(s) / 100))
      return
    }

    if (key === '.') {
      setShown((s) => (fresh ? '0.' : s.includes('.') ? s : `${s}.`))
      setFresh(false)
      return
    }

    typed.current = (typed.current + key).slice(-12)
    setShown((s) => (fresh || s === '0' ? key : s.length < 12 ? s + key : s))
    setFresh(false)
  }

  return (
    <div className="panic">
      <output className="panic-display">{shown}</output>
      <div className="panic-keys">
        {KEYS.map((row, i) => (
          <div className="panic-row" key={i}>
            {row.map((key) => (
              <button
                key={key}
                type="button"
                className={`panic-key ${key in OPS || key === '=' ? 'is-op' : ''} ${key === '0' ? 'is-wide' : ''}`}
                onClick={() => press(key)}
              >
                {key}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
