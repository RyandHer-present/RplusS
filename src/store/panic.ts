import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The screen you can put up in a second when someone glances over.
 *
 * Two decisions worth knowing about:
 *
 * The state is persisted, so closing the tab and reopening it does not undo
 * the hiding. A panic button that a reload defeats is not one.
 *
 * Because of that, leaving it has two doors. Within the same page life the
 * gesture is enough — you hid it ten seconds ago and you are still holding the
 * phone. But if it was hiding when the page loaded, the PIN is required, since
 * at that point there is no evidence the person tapping is you.
 */
interface PanicState {
  hidden: boolean
  /** True when this page load *began* hidden, which is what forces the PIN. */
  sealed: boolean
  hide: () => void
  reveal: () => void
  toggle: () => void
  unseal: () => void
}

export const usePanic = create<PanicState>()(
  persist(
    (set, get) => ({
      hidden: false,
      sealed: false,
      hide: () => set({ hidden: true }),
      reveal: () => set({ hidden: false, sealed: false }),
      toggle: () => (get().hidden ? (get().sealed ? undefined : set({ hidden: false })) : set({ hidden: true })),
      unseal: () => set({ hidden: false, sealed: false }),
    }),
    {
      name: 'rpluss.panic',
      partialize: (s) => ({ hidden: s.hidden }),
      // Anything already hidden when the page loads is sealed behind the PIN.
      onRehydrateStorage: () => (state) => {
        if (state?.hidden) state.sealed = true
      },
    },
  ),
)
