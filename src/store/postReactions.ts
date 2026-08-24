import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { UserId } from './session'

export type ReactableEntity = 'gallery' | 'fits' | 'notes' | 'voice_notes' | 'jams'

export interface PostReaction {
  entity: ReactableEntity
  entity_id: string
  user_id: UserId
  emoji: string
}

const keyFor = (entity: ReactableEntity, id: string) => `${entity}:${id}`

interface PostReactionState {
  /** Keyed "entity:id", because a uuid alone is not unique across tables. */
  byTarget: Record<string, PostReaction[]>
  loaded: boolean

  load: () => Promise<void>
  subscribe: () => () => void
  toggle: (entity: ReactableEntity, id: string, emoji: string, me: UserId) => Promise<void>
  for: (entity: ReactableEntity, id: string) => PostReaction[]
  mine: (entity: ReactableEntity, id: string, emoji: string, me: UserId) => boolean
}

export const usePostReactions = create<PostReactionState>()((set, get) => ({
  byTarget: {},
  loaded: false,

  load: async () => {
    if (!supabase) return
    const { data, error } = await supabase.from('post_reactions').select('*')
    if (error || !data) return

    const byTarget: Record<string, PostReaction[]> = {}
    for (const row of data as PostReaction[]) {
      ;(byTarget[keyFor(row.entity, row.entity_id)] ??= []).push(row)
    }
    set({ byTarget, loaded: true })
  },

  subscribe: () => {
    if (!supabase) return () => {}
    const channel = supabase
      .channel('db-post-reactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_reactions' }, (payload) => {
        const row = (payload.new ?? payload.old) as PostReaction
        if (!row?.entity_id) return
        const key = keyFor(row.entity, row.entity_id)

        set((s) => {
          const list = s.byTarget[key] ?? []
          if (payload.eventType === 'DELETE') {
            return {
              byTarget: {
                ...s.byTarget,
                [key]: list.filter(
                  (r) => !(r.user_id === row.user_id && r.emoji === row.emoji),
                ),
              },
            }
          }
          const already = list.some((r) => r.user_id === row.user_id && r.emoji === row.emoji)
          return already ? s : { byTarget: { ...s.byTarget, [key]: [...list, row] } }
        })
      })
    channel.subscribe()
    return () => {
      void supabase!.removeChannel(channel)
    }
  },

  toggle: async (entity, id, emoji, me) => {
    if (!supabase) return
    const key = keyFor(entity, id)
    const list = get().byTarget[key] ?? []
    const existing = list.find((r) => r.user_id === me && r.emoji === emoji)

    // Applied locally first: a reaction that waits for a round trip before it
    // appears feels broken, and the realtime event will agree in a moment.
    set((s) => ({
      byTarget: {
        ...s.byTarget,
        [key]: existing
          ? list.filter((r) => !(r.user_id === me && r.emoji === emoji))
          : [...list, { entity, entity_id: id, user_id: me, emoji }],
      },
    }))

    const request = existing
      ? supabase
          .from('post_reactions')
          .delete()
          .match({ entity, entity_id: id, user_id: me, emoji })
      : supabase.from('post_reactions').insert({ entity, entity_id: id, user_id: me, emoji })

    const { error } = await request
    // Put it back the way it was if the write did not land.
    if (error) void get().load()
  },

  for: (entity, id) => get().byTarget[keyFor(entity, id)] ?? [],

  mine: (entity, id, emoji, me) =>
    (get().byTarget[keyFor(entity, id)] ?? []).some((r) => r.user_id === me && r.emoji === emoji),
}))
