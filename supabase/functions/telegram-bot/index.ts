/**
 * Вебхук бота: сохраняет номер телефона, которым человек поделился сам.
 *
 * Кнопка в профиле вызывает requestContact, Telegram спрашивает согласие и присылает
 * контакт боту сообщением. Берём номер отсюда, а не из приложения: документация не
 * описывает подпись контакта, а всё, что приходит из приложения без подписи, можно подделать.
 *
 * Разворачивается с --no-verify-jwt: Telegram не шлёт JWT. Вместо этого он шлёт секрет
 * TELEGRAM_WEBHOOK_SECRET, заданный в setWebhook. Токен бота здесь не нужен.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { ownPhone, sameSecret, type TelegramUpdate } from './contact.ts'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Нужен POST', { status: 405 })

  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? ''
  const given = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
  if (!sameSecret(given, secret)) return new Response('Нет доступа', { status: 401 })

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return new Response('ok') // Повтор не поможет: Telegram пришлёт то же самое
  }

  const found = ownPhone(update)
  if (!found) return new Response('ok') // Остальные сообщения боту нас не касаются

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // Кто ещё не открывал приложение, того в таблице нет: обновится ноль строк, и это нормально
  const { error } = await admin
    .from('telegram_accounts')
    .update({ phone: found.phone, updated_at: new Date().toISOString() })
    .eq('telegram_id', found.telegramId)
  if (error) {
    console.error('telegram_accounts', error.message)
    return new Response('Не удалось сохранить', { status: 500 }) // Telegram повторит позже
  }
  return new Response('ok')
})
