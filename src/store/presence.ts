import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserId } from './session'

const TYPING_TIMEOUT = 2600

/**
 * How often a pointer position goes out, in milliseconds. Sending on every
 * pointer event would be dozens of messages a second for something the eye
 * cannot follow that finely, and the receiving end smooths between them
 * anyway.
 */
const POINTER_INTERVAL = 60

/** Their pointer is dropped if nothing arrives for this long. */
export const POINTER_STALE = 2500

/** Where the other person is touching, as a fraction of the viewport. */
export interface Pointer {
  x: number
  y: number
  /** Which screen they are on, so a dot is never shown over a different one. */
  path: string
  at: number
  down: boolean
}

interface PresenceState {
  otherOnline: boolean
  otherTyping: boolean
  otherLastSeen: string | null
  otherPointer: Pointer | null
  setTyping: (typing: boolean) => void
  sendPointer: (x: number, y: number, path: string, down: boolean) => void
  clearPointer: () => void
  connect: (me: UserId) => () => void
}

let channel: RealtimeChannel | null = null
let typingTimer: number | undefined
let lastSentTyping = false
let lastPointerSent = 0
// Avoids writing a run of identical events when a tab is switched repeatedly.
let lastLogged: 'online' | 'offline' | null = null

/** Records comings and goings for the admin activity log. */
async function logPresence(user: UserId, event: 'online' | 'offline') {
  if (!supabase || lastLogged === event) return
  lastLogged = event
  await supabase.from('presence_log').insert({ user_id: user, event })
}

export const usePresence = create<PresenceState>()((set) => ({
  otherOnline: false,
  otherTyping: false,
  otherLastSeen: null,
  otherPointer: null,

  /**
   * Typing is a broadcast rather than a database write — it changes many times
   * a second and none of it is worth persisting.
   */
  setTyping: (typing) => {
    window.clearTimeout(typingTimer)

    if (typing !== lastSentTyping) {
      lastSentTyping = typing
      void channel?.send({ type: 'broadcast', event: 'typing', payload: { typing } })
    }

    // Stop advertising typing shortly after they stop, so a closed tab or a
    // discarded draft does not leave the indicator stuck on.
    if (typing) {
      typingTimer = window.setTimeout(() => {
        lastSentTyping = false
        void channel?.send({ type: 'broadcast', event: 'typing', payload: { typing: false } })
      }, TYPING_TIMEOUT)
    }
  },

  /**
   * Broadcast, never stored. A cursor position is worthless a second later, so
   * none of this touches the database.
   */
  sendPointer: (x, y, path, down) => {
    const now = Date.now()
    // A press or release goes out immediately; movement is throttled.
    if (!down && now - lastPointerSent < POINTER_INTERVAL) return
    lastPointerSent = now
    void channel?.send({ type: 'broadcast', event: 'pointer', payload: { x, y, path, down } })
  },

  clearPointer: () => {
    void channel?.send({ type: 'broadcast', event: 'pointer-gone', payload: {} })
  },

  connect: (me) => {
    if (!supabase) return () => {}

    const room = supabase.channel('room:main', { config: { presence: { key: me } } })
    channel = room

    room
      .on('presence', { event: 'sync' }, () => {
        const state = room.presenceState()
        const others = Object.keys(state).filter((key) => key !== me)
        set({ otherOnline: others.length > 0 })
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key !== me) {
          set({
            otherOnline: false,
            otherTyping: false,
            otherPointer: null,
            otherLastSeen: new Date().toISOString(),
          })
        }
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        set({ otherTyping: Boolean(payload?.typing) })
      })
      .on('broadcast', { event: 'pointer' }, ({ payload }) => {
        if (typeof payload?.x !== 'number' || typeof payload?.y !== 'number') return
        set({
          otherPointer: {
            x: payload.x,
            y: payload.y,
            path: String(payload.path ?? ''),
            down: Boolean(payload.down),
            at: Date.now(),
          },
        })
      })
      .on('broadcast', { event: 'pointer-gone' }, () => {
        set({ otherPointer: null })
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await room.track({ online_at: new Date().toISOString() })
        await supabase!.from('users').update({ last_seen: new Date().toISOString() }).eq('id', me)
        void logPresence(me, 'online')
      })

    // Presence alone treats a backgrounded tab as still connected, which would
    // show someone as online long after they put their phone down.
    const onVisibility = () => {
      if (document.hidden) {
        void room.untrack()
        void logPresence(me, 'offline')
      } else {
        void room.track({ online_at: new Date().toISOString() })
        void logPresence(me, 'online')
      }
    }

    // A closed tab never runs cleanup, so the departure is recorded here too.
    const onLeave = () => {
      void logPresence(me, 'offline')
    }
    window.addEventListener('pagehide', onLeave)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onLeave)
      window.clearTimeout(typingTimer)
      void logPresence(me, 'offline')
      lastLogged = null
      channel = null
      void supabase!.removeChannel(room)
    }
  },
}))
