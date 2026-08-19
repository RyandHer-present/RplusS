import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserId = 'ry' | 'sarah'

export const USERS: Record<UserId, { name: string; initial: string }> = {
  ry: { name: 'Ry', initial: 'R' },
  sarah: { name: 'Sarah', initial: 'S' },
}

interface SessionState {
  user: UserId | null
  /** Set once the PIN has been accepted. */
  signIn: (user: UserId) => void
  signOut: () => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      signIn: (user) => set({ user }),
      signOut: () => set({ user: null }),
    }),
    { name: 'rpluss.session' },
  ),
)
