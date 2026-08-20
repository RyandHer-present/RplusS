import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Toggle {
  id: string
  label: string
  hint: string
  group: string
  /** Off by default where the effect is heavy or a matter of taste. */
  on: boolean
}

export const TOGGLES: Toggle[] = [
  // --- background ---
  { id: 'ambient', label: 'Ambient colour', hint: 'Drifting colour behind every screen', group: 'Background', on: true },
  { id: 'shader', label: 'Live aurora', hint: 'Animated shader on the lock screen', group: 'Background', on: true },
  { id: 'grain', label: 'Film grain', hint: 'Fine noise over everything', group: 'Background', on: true },
  { id: 'vignette', label: 'Vignette', hint: 'Darkened screen edges', group: 'Background', on: true },
  { id: 'particles', label: 'Floating specks', hint: 'Slow drifting dots', group: 'Background', on: true },
  { id: 'beams', label: 'Light beams', hint: 'Soft diagonal light across the top', group: 'Background', on: false },

  // --- surfaces ---
  { id: 'glow', label: 'Accent glow', hint: 'Highlights bloom', group: 'Surfaces', on: true },
  { id: 'blur', label: 'Frosted glass', hint: 'Panels blur what is behind them', group: 'Surfaces', on: true },
  { id: 'shadows', label: 'Card depth', hint: 'Shadows under panels', group: 'Surfaces', on: true },
  { id: 'sweep', label: 'Living borders', hint: 'Light travels around cards', group: 'Surfaces', on: false },
  { id: 'sheen', label: 'Card sheen', hint: 'Faint gloss across surfaces', group: 'Surfaces', on: true },
  { id: 'rounded', label: 'Extra round', hint: 'Softer corners everywhere', group: 'Surfaces', on: false },

  // --- colour ---
  { id: 'gradientText', label: 'Gradient headings', hint: 'Titles fade into the accent', group: 'Colour', on: true },
  { id: 'vivid', label: 'Vivid accents', hint: 'Stronger, more saturated colour', group: 'Colour', on: false },
  { id: 'contrast', label: 'Higher contrast', hint: 'Brighter text against the background', group: 'Colour', on: false },
  { id: 'tint', label: 'Tinted surfaces', hint: 'Panels pick up the theme colour', group: 'Colour', on: true },

  // --- motion ---
  { id: 'transitions', label: 'Screen transitions', hint: 'Sections slide as you move', group: 'Motion', on: true },
  { id: 'stagger', label: 'Staggered entry', hint: 'Lists arrive one after another', group: 'Motion', on: true },
  { id: 'pop', label: 'Message pop', hint: 'New messages spring in', group: 'Motion', on: true },
  { id: 'tabGlow', label: 'Tab bloom', hint: 'Light behind the active tab', group: 'Motion', on: true },
  { id: 'shimmer', label: 'Loading shimmer', hint: 'Light sweeps across things still loading', group: 'Motion', on: true },
  { id: 'springs', label: 'Bouncier motion', hint: 'Overshoot on presses and pops', group: 'Motion', on: true },
  { id: 'breathe', label: 'Breathing accents', hint: 'Live indicators pulse slowly', group: 'Motion', on: true },

  // --- chat ---
  { id: 'tails', label: 'Bubble tails', hint: 'Message bubbles point at their sender', group: 'Chat', on: true },
  { id: 'compact', label: 'Compact spacing', hint: 'Fit more on screen', group: 'Chat', on: false },
  { id: 'alwaysTime', label: 'Always show times', hint: 'Timestamp under every message', group: 'Chat', on: false },
]

interface VisualsState {
  enabled: Record<string, boolean>
  toggle: (id: string) => void
  setAll: (on: boolean) => void
  reset: () => void
}

const defaults = () => Object.fromEntries(TOGGLES.map((t) => [t.id, t.on]))

export const useVisuals = create<VisualsState>()(
  persist(
    (set) => ({
      enabled: defaults(),
      toggle: (id) => set((s) => ({ enabled: { ...s.enabled, [id]: !s.enabled[id] } })),
      setAll: (on) => set({ enabled: Object.fromEntries(TOGGLES.map((t) => [t.id, on])) }),
      reset: () => set({ enabled: defaults() }),
    }),
    {
      name: 'rpluss.visuals',
      // Toggles added in a later version should appear at their default rather
      // than silently off because an old saved object lacks the key.
      merge: (saved, current) => ({
        ...current,
        ...(saved as VisualsState),
        enabled: { ...defaults(), ...((saved as VisualsState)?.enabled ?? {}) },
      }),
    },
  ),
)

/** Mirrors the toggles onto <html> as `v-<id>` classes for CSS to key off. */
export function applyVisuals(enabled: Record<string, boolean>) {
  const root = document.documentElement
  for (const { id } of TOGGLES) root.classList.toggle(`v-${id}`, Boolean(enabled[id]))
}
