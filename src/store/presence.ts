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
      })

    // Presence alone treats a backgrounded tab as still connected, which would
    // show someone as online long after they put their phone down.
    const onVisibility = () => {
      if (document.hidden) void room.untrack()
      else void room.track({ online_at: new Date().toISOString() })
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(typingTimer)
      channel = null
      void supabase!.removeChannel(room)
    }
  },
}))
