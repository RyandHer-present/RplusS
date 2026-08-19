import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { UserId } from './session'

/** The text is deliberately absent: it is not readable until unlock time. */
export interface Capsule {
  id: string
  author_id: UserId
  media_id: string | null
  unlock_at: string
  opened_at: string | null
  created_at: string
}

const FIELDS = 'id, author_id, media_id, unlock_at, opened_at, created_at'

interface CapsulesState {
  capsules: Capsule[]
  opened: Record<string, string>
  saving: boolean
  error: string | null

  load: () => Promise<void>
  create: (body: string, unlockAt: string, me: UserId) => Promise<void>
  open: (id: string) => Promise<string | null>
  remove: (id: string) => Promise<void>
}

export const useCapsules = create<CapsulesState>()((set, get) => ({
  capsules: [],
  opened: {},
  saving: false,
  error: null,

  load: async () => {
    if (!supabase) return
    // Selecting * would fail: `body` is not granted to anyone.
    const { data } = await supabase.from('capsules').select(FIELDS).order('unlock_at', { ascending: true })
    set({ capsules: (data ?? []) as Capsule[] })
  },

  create: async (body, unlockAt, me) => {
    if (!supabase || !body.trim()) return
    set({ saving: true, error: null })

    const { error } = await supabase
      .from('capsules')
      .insert({ author_id: me, body: body.trim(), unlock_at: unlockAt })
      .select(FIELDS)

    if (error) set({ error: error.message })
    else await get().load()
    set({ saving: false })
  },

  open: async (id) => {
    if (!supabase) return null
    const cached = get().opened[id]
    if (cached) return cached

    // The clock check lives in the function, not here.
    const { data, error } = await supabase.rpc('open_capsule', { capsule_id: id })
    if (error) return null

    const text = data as string
    set((s) => ({ opened: { ...s.opened, [id]: text } }))
    void supabase.from('capsules').update({ opened_at: new Date().toISOString() }).eq('id', id).is('opened_at', null)
    return text
  },

  remove: async (id) => {
    if (!supabase) return
    const previous = get().capsules
    set({ capsules: previous.filter((c) => c.id !== id) })
    const { error } = await supabase.from('capsules').delete().eq('id', id)
    if (error) set({ capsules: previous })
  },
}))

/** "in 3 days", "in 4h", or null once the moment has passed. */
export function untilLabel(iso: string): string | null {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return null

  const mins = Math.round(ms / 60000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `in ${hours}h`
  const days = Math.round(hours / 24)
  if (days < 31) return `in ${days} day${days === 1 ? '' : 's'}`
  return `in ${Math.round(days / 30)} months`
}
