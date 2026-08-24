import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { UserId } from './session'

/*
 * Hangman.
 *
 * The word itself never arrives here. The database holds it in a table nothing
 * can read and does the letter checking, sending back only what has been
 * revealed — so the guesser's browser genuinely does not contain the answer,
 * rather than merely not displaying it.
 *
 * `board` arrives as "MASKED|GUESSED", for example "E_E___NT|EAOTX".
 */

export const MAX_MISSES = 6

export interface HangmanGame {
  id: string
  board: string
  turn: UserId
  winner: string | null
  moves: number
  started_by: UserId
  created_at: string
  updated_at: string
}

export const maskOf = (board: string) => board.split('|')[0] ?? ''
export const guessedOf = (board: string) => board.split('|')[1] ?? ''

/** A guessed letter that never appeared in the mask was wrong. */
export const missesOf = (board: string): string[] =>
  [...guessedOf(board)].filter((letter) => !maskOf(board).includes(letter))

export const solved = (board: string) => !maskOf(board).includes('_')

interface HangmanState {
  game: HangmanGame | null
  status: 'idle' | 'loading' | 'ready'
  error: string | null

  load: () => Promise<void>
  subscribe: () => () => void
  start: (word: string) => Promise<boolean>
  guess: (letter: string) => Promise<void>
}

export const useHangman = create<HangmanState>()((set, get) => ({
  game: null,
  status: 'idle',
  error: null,

  load: async () => {
    if (!supabase) return
    set({ status: 'loading' })
    const { data } = await supabase
      .from('games')
      .select('*')
      .eq('kind', 'hangman')
      .order('created_at', { ascending: false })
      .limit(1)
    set({ game: (data?.[0] as HangmanGame) ?? null, status: 'ready' })
  },

  subscribe: () => {
    if (!supabase) return () => {}
    const channel = supabase
      .channel('db-hangman')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => {
        void get().load()
      })
      .subscribe()
    return () => {
      void supabase!.removeChannel(channel)
    }
  },

  start: async (word) => {
    if (!supabase) return false
    set({ error: null })
    // Set through a function rather than an insert, so the word goes straight
    // into the table this client can never read back.
    const { error } = await supabase.rpc('hangman_new', { p_word: word })
    if (error) {
      set({
        error: /short/.test(error.message)
          ? 'Needs at least two letters.'
          : /long/.test(error.message)
            ? 'That is too long.'
            : 'Could not start that one.',
      })
      return false
    }
    await get().load()
    return true
  },

  guess: async (letter) => {
    if (!supabase) return
    const game = get().game
    if (!game || game.winner) return

    const { error } = await supabase.rpc('hangman_guess', { p_game: game.id, p_letter: letter })
    // The realtime update is the source of truth; this only matters when it is
    // slow or the guess was refused.
    if (error) set({ error: 'That guess did not count.' })
    await get().load()
  },
}))
