/**
 * Проверка данных, которые Telegram передаёт в Mini App (initData).
 * Подпись считается токеном бота, поэтому подделать её без токена нельзя.
 * Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

export interface TelegramUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}

const encoder = new TextEncoder()

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)))
}

const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

/** Сравнение без раннего выхода: по времени ответа подпись не подобрать */
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Человек из подписанных данных; null — подпись неверна, данные устарели или неполны */
export async function verifyInitData(
  initData: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 86400,
): Promise<TelegramUser | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const checkString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n')

  const secret = await hmac(encoder.encode('WebAppData'), botToken)
  const expected = toHex(await hmac(secret, checkString))
  if (!sameText(expected, hash.toLowerCase())) return null

  const authDate = Number(params.get('auth_date'))
  if (!authDate || nowSeconds - authDate > maxAgeSeconds) return null

  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null
    return user && Number.isSafeInteger(user.id) ? user : null
  } catch {
    return null
  }
}
