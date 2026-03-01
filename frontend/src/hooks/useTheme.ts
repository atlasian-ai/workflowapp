import { useState, useEffect } from 'react'

export type Theme = 'light' | 'dark' | 'system' | 'retro'

const THEME_KEY = 'forgeflow-theme'

export function getStoredTheme(): Theme {
  try {
    return (localStorage.getItem(THEME_KEY) as Theme) ?? 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(theme: Theme): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const isRetro = theme === 'retro'
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.classList.toggle('retro', isRetro)
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem(THEME_KEY, t)
    applyTheme(t)
  }

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return { theme, setTheme }
}
