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
  /**
   * Admin looking at the app through one person's eyes. This only changes what
   * admin *sees* — `user` stays null, so nothing can be posted while viewing
   * as someone, and the database is never told a different identity. It is a
   * lens, not a login.
   */
  viewingAs: UserId | null

  signIn: (role: Role) => void
  signOut: () => void
  setViewingAs: (user: UserId | null) => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      role: null,
      user: null,
      isAdmin: false,
      viewingAs: null,

      signIn: (role) =>
        set({
          role,
          user: role === 'admin' ? null : role,
          isAdmin: role === 'admin',
          viewingAs: null,
        }),

      signOut: () => set({ role: null, user: null, isAdmin: false, viewingAs: null }),

      setViewingAs: (user) => set((s) => (s.isAdmin ? { viewingAs: user } : {})),
    }),
    { name: 'rpluss.session' },
  ),
)

/**
 * Whose eyes the screen is being drawn through. For everyone except admin this
 * is just you. Anything that *writes* must keep using `user` — this is only
 * ever the answer to "what should be on screen".
 */
export const useViewer = (): UserId | null => useSession((s) => s.viewingAs ?? s.user)
