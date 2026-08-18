import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { syncTelegramChrome } from '@/lib/telegram'

export const THEMES = ['light', 'dark', 'rose'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_META: Record<Theme, { label: string; swatch: string }> = {
  light: { label: 'Светлая', swatch: '#ffffff' },
  dark:  { label: 'Тёмная',  swatch: '#0b0d10' },
  rose:  { label: 'Розовая', swatch: '#ffd3e2' },
}

const STORAGE_KEY = 'lichnoe-info-theme'

interface ThemeCtx {
  theme: Theme
  setTheme: (t: Theme) => void
  cycle: () => void
}

const Ctx = createContext<ThemeCtx | null>(null)

function readInitial(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr && (THEMES as readonly string[]).includes(attr)) return attr as Theme
  return 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    const meta = document.querySelector('meta[name="theme-color"]')
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (meta && bg) meta.setAttribute('content', bg)
    syncTelegramChrome()
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* приватный режим — просто не запоминаем */
    }
  }, [])

  const cycle = useCallback(() => {
    setTheme(THEMES[(THEMES.indexOf(readInitial()) + 1) % THEMES.length])
  }, [setTheme])

  const value = useMemo(() => ({ theme, setTheme, cycle }), [theme, setTheme, cycle])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme должен вызываться внутри ThemeProvider')
  return ctx
}
