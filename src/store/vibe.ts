import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { isVibeId, type VibeId } from '../theme/vibes'
import type { UserId } from './session'

/*
 * The shared vibe.
 *
 * One row in the database, watched by both of you. Setting it is deliberately
 * not a personal preference — the other person's screen changes too, which is
 * the point, and is why this is a table rather than local storage.
 */

interface VibeState {
  vibe: VibeId | null
  setBy: UserId | null
  setAt: string | null

  load: () => Promise<void>
  set: (vibe: VibeId | null, me: UserId) => Promise<void>
  subscribe: () => () => void
}

interface Row {
  name: string | null
  set_by: UserId | null
  set_at: string | null
}

function adopt(row: Row | null | undefined) {
  return {
    vibe: isVibeId(row?.name) ? row.name : null,
    setBy: row?.set_by ?? null,
    setAt: row?.set_at ?? null,
  }
}

export const useVibe = create<VibeState>()((set, get) => ({
  vibe: null,
  setBy: null,
  setAt: null,

  load: async () => {
    if (!supabase) return
    const { data } = await supabase.from('vibe').select('name, set_by, set_at').eq('id', 1).maybeSingle()
    set(adopt(data as Row | null))
  },

  set: async (vibe, me) => {
    if (!supabase) return

    // Applied here first: the person choosing should see it immediately, and
    // the round trip only matters for the other screen.
    const previous = { vibe: get().vibe, setBy: get().setBy, setAt: get().setAt }
    set({ vibe, setBy: me, setAt: new Date().toISOString() })

    const { error } = await supabase
      .from('vibe')
      .update({ name: vibe, set_by: me, set_at: new Date().toISOString() })
      .eq('id', 1)

    if (error) set(previous)
  },

  subscribe: () => {
    if (!supabase) return () => {}

    const channel = supabase
      .channel('db-vibe')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vibe' }, ({ new: row }) => {
        set(adopt(row as Row))
      })
      .subscribe()

    return () => {
      void supabase!.removeChannel(channel)
    }
  },
}))
