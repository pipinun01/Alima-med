/**
 * Вход через Telegram: подписанные данные Mini App меняются на сессию Supabase.
 *
 * Сессию получает любой, кто открыл бота, и сразу становится читателем: так решает
 * is_reader() в базе, по строке в telegram_accounts. Править может только тот, кто
 * есть в editors.
 *
 * Разворачивается с --no-verify-jwt: человек приходит сюда ещё без сессии, а
 * publishable-ключ не JWT, и шлюз отверг бы такой запрос.
 * Нужен секрет TELEGRAM_BOT_TOKEN. SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY
 * Supabase подставляет в функции сам.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyInitData } from './verify.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return reply({ error: 'Нужен POST' }, 405)

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!botToken) return reply({ error: 'На сервере не задан токен бота' }, 500)

  let initData = ''
  try {
    initData = String((await request.json()).initData ?? '')
  } catch {
    return reply({ error: 'Неверный запрос' }, 400)
  }

  const user = await verifyInitData(initData, botToken)
  if (!user) return reply({ error: 'Telegram не подтвердил вход. Закройте приложение и откройте заново' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Почта служебная и нигде не используется: Supabase нужен какой-то адрес, письма на него не уходят
  const email = `tg${user.id}@tg.alima-med.vercel.app`

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { telegram_id: user.id },
  })
  if (created.error && created.error.code !== 'email_exists') {
    console.error('createUser', created.error.message)
    return reply({ error: 'Не удалось создать аккаунт' }, 500)
  }

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error || !link.data.user) {
    console.error('generateLink', link.error?.message)
    return reply({ error: 'Не удалось войти' }, 500)
  }

  // Имя и @username обновляем при каждом входе: человек мог их сменить
  const account = await admin.from('telegram_accounts').upsert({
    telegram_id: user.id,
    user_id: link.data.user.id,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    username: user.username ?? null,
    updated_at: new Date().toISOString(),
  })
  if (account.error) {
    console.error('telegram_accounts', account.error.message)
    return reply({ error: 'Не удалось сохранить аккаунт' }, 500)
  }

  const verified = await admin.auth.verifyOtp({ type: 'email', token_hash: link.data.properties.hashed_token })
  if (verified.error || !verified.data.session) {
    console.error('verifyOtp', verified.error?.message)
    return reply({ error: 'Не удалось войти' }, 500)
  }

  const { access_token, refresh_token } = verified.data.session
  return reply({ access_token, refresh_token })
})
