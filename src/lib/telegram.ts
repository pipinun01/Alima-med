/** Тонкий слой над Telegram Mini App SDK: в браузере всё превращается в no-op */

interface TgWebApp {
  initData: string
  initDataUnsafe: { user?: { id: number; first_name?: string; username?: string } }
  colorScheme: 'light' | 'dark'
  ready: () => void
  expand: () => void
  close: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  disableVerticalSwipes?: () => void
  BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void }
  HapticFeedback?: {
    impactOccurred: (s: 'light' | 'medium' | 'heavy') => void
    notificationOccurred: (t: 'error' | 'success' | 'warning') => void
    selectionChanged: () => void
  }
}

declare global {
  interface Window { Telegram?: { WebApp?: TgWebApp } }
}

export const tg = (): TgWebApp | undefined => window.Telegram?.WebApp

/** Внутри Telegram initData — строка (пусть и пустая в режиме отладки) */
export const inTelegram = (): boolean => typeof tg()?.initData === 'string'

export function initTelegram() {
  const app = tg()
  if (!app || !inTelegram()) return
  app.ready()
  app.expand()
  app.disableVerticalSwipes?.()
}

/** Красим шапку Telegram в цвет фона текущей темы */
export function syncTelegramChrome() {
  const app = tg()
  if (!app || !inTelegram()) return
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (!bg) return
  app.setHeaderColor?.(bg)
  app.setBackgroundColor?.(bg)
}

export const haptic = {
  tap: () => tg()?.HapticFeedback?.selectionChanged(),
  hit: () => tg()?.HapticFeedback?.impactOccurred('light'),
  ok:  () => tg()?.HapticFeedback?.notificationOccurred('success'),
  err: () => tg()?.HapticFeedback?.notificationOccurred('error'),
}

/** Системная кнопка «назад» Telegram, привязанная к переданному обработчику */
export function bindTelegramBack(handler: (() => void) | null) {
  const app = tg()
  if (!app || !inTelegram()) return () => {}
  if (!handler) {
    app.BackButton.hide()
    return () => {}
  }
  app.BackButton.onClick(handler)
  app.BackButton.show()
  return () => {
    app.BackButton.offClick(handler)
    app.BackButton.hide()
  }
}
