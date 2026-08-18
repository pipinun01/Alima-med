import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined

/**
 * Supabase переводит проекты на publishable-ключи (sb_publishable_…) вместо
 * прежнего anon. Оба работают одинаково, поэтому принимаем любое из двух имён.
 */
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

/** Приложение запущено без ключей — покажем экран настройки вместо ошибок */
export const isConfigured = Boolean(url && key)

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
)

export const STORAGE_BUCKET = 'notes'
