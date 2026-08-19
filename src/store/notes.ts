import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { UserId } from './session'

export interface Note {
  id: string
  author_id: UserId
  title: string | null
  body: string
  color: string | null
  pinned: boolean
  created_at: string
  updated_at: string
}

export const NOTE_COLORS = ['a1', 'a2', 'a3', 'amber', 'green'] as const
export type NoteColor = (typeof NOTE_COLORS)[number]

interface NotesState {
  notes: Note[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  saving: boolean
  error: string | null

  load: () => Promise<void>
  create: (draft: { title: string; body: string; color: NoteColor }, me: UserId) => Promise<void>
  update: (id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'color'>>) => Promise<void>
  togglePin: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  subscribe: () => () => void
}

export const useNotes = create<NotesState>()((set, get) => ({
  notes: [],
  status: 'idle',
  saving: false,
  error: null,

  load: async () => {
    if (!supabase) return
    set({ status: 'loading' })

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      set({ status: 'error', error: error.message })
      return
    }
    set({ notes: (data ?? []) as Note[], status: 'ready' })
  },

  create: async ({ title, body, color }, me) => {
    if (!supabase || !body.trim()) return
    set({ saving: true, error: null })

    const { data, error } = await supabase
      .from('notes')
      .insert({
        author_id: me,
        title: title.trim() || null,
        body: body.trim(),
        color,
      })
      .select()
      .single()

    if (error || !data) {
      set({ saving: false, error: error?.message ?? 'Could not save' })
      return
    }
    set((s) => ({ notes: [data as Note, ...s.notes], saving: false }))
  },

  update: async (id, patch) => {
    if (!supabase) return
    const previous = get().notes
    const now = new Date().toISOString()

    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch, updated_at: now } : n)),
      saving: true,
    }))

    const { error } = await supabase
      .from('notes')
      .update({ ...patch, updated_at: now })
      .eq('id', id)

    // The database refuses edits to someone else's note; restore if so.
    set({ saving: false, ...(error ? { notes: previous, error: error.message } : {}) })
  },

  togglePin: async (id) => {
    if (!supabase) return
    const note = get().notes.find((n) => n.id === id)
    if (!note) return

    const pinned = !note.pinned
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, pinned } : n)) }))
    await supabase.from('notes').update({ pinned }).eq('id', id)
  },

  remove: async (id) => {
    if (!supabase) return
    const previous = get().notes
    set({ notes: previous.filter((n) => n.id !== id) })

    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) set({ notes: previous })
  },

  subscribe: () => {
    if (!supabase) return () => {}
    const channel = supabase
      .channel('db-notes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => {
        void get().load()
      })
      .subscribe()

    return () => {
      void supabase!.removeChannel(channel)
    }
  },
}))
