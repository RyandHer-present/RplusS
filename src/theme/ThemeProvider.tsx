import { useEffect, type ReactNode } from 'react'
import { applyTheme, useTheme } from './useTheme'
import { applyVisuals, useVisuals } from '../store/visuals'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeId = useTheme((s) => s.themeId)

  const enabled = useVisuals((s) => s.enabled)

  useEffect(() => {
    applyTheme(themeId)
  }, [themeId])

  useEffect(() => {
    applyVisuals(enabled)
  }, [enabled])

  return <>{children}</>
}
