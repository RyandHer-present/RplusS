import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { uploadImage, uploadVideo } from '../lib/media'
import type { Media } from '../lib/types'
import type { UserId } from './session'

export interface GalleryPost {
  id: string
  author_id: UserId
  media_id: string
  caption: string | null
  created_at: string
  media?: Media | null
}

interface GalleryState {
  posts: GalleryPost[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  uploading: boolean
  progress: string | null
  error: string | null

  load: () => Promise<void>
  post: (file: File, me: UserId) => Promise<void>
  remove: (id: string) => Promise<void>
  subscribe: () => () => void
}

export const useGallery = create<GalleryState>()((set, get) => ({
  posts: [],
  status: 'idle',
  uploading: false,
  progress: null,
  error: null,

  load: async () => {
    if (!supabase) return
    set({ status: 'loading' })

    const { data, error } = await supabase
      .from('gallery')
      .select('*, media(*)')
      .order('created_at', { ascending: false })

    if (error) {
      set({ status: 'error', error: error.message })
      return
    }
    set({ posts: (data ?? []) as GalleryPost[], status: 'ready' })
  },

  post: async (file, me) => {
    if (!supabase) return
    const isVideo = file.type.startsWith('video/')
    set({ uploading: true, error: null, progress: isVideo ? 'Reading video…' : 'Compressing…' })

    try {
      const mediaId = isVideo ? await uploadVideo(file, me) : await uploadImage(file, me)
      set({ progress: 'Saving…' })

      const { error } = await supabase.from('gallery').insert({ author_id: me, media_id: mediaId })
      if (error) throw error
      await get().load()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      set({ uploading: false, progress: null })
    }
  },

  remove: async (id) => {
    if (!supabase) return
    const previous = get().posts
    set({ posts: previous.filter((p) => p.id !== id) })

    const { error } = await supabase.from('gallery').delete().eq('id', id)
    if (error) set({ posts: previous })
  },

  subscribe: () => {
    if (!supabase) return () => {}
    const channel = supabase
      .channel('db-gallery')
      // Realtime carries the gallery row without its joined media, so a refetch
      // is the simplest way to stay correct.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery' }, () => {
        void get().load()
      })
      .subscribe()

    return () => {
      void supabase!.removeChannel(channel)
    }
  },
}))
