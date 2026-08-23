import { useEffect, type ReactNode } from 'react'
import { applyPalette, useTheme } from './useTheme'
import { applyVisuals, useVisuals } from '../store/visuals'
import { useVibe } from '../store/vibe'
import './vibes.css'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeId = useTheme((s) => s.themeId)
  const vibe = useVibe((s) => s.vibe)

  const enabled = useVisuals((s) => s.enabled)

  useEffect(() => {
    applyPalette(themeId, vibe)
  }, [themeId, vibe])

  useEffect(() => {
    applyVisuals(enabled)
  }, [enabled])

  return <>{children}</>
}
