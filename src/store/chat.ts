import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Message, Reaction } from '../lib/types'
import { enqueue, flush, pendingCount, type QueuedMessage } from '../lib/queue'
import type { UserId } from './session'

const PAGE_SIZE = 60

interface ChatState {
  messages: Message[]
  reactions: Record<string, Reaction[]>
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  replyTo: Message | null
  editing: Message | null
  hasMore: boolean

  load: () => Promise<void>
  loadOlder: () => Promise<void>
  send: (body: string, me: UserId, mediaId?: string) => Promise<void>
  retry: (tempId: string, me: UserId) => Promise<void>
  setReplyTo: (message: Message | null) => void
  setEditing: (message: Message | null) => void
  saveEdit: (id: string, body: string) => Promise<void>
  unsend: (id: string) => Promise<void>
  toggleReaction: (messageId: string, emoji: string, me: UserId) => Promise<void>
  togglePin: (messageId: string) => Promise<void>
  markSeen: (ids: string[]) => Promise<void>
  queued: number
  flushQueue: () => Promise<void>
  watchConnection: (me: UserId) => () => void
  subscribe: (me: UserId) => () => void
}

/** Keeps the list sorted and replaces any existing row with the same id. */
function upsert(list: Message[], incoming: Message): Message[] {
  const index = list.findIndex((m) => m.id === incoming.id)
  const next = index >= 0 ? list.with(index, { ...list[index], ...incoming }) : [...list, incoming]
  return next.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export const useChat = create<ChatState>()((set, get) => ({
  messages: [],
  reactions: {},
  status: 'idle',
  error: null,
  replyTo: null,
  editing: null,
  hasMore: false,
  queued: 0,

  load: async () => {
    if (!supabase) return
    set({ status: 'loading', error: null })

    const [messagesResult, reactionsResult] = await Promise.all([
      supabase.from('messages').select('*, media(*)').order('created_at', { ascending: false }).limit(PAGE_SIZE),
      supabase.from('reactions').select('*'),
    ])

    if (messagesResult.error) {
      set({ status: 'error', error: messagesResult.error.message })
      return
    }

    const messages = (messagesResult.data as Message[]).slice().reverse()
    const reactions: Record<string, Reaction[]> = {}
    for (const r of (reactionsResult.data ?? []) as Reaction[]) {
      ;(reactions[r.message_id] ??= []).push(r)
    }

    set({ messages, reactions, status: 'ready', hasMore: messages.length === PAGE_SIZE })
  },

  loadOlder: async () => {
    const { messages, hasMore } = get()
    if (!supabase || !hasMore || !messages.length) return

    const { data, error } = await supabase
      .from('messages')
      .select('*, media(*)')
      .lt('created_at', messages[0].created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error || !data) return
    const older = (data as Message[]).slice().reverse()
    set({ messages: [...older, ...messages], hasMore: data.length === PAGE_SIZE })
  },

  send: async (body, me, mediaId) => {
    const trimmed = body.trim()
    if ((!trimmed && !mediaId) || !supabase) return

    const replyTo = get().replyTo
    const tempId = `temp-${crypto.randomUUID()}`

    // Show it immediately; the network round trip should never gate the UI.
    const optimistic: Message = {
      id: tempId,
      sender_id: me,
      body: trimmed,
      media_id: mediaId ?? null,
      reply_to_id: replyTo?.id ?? null,
      pinned: false,
      created_at: new Date().toISOString(),
      delivered_at: null,
      seen_at: null,
      edited_at: null,
      pending: true,
    }
    set((s) => ({ messages: [...s.messages, optimistic], replyTo: null }))

    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: me, body: trimmed || null, media_id: mediaId ?? null, reply_to_id: optimistic.reply_to_id })
      .select('*, media(*)')
      .single()

    if (error || !data) {
      // Offline is not a failure, it is a delay: hold the message on disk and
      // send it when the connection comes back.
      if (!navigator.onLine) {
        await enqueue({
          id: tempId,
          sender_id: me,
          body: trimmed,
          reply_to_id: optimistic.reply_to_id,
          queued_at: optimistic.created_at,
        })
        set((s) => ({
          messages: s.messages.map((m) => (m.id === tempId ? { ...m, pending: true } : m)),
          queued: s.queued + 1,
        }))
        return
      }

      set((s) => ({
        messages: s.messages.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
      }))
      return
    }

    // Swap the placeholder for the real row rather than appending a duplicate.
    set((s) => ({
      messages: upsert(
        s.messages.filter((m) => m.id !== tempId),
        data as Message,
      ),
    }))
  },

  retry: async (tempId, me) => {
    const failed = get().messages.find((m) => m.id === tempId)
    if (!failed?.body) return
    set((s) => ({ messages: s.messages.filter((m) => m.id !== tempId) }))
    await get().send(failed.body, me)
  },

  setReplyTo: (message) => set({ replyTo: message }),

  setEditing: (message) => set({ editing: message }),

  saveEdit: async (id, body) => {
    const trimmed = body.trim()
    if (!supabase || !trimmed) return

    const previous = get().messages.find((m) => m.id === id)
    const now = new Date().toISOString()
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, body: trimmed, edited_at: now } : m)),
      editing: null,
    }))

    const { error } = await supabase.from('messages').update({ body: trimmed }).eq('id', id)
    // The database rejects edits from anyone but the sender; put it back if so.
    if (error && previous) {
      set((s) => ({ messages: s.messages.map((m) => (m.id === id ? previous : m)) }))
    }
  },

  unsend: async (id) => {
    if (!supabase) return
    const previous = get().messages.find((m) => m.id === id)
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }))

    const { error } = await supabase.from('messages').delete().eq('id', id)
    if (error && previous) {
      set((s) => ({ messages: upsert(s.messages, previous) }))
    }
  },

  toggleReaction: async (messageId, emoji, me) => {
    if (!supabase) return
    const existing = get().reactions[messageId]?.find((r) => r.user_id === me && r.emoji === emoji)

    if (existing) {
      set((s) => ({
        reactions: {
          ...s.reactions,
          [messageId]: (s.reactions[messageId] ?? []).filter(
            (r) => !(r.user_id === me && r.emoji === emoji),
          ),
        },
      }))
      await supabase.from('reactions').delete().match({ message_id: messageId, user_id: me, emoji })
      return
    }

    set((s) => ({
      reactions: {
        ...s.reactions,
        [messageId]: [...(s.reactions[messageId] ?? []), { message_id: messageId, user_id: me, emoji }],
      },
    }))
    await supabase.from('reactions').insert({ message_id: messageId, user_id: me, emoji })
  },

  togglePin: async (messageId) => {
    if (!supabase) return
    const message = get().messages.find((m) => m.id === messageId)
    if (!message) return

    const pinned = !message.pinned
    set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, pinned } : m)) }))
    await supabase.from('messages').update({ pinned }).eq('id', messageId)
  },

  markSeen: async (ids) => {
    if (!supabase || !ids.length) return
    const now = new Date().toISOString()
    set((s) => ({
      messages: s.messages.map((m) => (ids.includes(m.id) ? { ...m, seen_at: m.seen_at ?? now } : m)),
    }))
    await supabase.from('messages').update({ seen_at: now }).in('id', ids).is('seen_at', null)
  },


  flushQueue: async () => {
    if (!supabase) return

    const sent = await flush(async (queuedMessage: QueuedMessage) => {
      const { data, error } = await supabase!
        .from('messages')
        .insert({
          sender_id: queuedMessage.sender_id,
          body: queuedMessage.body,
          reply_to_id: queuedMessage.reply_to_id,
        })
        .select('*, media(*)')
        .single()

      if (error || !data) return false

      set((s) => ({
        messages: upsert(
          s.messages.filter((m) => m.id !== queuedMessage.id),
          data as Message,
        ),
      }))
      return true
    })

    if (sent) set({ queued: await pendingCount() })
  },

  watchConnection: (me) => {
    void me
    const onOnline = () => void get().flushQueue()

    window.addEventListener('online', onOnline)
    // Also try on start: the queue may have survived a closed tab.
    void pendingCount().then((count) => {
      set({ queued: count })
      if (count) void get().flushQueue()
    })

    return () => window.removeEventListener('online', onOnline)
  },

  subscribe: (me) => {
    if (!supabase) return () => {}

    const channel: RealtimeChannel = supabase
      .channel('db-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const message = payload.new as Message
        set((s) => {
          const existing = s.messages.find((m) => m.id === message.id)
          return { messages: upsert(s.messages, { ...message, media: existing?.media ?? undefined }) }
        })

        // Delivery is acknowledged by the recipient's client, which is the only
        // side that can actually know the message arrived.
        if (message.sender_id !== me && !message.delivered_at) {
          void supabase!
            .from('messages')
            .update({ delivered_at: new Date().toISOString() })
            .eq('id', message.id)
            .is('delivered_at', null)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        set((s) => ({ messages: upsert(s.messages, payload.new as Message) }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        // Unsends arrive with only the primary key, which is all we need.
        const { id } = payload.old as { id: string }
        set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (payload) => {
        const r = payload.new as Reaction
        set((s) => {
          const list = s.reactions[r.message_id] ?? []
          if (list.some((x) => x.user_id === r.user_id && x.emoji === r.emoji)) return s
          return { reactions: { ...s.reactions, [r.message_id]: [...list, r] } }
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, (payload) => {
        const r = payload.old as Reaction
        set((s) => ({
          reactions: {
            ...s.reactions,
            [r.message_id]: (s.reactions[r.message_id] ?? []).filter(
              (x) => !(x.user_id === r.user_id && x.emoji === r.emoji),
            ),
          },
        }))
      })
      .subscribe()

    return () => {
      void supabase!.removeChannel(channel)
    }
  },
}))
