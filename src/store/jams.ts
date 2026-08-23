import { create } from 'zustand'
import { supabase } from './../lib/supabase'
import type { UserId } from './session'

export type JamKind =
  | 'jam'
  | 'playlist'
  | 'album'
  | 'track'
  | 'artist'
  | 'episode'
  | 'show'
  | 'link'

export interface Jam {
  id: string
  author_id: UserId
  url: string
  note: string | null
  kind: JamKind
  ended_at: string | null
  created_at: string
}

/**
 * How long a jam is assumed to still be running when nobody has said
 * otherwise. Spotify gives no way to ask, and a link that quietly stopped
 * working is worse than one labelled stale, so this errs early.
 */
export const LIVE_HOURS = 4

export function isLive(jam: Jam): boolean {
  if (jam.ended_at) return false
  return Date.now() - new Date(jam.created_at).getTime() < LIVE_HOURS * 3600_000
}

/**
 * What a Spotify URL points at.
 *
 * Jam invites are `spotify.link` shortlinks, which say nothing about their
 * contents until opened — so a shortlink is taken to be a jam, that being what
 * they are nearly always used for here.
 */
export function kindOf(url: string): JamKind {
  try {
    const { hostname, pathname } = new URL(url)

    if (hostname.endsWith('spotify.link')) return 'jam'
    if (!hostname.endsWith('spotify.com')) return 'link'
    if (pathname.startsWith('/jam')) return 'jam'

    const segment = pathname.split('/').filter(Boolean)[0]
    switch (segment) {
      case 'playlist':
      case 'album':
      case 'track':
      case 'artist':
      case 'episode':
      case 'show':
        return segment
      default:
        return 'link'
    }
  } catch {
    return 'link'
  }
}

export function isSpotify(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname.endsWith('spotify.com') || hostname.endsWith('spotify.link')
  } catch {
    return false
  }
}

/** Pulls the first URL out of pasted text — share sheets add a lot of chatter. */
export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/)
  if (!match) return null
  // Trailing punctuation from a sentence is not part of the link.
  return match[0].replace(/[.,)\]]+$/, '')
}

interface JamsState {
  jams: Jam[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  saving: boolean
  error: string | null

  load: () => Promise<void>
  post: (url: string, note: string, me: UserId) => Promise<boolean>
  setEnded: (id: string, ended: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  subscribe: () => () => void
}

export const useJams = create<JamsState>()((set, get) => ({
  jams: [],
  status: 'idle',
  saving: false,
  error: null,

  load: async () => {
    if (!supabase) return
    set({ status: 'loading' })

    const { data, error } = await supabase
      .from('jams')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      set({ status: 'error', error: error.message })
      return
    }
    set({ jams: (data ?? []) as Jam[], status: 'ready', error: null })
  },

  post: async (url, note, me) => {
    if (!supabase) return false

    const link = extractUrl(url) ?? url.trim()
    if (!link) return false

    if (!isSpotify(link)) {
      set({ error: 'That is not a Spotify link.' })
      return false
    }

    set({ saving: true, error: null })
    const { error } = await supabase.from('jams').insert({
      author_id: me,
      url: link,
      note: note.trim() || null,
      kind: kindOf(link),
    })
    set({ saving: false })

    if (error) {
      set({ error: error.message })
      return false
    }
    await get().load()
    return true
  },

  setEnded: async (id, ended) => {
    if (!supabase) return
    const at = ended ? new Date().toISOString() : null

    // Optimistic: marking a dead link dead should feel instant.
    const previous = get().jams
    set({ jams: previous.map((j) => (j.id === id ? { ...j, ended_at: at } : j)) })

    const { error } = await supabase.from('jams').update({ ended_at: at }).eq('id', id)
    if (error) set({ jams: previous })
  },

  remove: async (id) => {
    if (!supabase) return
    const previous = get().jams
    set({ jams: previous.filter((j) => j.id !== id) })

    const { error } = await supabase.from('jams').delete().eq('id', id)
    if (error) set({ jams: previous })
  },

  subscribe: () => {
    if (!supabase) return () => {}

    const channel = supabase
      .channel('db-jams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jams' }, () => {
        void get().load()
      })
      .subscribe()

    return () => {
      void supabase!.removeChannel(channel)
    }
  },
}))
