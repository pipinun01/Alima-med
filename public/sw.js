/*
 * Service worker: офлайн-чтение конспектов и быстрый повторный запуск.
 *
 * Три кэша с разными правилами:
 *   shell  — оболочка приложения и собранные файлы (меняются редко, имена с хэшем);
 *   data   — ответы Supabase на чтение: дерево, блоки, настройки;
 *   media  — картинки из конспектов, шрифты, скрипт Telegram.
 *
 * Данные отдаются «сначала сохранённое, потом свежее»: страница открывается
 * мгновенно из кэша, свежий ответ тянется в фоне, и если он отличается,
 * страницам уходит сообщение DATA_UPDATED — они перечитывают данные.
 * После записи приложение присылает INVALIDATE, и устаревшие ответы забываются.
 *
 * Записи (POST/PATCH/DELETE) и авторизация через кэш никогда не идут — только сеть.
 * При смене VERSION старые кэши удаляются целиком.
 */

const VERSION = 'v2'
const SHELL = `shell-${VERSION}`
const DATA = `data-${VERSION}`
const MEDIA = `media-${VERSION}`
const KEEP = [SHELL, DATA, MEDIA]

/** Оболочка: без неё приложение не откроется офлайн */
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png']

/** Сколько ждать сеть при открытии страницы, если есть сохранённая оболочка */
const NAVIGATE_TIMEOUT = 3000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Кладём в кэш по адресу-строке: так ответ не потеряется из-за заголовка Vary */
async function put(cacheName, request, response) {
  if (!response || !response.ok) return response
  const cache = await caches.open(cacheName)
  await cache.put(request.url, response.clone())
  return response
}

function match(request) {
  return caches.match(request.url, { ignoreVary: true })
}

/** Сохранённое сразу; сеть — только если в кэше пусто */
async function cacheFirst(cacheName, request) {
  const cached = await match(request)
  if (cached) return cached
  return put(cacheName, request, await fetch(request))
}

/** Отдаём сохранённое немедленно, а в фоне обновляем */
async function staleWhileRevalidate(cacheName, request) {
  const cached = await match(request)
  const network = fetch(request)
    .then((response) => put(cacheName, request, response))
    .catch(() => cached)
  return cached || network
}

function broadcast(message) {
  return self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => clients.forEach((client) => client.postMessage(message)))
}

/**
 * Данные: сохранённый ответ — сразу, свежий — в фоне. Если свежий отличается,
 * страницы узнают об этом и перечитают. Без сохранённого остаётся только сеть.
 */
async function dataStaleWhileRevalidate(request, event) {
  const cached = await match(request)
  const update = fetch(request).then(async (response) => {
    if (!response.ok) return response
    const fresh = await response.clone().text()
    const before = cached ? await cached.clone().text() : null
    await put(DATA, request, response)
    if (before !== null && before !== fresh) await broadcast({ type: 'DATA_UPDATED', url: request.url })
    return response
  })
  if (cached) {
    event.waitUntil(update.catch(() => {}))
    return cached
  }
  return update
}

/** Переход по адресу: сеть, но не дольше таймаута, если есть сохранённая оболочка */
async function navigation(request, event) {
  const network = fetch(request).then((response) => put(SHELL, request, response))
  const fallback = async () => (await match(request)) || (await caches.match('/index.html')) || null

  const cached = await fallback()
  if (!cached) return network.catch(() => Response.error())

  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NAVIGATE_TIMEOUT)
  })
  const winner = await Promise.race([network.catch(() => null), timeout])
  clearTimeout(timer)
  if (winner) return winner
  // Сеть медленная или её нет — открываем сохранённое, а свежее дотянется в фоне
  event.waitUntil(network.catch(() => {}))
  return cached
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin

  if (request.mode === 'navigate') {
    event.respondWith(navigation(request, event))
    return
  }

  if (sameOrigin) {
    // Собранные файлы Vite содержат хэш в имени — их можно смело брать из кэша
    if (url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(SHELL, request))
      return
    }
    event.respondWith(staleWhileRevalidate(SHELL, request))
    return
  }

  // Шрифты Google и скрипт Telegram: меняются редко, без них страница выглядит хуже
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    (url.hostname === 'telegram.org' && url.pathname.endsWith('/telegram-web-app.js'))
  ) {
    event.respondWith(staleWhileRevalidate(MEDIA, request))
    return
  }

  // Картинки конспектов из хранилища Supabase — адреса уникальные, содержимое не меняется
  if (url.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith(cacheFirst(MEDIA, request))
    return
  }

  // Чтение данных: дерево, блоки, настройки
  if (url.pathname.startsWith('/rest/v1/')) {
    event.respondWith(dataStaleWhileRevalidate(request, event))
    return
  }

  // Авторизация и всё остальное — только сеть
})

self.addEventListener('message', (event) => {
  const data = event.data || {}

  if (data.type === 'SKIP_WAITING') self.skipWaiting()

  /** После записи: забыть ответы, в адресе которых есть все перечисленные части */
  if (data.type === 'INVALIDATE' && Array.isArray(data.parts)) {
    event.waitUntil(
      caches.open(DATA).then(async (cache) => {
        for (const request of await cache.keys()) {
          if (data.parts.every((part) => request.url.includes(part))) await cache.delete(request)
        }
      }),
    )
  }

  /** Сколько всего сохранено — для строки «скачано столько-то» */
  if (data.type === 'CACHE_STATS' && event.ports?.[0]) {
    const port = event.ports[0]
    Promise.all(
      [DATA, MEDIA].map(async (name) => (await (await caches.open(name)).keys()).length),
    )
      .then(([data_, media]) => port.postMessage({ data: data_, media }))
      .catch(() => port.postMessage({ data: 0, media: 0 }))
  }

  /** Полная очистка сохранённого для чтения офлайн */
  if (data.type === 'CLEAR_OFFLINE' && event.ports?.[0]) {
    const port = event.ports[0]
    Promise.all([caches.delete(DATA), caches.delete(MEDIA)])
      .then(() => port.postMessage({ ok: true }))
      .catch(() => port.postMessage({ ok: false }))
  }
})
