/**
 * Номер из обновления Telegram: только свой контакт отправителя.
 * Чужой контакт можно переслать боту как обычное вложение, у него user_id другой
 * или его нет вовсе, и такой номер записывать нельзя.
 */

export interface TelegramUpdate {
  message?: {
    from?: { id?: number }
    contact?: { user_id?: number; phone_number?: string }
  }
}

export function ownPhone(update: TelegramUpdate): { telegramId: number; phone: string } | null {
  const from = update.message?.from?.id
  const contact = update.message?.contact
  if (!from || !contact || contact.user_id !== from) return null

  const digits = (contact.phone_number ?? '').replace(/\D/g, '')
  if (digits.length < 5 || digits.length > 20) return null
  return { telegramId: from, phone: `+${digits}` }
}

/** Сравнение без раннего выхода: по времени ответа секрет не подобрать */
export function sameSecret(a: string, b: string) {
  if (!b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
