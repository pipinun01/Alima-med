/** Тонкий слой над Telegram Mini App SDK: в браузере всё превращается в no-op */

import { useEffect, useRef } from 'react'

export type HomeScreenStatus = 'unsupported' | 'unknown' | 'added' | 'missed'

interface TgWebApp {
  initData: string
  initDataUnsafe: {
    user?: { id: number; first_name?: string; last_name?: string; username?: string }
    start_param?: string
  }
  platform?: string
  colorScheme: 'light' | 'dark'
  isVersionAtLeast: (version: string) => boolean
  ready: () => void
  expand: () => void
  close: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  setBottomBarColor?: (color: string) => void
  disableVerticalSwipes?: () => void
  enableClosingConfirmation: () => void
  disableClosingConfirmation: () => void
  openLink: (url: string) => void
  openTelegramLink: (url: string) => void
  addToHomeScreen?: () => void
  checkHomeScreenStatus?: (callback: (status: HomeScreenStatus) => void) => void
  onEvent: (event: string, callback: () => void) => void
  offEvent: (event: string, callback: () => void) => void
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

/**
 * Скрипт telegram-web-app.js подключён всегда, и в обычном браузере он тоже
 * создаёт window.Telegram.WebApp — с пустым initData и platform = 'unknown'.
 * Внутри Telegram initData непустой, а platform — ios / android / tdesktop…
 */
export const inTelegram = (): boolean => {
  const app = tg()
  if (!app) return false
  return Boolean(app.initData) || Boolean(app.platform && app.platform !== 'unknown')
}

const miniApp = () => (inTelegram() ? tg() : undefined)

const BOT_URL = 'https://t.me/alima_dem_bot'

/** Ссылка, которая открывает приложение внутри бота. code уходит в приложение как приглашение */
export const botLink = (code?: string) => (code ? `${BOT_URL}?startapp=${code}` : BOT_URL)

export const telegramInitData = () => miniApp()?.initData ?? ''
export const telegramUser = () => miniApp()?.initDataUnsafe.user
export const telegramStartParam = () => miniApp()?.initDataUnsafe.start_param ?? ''

const isTelegramHost = (host: string) => host === 't.me' || host === 'telegram.me'

/**
 * Внешняя ссылка в Mini App должна уходить через SDK: в окошке Telegram обычный
 * переход с target="_blank" либо ничего не делает, либо подменяет само приложение.
 * Ссылки на t.me без target="_blank" SDK ловит сам и зовёт preventDefault —
 * поэтому такие клики здесь пропускаем, иначе откроется дважды.
 */
function openExternalLinks(app: TgWebApp) {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey) return
    const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]')
    if (!link || link.closest('.ProseMirror')) return
    if (link.protocol !== 'http:' && link.protocol !== 'https:') return
    if (link.origin === window.location.origin) return
    event.preventDefault()
    if (isTelegramHost(link.hostname)) app.openTelegramLink(link.href)
    else app.openLink(link.href)
  })
}

let started = false

export function initTelegram() {
  const app = miniApp()
  if (!app || started) return
  started = true
  app.ready()
  app.expand()
  if (app.isVersionAtLeast('7.7')) app.disableVerticalSwipes?.()
  openExternalLinks(app)
}

/** Красим шапку и нижнюю панель Telegram в цвет фона текущей темы */
export function syncTelegramChrome() {
  const app = miniApp()
  if (!app) return
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (!bg) return
  // До 6.9 SDK принимает только свои ключи цвета, а на чужом значении бросает ошибку
  if (app.isVersionAtLeast('6.9')) app.setHeaderColor?.(bg)
  if (app.isVersionAtLeast('6.1')) app.setBackgroundColor?.(bg)
  if (app.isVersionAtLeast('7.10')) app.setBottomBarColor?.(bg)
}

/** Вибрация только внутри Telegram: в браузере SDK лишь сыпал бы предупреждениями в консоль */
const feedback = () => miniApp()?.HapticFeedback

export const haptic = {
  tap: () => feedback()?.selectionChanged(),
  hit: () => feedback()?.impactOccurred('light'),
  ok:  () => feedback()?.notificationOccurred('success'),
  err: () => feedback()?.notificationOccurred('error'),
}

/*
 * Кнопка «назад». Пока она скрыта, на её месте у Telegram стоит «Закрыть» —
 * то есть любой экран без «назад» закрывается вместе с приложением. Обработчик
 * у SDK один и не меняется: он зовёт то, что сейчас сверху. Окна лежат стопкой
 * над страницей, так что страница может перепривязаться (дерево перечиталось),
 * не перехватив кнопку у открытого окна.
 */
let pageBack: (() => void) | null = null
const overlayBacks: (() => void)[] = []
let backBound = false

const activeBack = () => overlayBacks[overlayBacks.length - 1] ?? pageBack

function syncBackButton(app: TgWebApp) {
  if (!backBound) {
    backBound = true
    app.BackButton.onClick(() => activeBack()?.())
  }
  if (activeBack()) app.BackButton.show()
  else app.BackButton.hide()
}

/** Куда ведёт «назад» с текущей страницы. Вызывать в useEffect, вернёт отписку */
export function bindTelegramBack(handler: () => void) {
  const app = miniApp()
  if (!app) return () => {}
  pageBack = handler
  syncBackButton(app)
  return () => {
    if (pageBack === handler) pageBack = null
    syncBackButton(app)
  }
}

/** Пока окно открыто, «назад» закрывает его, а не уводит со страницы */
export function useTelegramOverlay(open: boolean, onClose: () => void) {
  const latest = useRef(onClose)
  useEffect(() => {
    latest.current = onClose
  })
  useEffect(() => {
    const app = miniApp()
    if (!open || !app) return
    const handler = () => latest.current()
    overlayBacks.push(handler)
    syncBackButton(app)
    return () => {
      overlayBacks.splice(overlayBacks.indexOf(handler), 1)
      syncBackButton(app)
    }
  }, [open])
}

/** Выбор чата для пересылки ссылки. false — мы не в Mini App */
export function shareViaTelegram(url: string, text: string) {
  const app = miniApp()
  if (!app) return false
  app.openTelegramLink(
    `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  )
  return true
}

/** Telegram спросит подтверждение при закрытии — замена beforeunload, которого в Mini App нет */
export function guardTelegramClose() {
  const app = miniApp()
  if (!app?.isVersionAtLeast('6.2')) return () => {}
  app.enableClosingConfirmation()
  return () => app.disableClosingConfirmation()
}

const homeScreenApp = () => {
  const app = miniApp()
  return app?.isVersionAtLeast('8.0') ? app : undefined
}

/** Есть ли значок приложения на экране телефона. Клиент может не ответить — тогда 'unknown' */
export function homeScreenStatus(): Promise<HomeScreenStatus> {
  const app = homeScreenApp()
  if (!app?.checkHomeScreenStatus) return Promise.resolve('unsupported')
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('unknown'), 1500)
    app.checkHomeScreenStatus?.((status) => {
      clearTimeout(timer)
      resolve(status)
    })
  })
}

/** Просим Telegram добавить значок; onAdded — когда он подтвердит */
export function addToHomeScreen(onAdded: () => void) {
  const app = homeScreenApp()
  if (!app?.addToHomeScreen) return
  const added = () => {
    app.offEvent('homeScreenAdded', added)
    onAdded()
  }
  app.onEvent('homeScreenAdded', added)
  app.addToHomeScreen()
}
