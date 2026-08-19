import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_THEME, THEMES, type ThemeId } from './themes'

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

/** Writes the active theme's tokens onto :root. Called once from ThemeProvider. */
export function applyTheme(id: ThemeId) {
  const theme = THEMES[id]
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(key, value)
  }
  // Keeps the iOS status bar and Android chrome in sync with the theme.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.tokens['--bg'])
}
