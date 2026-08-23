import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { other, type UserId } from './session'

/*
 * Connect four.
 *
 * The board is one 42 character string, row-major, seven wide and six tall,
 * with a dot for empty and r or s for a disc. Keeping it as a single value
 * means a move is one atomic update and realtime carries the whole board, so
 * there is no way for the two of you to end up disagreeing about the state.
 *
 * Whose turn it is lives in the row rather than being inferred, because
 * inferring it from the disc count breaks the moment a game is restarted by
 * the person who did not go first last time.
 */

export const COLS = 7
export const ROWS = 6
const EMPTY = '.'.repeat(COLS * ROWS)

export type Disc = 'r' | 's'

export interface Game {
  id: string
  kind: string
  board: string
  turn: UserId
  winner: string | null
  moves: number
  started_by: UserId
  created_at: string
  updated_at: string
}

export const discFor = (user: UserId): Disc => (user === 'ry' ? 'r' : 's')
export const userFor = (disc: Disc): UserId => (disc === 'r' ? 'ry' : 'sarah')

export const at = (board: string, row: number, col: number) => board[row * COLS + col]

/** The row a disc would land in, or -1 when the column is full. */
export function landingRow(board: string, col: number): number {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (at(board, row, col) === EMPTY[0]) return row
  }
  return -1
}

/**
 * The four cells that win, or null.
 *
 * Returns the line itself rather than a boolean so the screen can light up the
 * discs that did it, which is most of the satisfaction of winning.
 */
export function winningLine(board: string): [number, number][] | null {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const disc = at(board, row, col)
      if (disc === '.') continue

      for (const [dr, dc] of directions) {
        const line: [number, number][] = [[row, col]]
        for (let step = 1; step < 4; step++) {
          const r = row + dr * step
          const c = col + dc * step
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break
          if (at(board, r, c) !== disc) break
          line.push([r, c])
        }
        if (line.length === 4) return line
      }
    }
  }
  return null
}

interface GameState {
  game: Game | null
  history: Game[]
  /** Games before this do not count toward the score. Null means all of them. */
  scoreResetAt: string | null
  status: 'idle' | 'loading' | 'ready'
  error: string | null

  load: () => Promise<void>
  resetScore: () => Promise<void>
  start: (me: UserId) => Promise<void>
  drop: (col: number, me: UserId) => Promise<void>
  subscribe: () => () => void
}

export const useGame = create<GameState>()((set, get) => ({
  game: null,
  history: [],
  scoreResetAt: null,
  status: 'idle',
  error: null,

  load: async () => {
    if (!supabase) return
    set({ status: 'loading' })

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('kind', 'connect4')
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) {
      set({ status: 'ready', error: error.message })
      return
    }

    const games = (data ?? []) as Game[]

    const { data: settings } = await supabase
      .from('game_settings')
      .select('score_reset_at')
      .eq('id', 1)
      .maybeSingle()

    set({
      game: games[0] ?? null,
      history: games,
      scoreResetAt: (settings as { score_reset_at: string | null } | null)?.score_reset_at ?? null,
      status: 'ready',
      error: null,
    })
  },

  /**
   * Puts the score back to nothing without touching a single game.
   *
   * Admin only, enforced by the update policy rather than by hiding the
   * button — the button is hidden too, but that is presentation.
   */
  resetScore: async () => {
    if (!supabase) return
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('game_settings')
      .update({ score_reset_at: now, reset_by: 'admin', reset_at: now })
      .eq('id', 1)

    if (error) set({ error: error.message })
    else await get().load()
  },

  start: async (me) => {
    if (!supabase) return

    // Whoever asks for a new game gives the first move to the other person,
    // which keeps a rematch from handing the same advantage back and forth.
    const { error } = await supabase.from('games').insert({
      kind: 'connect4',
      board: EMPTY,
      turn: other(me),
      started_by: me,
    })

    if (error) set({ error: error.message })
    else await get().load()
  },

  drop: async (col, me) => {
    if (!supabase) return
    const game = get().game
    if (!game || game.winner || game.turn !== me) return

    const row = landingRow(game.board, col)
    if (row < 0) return

    const index = row * COLS + col
    const board = game.board.slice(0, index) + discFor(me) + game.board.slice(index + 1)
    const moves = game.moves + 1

    const won = winningLine(board) !== null
    const winner = won ? me : moves === COLS * ROWS ? 'draw' : null

    // Applied locally first so the disc lands the instant it is tapped.
    set({ game: { ...game, board, moves, winner, turn: other(me) } })

    const { error } = await supabase
      .from('games')
      .update({ board, moves, winner, turn: other(me), updated_at: new Date().toISOString() })
      .eq('id', game.id)
      // Refuses the write if the other screen already moved, rather than
      // overwriting it — the reload that follows shows the real board.
      .eq('moves', game.moves)

    if (error) {
      set({ game })
      await get().load()
    }
  },

  subscribe: () => {
    if (!supabase) return () => {}

    const channel = supabase
      .channel('db-games')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => {
        void get().load()
      })
      .subscribe()

    return () => {
      void supabase!.removeChannel(channel)
    }
  },
}))

/**
 * Wins each, ignoring games still in progress and anything played before the
 * score was last reset.
 */
export function tally(history: Game[], since: string | null = null) {
  const counted = since ? history.filter((g) => g.created_at > since) : history
  return counted.reduce(
    (acc, g) => {
      if (g.winner === 'ry') acc.ry++
      else if (g.winner === 'sarah') acc.sarah++
      else if (g.winner === 'draw') acc.draws++
      return acc
    },
    { ry: 0, sarah: 0, draws: 0 },
  )
}
