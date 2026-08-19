import { useEffect, type ReactNode } from 'react'
import { applyTheme, useTheme } from './useTheme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeId = useTheme((s) => s.themeId)

  useEffect(() => {
    applyTheme(themeId)
  }, [themeId])

  return <>{children}</>
}
