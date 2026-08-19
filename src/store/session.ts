import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserId = 'ry' | 'sarah'
export type Role = UserId | 'admin'

export const USERS: Record<UserId, { name: string; initial: string }> = {
  ry: { name: 'Ry', initial: 'R' },
  sarah: { name: 'Sarah', initial: 'S' },
}

export const other = (user: UserId): UserId => (user === 'ry' ? 'sarah' : 'ry')

interface SessionState {
  role: Role | null
  /**
   * Who is posting. Null in admin mode, which is deliberate: admin belongs to
   * neither person and the database refuses inserts from it, so the UI must
   * not offer to create anything either.
   */
  user: UserId | null
  isAdmin: boolean

  signIn: (role: Role) => void
  signOut: () => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      role: null,
      user: null,
      isAdmin: false,

      signIn: (role) =>
        set({
          role,
          user: role === 'admin' ? null : role,
          isAdmin: role === 'admin',
        }),

      signOut: () => set({ role: null, user: null, isAdmin: false }),
    }),
    { name: 'rpluss.session' },
  ),
)
