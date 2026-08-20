import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { UserId } from './session'

export interface Person {
  id: UserId
  name: string
  theme: string
  mood: string | null
  mood_color: string | null
  last_seen: string | null
  created_at: string
}

/** Two states, no more. A long list of faces reads as clutter, not feeling. */
export const MOODS: { label: string; color: string }[] = [
  { label: 'good', color: '#35e08a' },
  { label: 'bad', color: '#ff4d6a' },
]

interface PeopleState {
  people: Partial<Record<UserId, Person>>
  load: () => Promise<void>
  setMood: (me: UserId, mood: string | null, color: string | null) => Promise<void>
  subscribe: () => () => void
}

export const usePeople = create<PeopleState>()((set) => ({
  people: {},

  load: async () => {
    if (!supabase) return
    const { data } = await supabase.from('users').select('*')
    const people: Partial<Record<UserId, Person>> = {}
    for (const person of (data ?? []) as Person[]) people[person.id] = person
    set({ people })
  },

  setMood: async (me, mood, color) => {
    if (!supabase) return
    set((s) => ({
      people: { ...s.people, [me]: { ...s.people[me]!, mood, mood_color: color } },
    }))
    await supabase.from('users').update({ mood, mood_color: color }).eq('id', me)
  },

  subscribe: () => {
    if (!supabase) return () => {}
    const channel = supabase
      .channel('db-people')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
        const person = payload.new as Person
        set((s) => ({ people: { ...s.people, [person.id]: person } }))
      })
      .subscribe()

    return () => {
      void supabase!.removeChannel(channel)
    }
  },
}))

export const moodFor = (person?: Person | null) =>
  person?.mood ? MOODS.find((m) => m.label === person.mood) ?? null : null
