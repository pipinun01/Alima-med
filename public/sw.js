/*
 * Service worker: офлайн-чтение конспектов.
 *
 * Три кэша с разными правилами:
 *   shell  — оболочка приложения и собранные файлы (меняются редко, имена с хэшем);
 *   data   — ответы Supabase на чтение: дерево и блоки;
 *   media  — картинки из конспектов и шрифты.
 *
 * Записи (POST/PATCH/DELETE) и авторизация через кэш никогда не идут — только сеть.
 * При смене VERSION старые кэши удаляются целиком.
 */

const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const DATA = `data-${VERSION}`
const MEDIA = `media-${VERSION}`
const KEEP = [SHELL, DATA, MEDIA]

/** Оболочка: без неё приложение не откроется офлайн */
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png']

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

/** Свежее, если сеть есть; иначе — то, что сохранено */
async function networkFirst(cacheName, request) {
  try {
    return await put(cacheName, request, await fetch(request))
  } catch (err) {
    const cached = await match(request)
    if (cached) return cached
    throw err
  }
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

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin

  // Переход по адресу: сеть, а офлайн — сохранённая оболочка
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => put(SHELL, request, response))
        .catch(async () => (await match(request)) || (await caches.match('/index.html')) || Response.error()),
    )
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

  // Шрифты Google
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(MEDIA, request))
    return
  }

  // Картинки конспектов из хранилища Supabase — почти не меняются
  if (url.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith(cacheFirst(MEDIA, request))
    return
  }

  // Чтение данных: дерево, блоки, настройки
  if (url.pathname.startsWith('/rest/v1/')) {
    event.respondWith(networkFirst(DATA, request))
    return
  }

  // Авторизация и всё остальное — только сеть
})

self.addEventListener('message', (event) => {
  const data = event.data || {}

  if (data.type === 'SKIP_WAITING') self.skipWaiting()

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
