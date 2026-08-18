import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_BACKGROUND,
  fetchBackground,
  saveBackground,
  type BackgroundSetting,
} from '@/lib/settings'

const LOCAL_OFF = 'lichnoe-info-bg-hidden'

interface SettingsCtx {
  background: BackgroundSetting
  /** Локальное «выключить фон у себя», не трогая общую настройку */
  hidden: boolean
  setHidden: (v: boolean) => void
  /** Фон с учётом локального выключения — его и рисуем */
  effective: BackgroundSetting
  save: (bg: BackgroundSetting) => Promise<void>
  preview: (bg: BackgroundSetting | null) => void
}

const Ctx = createContext<SettingsCtx | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [background, setBackground] = useState<BackgroundSetting>(DEFAULT_BACKGROUND)
  const [draft, setDraft] = useState<BackgroundSetting | null>(null)
  const [hidden, setHiddenState] = useState(() => {
    try {
      return localStorage.getItem(LOCAL_OFF) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    fetchBackground().then(setBackground).catch(() => setBackground(DEFAULT_BACKGROUND))
  }, [])

  const setHidden = useCallback((v: boolean) => {
    setHiddenState(v)
    try {
      localStorage.setItem(LOCAL_OFF, v ? '1' : '0')
    } catch {
      /* приватный режим */
    }
  }, [])

  const save = useCallback(async (bg: BackgroundSetting) => {
    await saveBackground(bg)
    setBackground(bg)
    setDraft(null)
  }, [])

  const shown = draft ?? background
  const effective = useMemo<BackgroundSetting>(
    () => (hidden ? { ...shown, kind: 'none' } : shown),
    [hidden, shown],
  )

  const value = useMemo<SettingsCtx>(
    () => ({ background, hidden, setHidden, effective, save, preview: setDraft }),
    [background, hidden, setHidden, effective, save],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings должен вызываться внутри SettingsProvider')
  return ctx
}
