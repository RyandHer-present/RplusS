import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { uploadAudio } from '../lib/media'
import type { Recording } from '../lib/recorder'
import type { VoiceNote } from '../lib/types'
import type { UserId } from './session'

interface VoiceState {
  notes: VoiceNote[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  saving: boolean
  error: string | null

  load: () => Promise<void>
  save: (recording: Recording, me: UserId, title?: string) => Promise<void>
  markListened: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  subscribe: () => () => void
}

export const useVoice = create<VoiceState>()((set, get) => ({
  notes: [],
  status: 'idle',
  saving: false,
  error: null,

  load: async () => {
    if (!supabase) return
    set({ status: 'loading' })

    const { data, error } = await supabase
      .from('voice_notes')
      .select('*, media(*)')
      .order('created_at', { ascending: false })

    if (error) {
      set({ status: 'error', error: error.message })
      return
    }
    set({ notes: (data ?? []) as VoiceNote[], status: 'ready' })
  },

  save: async (recording, me, title) => {
    if (!supabase) return
    set({ saving: true, error: null })

    try {
      const mediaId = await uploadAudio(recording.blob, me, recording.durationMs)
      const { error } = await supabase.from('voice_notes').insert({
        author_id: me,
        media_id: mediaId,
        title: title ?? null,
        peaks: recording.peaks,
      })
      if (error) throw error
      await get().load()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Could not save that' })
    } finally {
      set({ saving: false })
    }
  },

  markListened: async (id) => {
    if (!supabase) return
    const note = get().notes.find((n) => n.id === id)
    if (!note || note.listened_at) return

    const now = new Date().toISOString()
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, listened_at: now } : n)) }))
    await supabase.from('voice_notes').update({ listened_at: now }).eq('id', id)
  },

  remove: async (id) => {
    if (!supabase) return
    const previous = get().notes
    set({ notes: previous.filter((n) => n.id !== id) })

    const { error } = await supabase.from('voice_notes').delete().eq('id', id)
    if (error) set({ notes: previous })
  },

  subscribe: () => {
    if (!supabase) return () => {}
    const channel = supabase
      .channel('db-voice')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_notes' }, () => {
        void get().load()
      })
      .subscribe()

    return () => {
      void supabase!.removeChannel(channel)
    }
  },
}))
