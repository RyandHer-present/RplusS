import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_THEME, THEMES, type ThemeId } from './themes'
import { VIBES, type VibeId } from './vibes'

interface ThemeState {
  themeId: ThemeId
  setTheme: (id: ThemeId) => void
}

/**
 * Theme choice is per-person and per-device for now; Phase 2 syncs it to the
 * user row so it follows you between phone and desktop.
 */
export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME,
      setTheme: (id) => set({ themeId: id }),
    }),
    { name: 'rpluss.theme' },
  ),
)

/**
 * Writes the active palette onto :root.
 *
 * The personal theme goes down first and a shared vibe paints over it, so
 * clearing the vibe falls back to whatever that person had chosen without
 * having to remember it separately.
 */
export function applyPalette(id: ThemeId, vibeId: VibeId | null) {
  const theme = THEMES[id]
  const vibe = vibeId ? VIBES[vibeId] : null
  const root = document.documentElement

  const tokens = { ...theme.tokens, ...(vibe?.tokens ?? {}) }
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value)
  }

  // The two lights vibes.css lays over the app. Kept transparent with no vibe
  // so the layer costs nothing when it is not wanted.
  root.style.setProperty('--wash-1', vibe?.wash[0] ?? 'transparent')
  root.style.setProperty('--wash-2', vibe?.wash[1] ?? 'transparent')

  if (vibe) root.setAttribute('data-vibe', vibe.id)
  else root.removeAttribute('data-vibe')

  // Keeps the iOS status bar and Android chrome in sync.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens['--bg'])
}

/** The three accents the background shader runs on, vibe first. */
export function activeShader(id: ThemeId, vibeId: VibeId | null) {
  return vibeId ? VIBES[vibeId].shader : THEMES[id].shader
}
