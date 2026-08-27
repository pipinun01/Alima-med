import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_BACKGROUND,
  fetchBackground,
  saveBackground,
  type BackgroundSetting,
} from '@/lib/settings'
import { onDataUpdated } from '@/lib/sw-client'

const LOCAL_OFF = 'lichnoe-info-bg-hidden'
const LOCAL_SCALE = 'lichnoe-info-scale'
const LOCAL_NOTE_SIZE = 'lichnoe-info-note-size'
const LOCAL_NOTE_LEADING = 'lichnoe-info-note-leading'

/** Ступени размера текста: от мелкого до крупного */
export const SCALES = [0.9, 1, 1.15, 1.3, 1.5] as const
export const DEFAULT_SCALE = 1

/** Размер текста конспекта в px — отдельно от общего масштаба, только для чтения и правки */
export const NOTE_SIZES = [14, 15, 16, 17, 18, 20] as const
export const DEFAULT_NOTE_SIZE = 16

/** Межстрочное текста конспекта: «компактно» — как в Telegram */
export type NoteLeading = 'compact' | 'normal' | 'loose'
export const NOTE_LEADINGS: Record<NoteLeading, { label: string; value: number }> = {
  compact: { label: 'Компактно', value: 1.45 },
  normal:  { label: 'Обычно',    value: 1.65 },
  loose:   { label: 'Свободно',  value: 1.85 },
}
export const DEFAULT_NOTE_LEADING: NoteLeading = 'compact'

function readLocal<T>(key: string, parse: (raw: string | null) => T): T {
  try {
    return parse(localStorage.getItem(key))
  } catch {
    return parse(null)
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* приватный режим */
  }
}

interface SettingsCtx {
  background: BackgroundSetting
  /** Локальное «выключить фон у себя», не трогая общую настройку */
  hidden: boolean
  setHidden: (v: boolean) => void
  /** Размер текста — настройка этого устройства, в базу не уходит */
  scale: number
  setScale: (v: number) => void
  /** Размер и межстрочное текста конспекта — тоже настройка этого устройства */
  noteSize: number
  setNoteSize: (v: number) => void
  noteLeading: NoteLeading
  setNoteLeading: (v: NoteLeading) => void
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

  const [noteSize, setNoteSizeState] = useState<number>(() =>
    readLocal(LOCAL_NOTE_SIZE, (raw) => {
      const n = Number(raw)
      return NOTE_SIZES.includes(n as (typeof NOTE_SIZES)[number]) ? n : DEFAULT_NOTE_SIZE
    }),
  )
  const [noteLeading, setNoteLeadingState] = useState<NoteLeading>(() =>
    readLocal(LOCAL_NOTE_LEADING, (raw) => (raw && raw in NOTE_LEADINGS ? (raw as NoteLeading) : DEFAULT_NOTE_LEADING)),
  )

  useEffect(() => {
    fetchBackground().then(setBackground).catch(() => setBackground(DEFAULT_BACKGROUND))
  }, [])

  // Редактор сменил фон с другого устройства — service worker заметит и сообщит
  useEffect(
    () => onDataUpdated((url) => {
      if (url.includes('/rest/v1/app_settings')) fetchBackground().then(setBackground).catch(() => {})
    }),
    [],
  )

  // Масштаб раздаётся через переменную: её подхватывают блоки с классом app-zoom
  useEffect(() => {
    document.documentElement.style.setProperty('--app-zoom', String(scale))
  }, [scale])

  useEffect(() => {
    document.documentElement.style.setProperty('--note-size', String(noteSize))
    document.documentElement.style.setProperty('--note-leading', String(NOTE_LEADINGS[noteLeading].value))
  }, [noteSize, noteLeading])

  const setNoteSize = useCallback((v: number) => {
    setNoteSizeState(v)
    writeLocal(LOCAL_NOTE_SIZE, String(v))
  }, [])

  const setNoteLeading = useCallback((v: NoteLeading) => {
    setNoteLeadingState(v)
    writeLocal(LOCAL_NOTE_LEADING, v)
  }, [])

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
    () => ({
      background, hidden, setHidden, scale, setScale,
      noteSize, setNoteSize, noteLeading, setNoteLeading,
      effective, save, preview: setDraft,
    }),
    [background, hidden, setHidden, scale, setScale, noteSize, setNoteSize, noteLeading, setNoteLeading, effective, save],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings должен вызываться внутри SettingsProvider')
  return ctx
}
