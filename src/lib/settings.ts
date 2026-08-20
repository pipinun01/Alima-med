import { supabase, isConfigured } from './supabase'
import { describeError } from './api'
import { invalidateData } from './sw-client'

export type BackgroundPreset = 'peonies' | 'petals' | 'bloom'

export interface BackgroundSetting {
  kind: 'none' | 'preset' | 'photo'
  preset?: BackgroundPreset
  url?: string | null
  /** 0 — почти незаметно, 1 — в полную силу */
  intensity: number
  blur: number
}

export const DEFAULT_BACKGROUND: BackgroundSetting = {
  kind: 'preset',
  preset: 'peonies',
  intensity: 0.6,
  blur: 0,
}

export const PRESET_LABELS: Record<BackgroundPreset, { title: string; hint: string }> = {
  peonies: { title: 'Пионы', hint: 'Крупные векторные бутоны по краям' },
  petals:  { title: 'Лепестки', hint: 'Мелкий узор по всему полотну' },
  bloom:   { title: 'Сияние', hint: 'Мягкие цветовые пятна без фигур' },
}

export async function fetchBackground(): Promise<BackgroundSetting> {
  if (!isConfigured) return DEFAULT_BACKGROUND
  const { data, error } = await supabase
    .from('app_settings')
    .select('background')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data?.background) return DEFAULT_BACKGROUND
  return { ...DEFAULT_BACKGROUND, ...(data.background as BackgroundSetting) }
}

export async function saveBackground(background: BackgroundSetting) {
  const { error } = await supabase
    .from('app_settings')
    .update({ background, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw new Error(describeError(error))
  invalidateData('/rest/v1/app_settings')
}
