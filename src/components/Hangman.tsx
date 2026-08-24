import { useEffect, useState } from 'react'
import {
  MAX_MISSES,
  guessedOf,
  maskOf,
  missesOf,
  useHangman,
} from '../store/hangman'
import { USERS, other, useSession } from '../store/session'
import { haptic } from '../lib/haptics'
import './Hangman.css'

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

/** Drawn in the order they are lost, so the figure builds as the game goes. */
const PARTS = [
  <circle key="head" cx="60" cy="30" r="11" />,
  <line key="body" x1="60" y1="41" x2="60" y2="70" />,
  <line key="arm1" x1="60" y1="50" x2="46" y2="62" />,
  <line key="arm2" x1="60" y1="50" x2="74" y2="62" />,
  <line key="leg1" x1="60" y1="70" x2="48" y2="88" />,
  <line key="leg2" x1="60" y1="70" x2="72" y2="88" />,
]

export function Hangman() {
  const me = useSession((s) => s.user)
  const game = useHangman((s) => s.game)
  const status = useHangman((s) => s.status)
  const error = useHangman((s) => s.error)
  const load = useHangman((s) => s.load)
  const subscribe = useHangman((s) => s.subscribe)
  const start = useHangman((s) => s.start)
  const guess = useHangman((s) => s.guess)

  const [word, setWord] = useState('')

  useEffect(() => {
    void load()
    return subscribe()
  }, [load, subscribe])

  if (status === 'loading' && !game) return <p className="hm-hint">Loading…</p>

  const finished = Boolean(game?.winner)
  const iSetIt = game ? game.started_by === me : false
  const myTurn = game ? game.turn === me && !finished : false
  const mask = game ? maskOf(game.board) : ''
  const guessed = game ? guessedOf(game.board) : ''
  const misses = game ? missesOf(game.board) : []
  const lost = misses.length >= MAX_MISSES

  // Nothing running, or the last one is over: whoever is looking can set the
  // next word. The person who guessed last sets next, which falls out of the
  // fact that the setter never guesses.
  const canStart = !game || finished

  return (
    <div className="hm">
      {game && (
        <>
          <div className="hm-top">
            <svg className="hm-figure" viewBox="0 0 120 100" aria-hidden="true">
              <line x1="14" y1="95" x2="54" y2="95" />
              <line x1="30" y1="95" x2="30" y2="8" />
              <line x1="30" y1="8" x2="60" y2="8" />
              <line x1="60" y1="8" x2="60" y2="19" />
              <g className="hm-body">{PARTS.slice(0, misses.length)}</g>
            </svg>

            <div className="hm-state">
              <p className="hm-who">
                {finished
                  ? lost
                    ? `${USERS[game.started_by].name} won — nobody got it`
                    : `${USERS[game.turn].name} got it`
                  : iSetIt
                    ? `${USERS[other(game.started_by)].name} is guessing`
                    : myTurn
                      ? 'Your guess'
                      : 'Waiting'}
              </p>
              <p className="hm-misses">
                {misses.length} of {MAX_MISSES} wrong
                {misses.length > 0 && <span className="hm-wrong"> {misses.join(' ')}</span>}
              </p>
            </div>
          </div>

          <p className={`hm-word ${finished ? (lost ? 'is-lost' : 'is-won') : ''}`}>
            {[...mask].map((ch, i) => (
              <span key={i} className={`hm-slot ${ch === ' ' ? 'is-space' : ''}`}>
                {ch === '_' ? '' : ch}
              </span>
            ))}
          </p>

          {iSetIt && !finished && (
            <p className="hm-hint">You set this one — {USERS[game.turn].name} is guessing it.</p>
          )}

          {!finished && !iSetIt && (
            <div className="hm-keys">
              {ROWS.map((row) => (
                <div className="hm-row" key={row}>
                  {[...row].map((letter) => {
                    const used = guessed.includes(letter)
                    return (
                      <button
                        key={letter}
                        type="button"
                        className={`hm-key ${used ? (mask.includes(letter) ? 'is-hit' : 'is-miss') : ''}`}
                        disabled={used || !myTurn}
                        onClick={() => {
                          haptic('tap')
                          void guess(letter)
                        }}
                      >
                        {letter}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {canStart && me && (
        <form
          className="hm-new"
          onSubmit={(e) => {
            e.preventDefault()
            const value = word.trim()
            if (!value) return
            void start(value).then((ok) => {
              if (ok) setWord('')
            })
          }}
        >
          <label className="hm-label" htmlFor="hm-word">
            {game ? 'Set the next one' : `Set a word for ${USERS[other(me)].name}`}
          </label>
          <div className="hm-new-row">
            <input
              id="hm-word"
              className="hm-input"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="Letters and spaces"
              autoComplete="off"
              // Not a password field, but it should not be sitting in a
              // keyboard's suggestion strip either.
              autoCorrect="off"
              spellCheck={false}
              maxLength={40}
            />
            <button type="submit" className="hm-go" disabled={!word.trim()}>
              Set
            </button>
          </div>
          <p className="hm-hint">
            {USERS[other(me)].name} never sees it — the word is kept where no
            browser can read it, and the guesses are checked on the server.
          </p>
        </form>
      )}

      {error && <p className="hm-error">{error}</p>}
    </div>
  )
}
