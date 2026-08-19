import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_BACKGROUND,
  fetchBackground,
  saveBackground,
  type BackgroundSetting,
} from '@/lib/settings'

const LOCAL_OFF = 'lichnoe-info-bg-hidden'
const LOCAL_SCALE = 'lichnoe-info-scale'

/** Ступени размера текста: от мелкого до крупного */
export const SCALES = [0.9, 1, 1.15, 1.3, 1.5] as const
export const DEFAULT_SCALE = 1

interface SettingsCtx {
  background: BackgroundSetting
  /** Локальное «выключить фон у себя», не трогая общую настройку */
  hidden: boolean
  setHidden: (v: boolean) => void
  /** Размер текста — настройка этого устройства, в базу не уходит */
  scale: number
  setScale: (v: number) => void
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
  const [scale, setScaleState] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(LOCAL_SCALE))
      return SCALES.includes(saved as (typeof SCALES)[number]) ? saved : DEFAULT_SCALE
    } catch {
      return DEFAULT_SCALE
    }
  })

  useEffect(() => {
    fetchBackground().then(setBackground).catch(() => setBackground(DEFAULT_BACKGROUND))
  }, [])

  // Масштаб раздаётся через переменную: её подхватывают блоки с классом app-zoom
  useEffect(() => {
    document.documentElement.style.setProperty('--app-zoom', String(scale))
  }, [scale])

  const setHidden = useCallback((v: boolean) => {
    setHiddenState(v)
    try {
      localStorage.setItem(LOCAL_OFF, v ? '1' : '0')
    } catch {
      /* приватный режим */
    }
  }, [])

  const setScale = useCallback((v: number) => {
    setScaleState(v)
    try {
      localStorage.setItem(LOCAL_SCALE, String(v))
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
    () => ({ background, hidden, setHidden, scale, setScale, effective, save, preview: setDraft }),
    [background, hidden, setHidden, scale, setScale, effective, save],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings должен вызываться внутри SettingsProvider')
  return ctx
}
