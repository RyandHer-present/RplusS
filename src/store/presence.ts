import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserId } from './session'

const TYPING_TIMEOUT = 2600

interface PresenceState {
  otherOnline: boolean
  otherTyping: boolean
  otherLastSeen: string | null
  setTyping: (typing: boolean) => void
  connect: (me: UserId) => () => void
}

let channel: RealtimeChannel | null = null
let typingTimer: number | undefined
let lastSentTyping = false
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
        if (key !== me) set({ otherOnline: false, otherTyping: false, otherLastSeen: new Date().toISOString() })
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        set({ otherTyping: Boolean(payload?.typing) })
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
