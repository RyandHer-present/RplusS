import { useEffect, useMemo } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import {
  COLS,
  ROWS,
  at,
  landingRow,
  tally,
  useGame,
  userFor,
  winningLine,
  type Disc,
} from '../store/game'
import { USERS, other, useSession } from '../store/session'
import { haptic } from '../lib/haptics'
import './Play.css'

export default function Play() {
  const me = useSession((s) => s.user)
  const isAdmin = useSession((s) => s.isAdmin)

  const game = useGame((s) => s.game)
  const history = useGame((s) => s.history)
  const status = useGame((s) => s.status)
  const load = useGame((s) => s.load)
  const subscribe = useGame((s) => s.subscribe)
  const start = useGame((s) => s.start)
  const drop = useGame((s) => s.drop)
  const scoreResetAt = useGame((s) => s.scoreResetAt)
  const resetScore = useGame((s) => s.resetScore)

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => subscribe(), [subscribe])

  const line = useMemo(() => (game ? winningLine(game.board) : null), [game])
  const won = useMemo(
    () => new Set((line ?? []).map(([r, c]) => `${r}-${c}`)),
    [line],
  )
  const score = useMemo(() => tally(history, scoreResetAt), [history, scoreResetAt])

  const mine = Boolean(game && !game.winner && game.turn === me)

  const play = (col: number) => {
    if (!me || !game || !mine) return
    if (landingRow(game.board, col) < 0) return
    haptic('send')
    void drop(col, me)
  }

  const newGame = () => {
    if (!me) return
    haptic('select')
    void start(me)
  }

  return (
    <div className="screen-scroll">
      <ScreenHeader
        title="Play"
        sub={`${score.ry}–${score.sarah}${score.draws ? ` · ${score.draws} drawn` : ''}`}
      />

      <div className="play-score">
        {(['ry', 'sarah'] as const).map((user) => (
          <div key={user} className={`play-player is-${user === 'ry' ? 'r' : 's'}`}>
            <span className="play-chip" aria-hidden="true" />
            <span className="play-player-name">{USERS[user].name}</span>
            <span className="play-player-wins">{score[user]}</span>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="play-admin">
          <button
            type="button"
            className="play-reset"
            onClick={() => {
              haptic('error')
              void resetScore()
            }}
          >
            Reset score to 0 – 0
          </button>
          <p className="play-admin-note">
            Clears the counter for both of you. The games themselves are kept.
          </p>
        </div>
      )}

      {status === 'loading' && !game && <p className="play-empty">Loading…</p>}

      {status === 'ready' && !game && (
        <div className="play-none">
          <p>No game yet.</p>
          <button type="button" className="play-start" onClick={newGame}>
            Start one
          </button>
        </div>
      )}

      {game && (
        <>
          <p className={`play-turn ${mine ? 'is-yours' : ''}`}>
            {game.winner === 'draw'
              ? 'A draw.'
              : game.winner
                ? `${USERS[game.winner as 'ry' | 'sarah']?.name ?? game.winner} won.`
                : mine
                  ? 'Your go.'
                  : `Waiting on ${USERS[other(me ?? 'ry')].name}.`}
          </p>

          <div className={`play-board ${mine ? 'is-active' : ''}`}>
            {Array.from({ length: COLS }, (_, col) => {
              const full = landingRow(game.board, col) < 0
              return (
                <button
                  key={col}
                  type="button"
                  className="play-col"
                  disabled={!mine || full || Boolean(game.winner)}
                  onClick={() => play(col)}
                  aria-label={`Column ${col + 1}`}
                >
                  {Array.from({ length: ROWS }, (_, row) => {
                    const cell = at(game.board, row, col)
                    const key = `${row}-${col}`
                    const filled = cell !== '.'
                    return (
                      <span
                        key={key}
                        className={[
                          'play-cell',
                          filled ? `is-${cell}` : '',
                          won.has(key) ? 'is-won' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {filled && (
                          <span className="play-disc" title={USERS[userFor(cell as Disc)].name} />
                        )}
                      </span>
                    )
                  })}
                </button>
              )
            })}
          </div>

          {game.winner && (
            <button type="button" className="play-start" onClick={newGame}>
              Play again
            </button>
          )}

          {!game.winner && (
            <button type="button" className="play-restart" onClick={newGame}>
              Start over
            </button>
          )}
        </>
      )}

      <p className="play-note">
        One board, shared. Their move appears here the moment they make it —
        neither of you has to be here at the same time.
      </p>
    </div>
  )
}
