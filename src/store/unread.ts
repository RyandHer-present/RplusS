import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import type { UserId } from './session'

/** Tab path -> the table that feeds it. */
const SOURCES: { path: string; table: string; author: string }[] = [
  { path: '/chat', table: 'messages', author: 'sender_id' },
  { path: '/notes', table: 'notes', author: 'author_id' },
  { path: '/gallery', table: 'gallery', author: 'author_id' },
  { path: '/fits', table: 'fits', author: 'author_id' },
  { path: '/jam', table: 'jams', author: 'author_id' },
  { path: '/voice', table: 'voice_notes', author: 'author_id' },
]

interface UnreadState {
  /** Newest arrival per section, ignoring your own posts. */
  latest: Record<string, string>
  /** When you last looked at each section. */
  seen: Record<string, string>

  load: (me: UserId) => Promise<void>
  subscribe: (me: UserId) => () => void
  markSeen: (path: string) => void
  isUnread: (path: string) => boolean
}

export const useUnread = create<UnreadState>()(
  persist(
    (set, get) => ({
      latest: {},
      seen: {},

      load: async (me) => {
        if (!supabase) return

        const results = await Promise.all(
          SOURCES.map(({ table, author }) =>
            supabase!
              .from(table)
              .select('created_at')
              // Your own posts are never unread to you.
              .neq(author, me)
              .order('created_at', { ascending: false })
              .limit(1),
          ),
        )

        const latest: Record<string, string> = {}
        results.forEach((result, i) => {
          const row = result.data?.[0] as { created_at?: string } | undefined
          if (row?.created_at) latest[SOURCES[i].path] = row.created_at
        })
        set((s) => ({ latest: { ...s.latest, ...latest } }))
      },

      subscribe: (me) => {
        if (!supabase) return () => {}

        const channel = supabase.channel('db-unread')
        for (const { path, table, author } of SOURCES) {
          channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (payload) => {
            const row = payload.new as Record<string, unknown>
            if (row[author] === me) return
            set((s) => ({ latest: { ...s.latest, [path]: String(row.created_at) } }))
          })
        }
        channel.subscribe()

        return () => {
          void supabase!.removeChannel(channel)
        }
      },

      markSeen: (path) =>
        set((s) => ({ seen: { ...s.seen, [path]: new Date().toISOString() } })),

      isUnread: (path) => {
        const { latest, seen } = get()
        const arrived = latest[path]
        if (!arrived) return false
        const looked = seen[path]
        return !looked || arrived > looked
      },
    }),
    { name: 'rpluss.unread', partialize: (s) => ({ seen: s.seen }) },
  ),
)
