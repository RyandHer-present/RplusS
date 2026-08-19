import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { computeStreak, localDay } from '../lib/streak'
import type { Fit } from '../lib/types'
import type { UserId } from './session'

interface FitsState {
  fits: Fit[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  load: () => Promise<void>
  remove: (id: string) => Promise<void>
  subscribe: () => () => void
}

export const useFits = create<FitsState>()((set, get) => ({
  fits: [],
  status: 'idle',

  load: async () => {
    if (!supabase) return
    set({ status: 'loading' })

    const { data, error } = await supabase
      .from('fits')
      .select('*, media(*)')
      .order('day', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      set({ status: 'error' })
      return
    }
    set({ fits: (data ?? []) as Fit[], status: 'ready' })
  },

  remove: async (id) => {
    if (!supabase) return
    const previous = get().fits
    set({ fits: previous.filter((f) => f.id !== id) })

    const { error } = await supabase.from('fits').delete().eq('id', id)
    if (error) set({ fits: previous })
  },

  subscribe: () => {
    if (!supabase) return () => {}

    const channel = supabase
      .channel('db-fits')
      // The realtime payload carries only the fits row, not its joined media,
      // so a refetch is the cheapest way to stay correct here. These arrive at
      // most a couple of times a day.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fits' }, () => {
        void get().load()
      })
      .subscribe()

    return () => {
      void supabase!.removeChannel(channel)
    }
  },
}))

/** Consecutive days this person has posted, ending today or yesterday. */
export function streakFor(fits: Fit[], user: UserId): number {
  return computeStreak(fits.filter((f) => f.author_id === user).map((f) => f.day))
}

export function postedToday(fits: Fit[], user: UserId): boolean {
  const today = localDay()
  return fits.some((f) => f.author_id === user && f.day === today)
}
