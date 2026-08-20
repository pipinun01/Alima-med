/**
 * Разговор приложения со service worker.
 *
 * Сам worker живёт в public/sw.js и правила кэширования держит у себя; здесь
 * только три вещи: спросить его о чём-то, попросить забыть сохранённые ответы
 * после записи и подписаться на сообщение «данные на сервере изменились».
 */

const worker = () => ('serviceWorker' in navigator ? navigator.serviceWorker.controller : null)

/** Вопрос → ответ через одноразовый канал; без worker'а или по таймауту — запасное значение */
export function askWorker<T>(message: { type: string }, fallback: T, timeout = 3000): Promise<T> {
  const target = worker()
  if (!target) return Promise.resolve(fallback)
  return new Promise<T>((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(fallback), timeout)
    channel.port1.onmessage = (event) => {
      clearTimeout(timer)
      resolve((event.data as T) ?? fallback)
    }
    target.postMessage(message, [channel.port2])
  })
}

/**
 * После записи просим забыть сохранённые ответы, в адресе которых есть все
 * перечисленные части. Иначе после правки можно было бы увидеть старую версию.
 */
export function invalidateData(...parts: string[]) {
  worker()?.postMessage({ type: 'INVALIDATE', parts })
}

type Listener = (url: string) => void
const listeners = new Set<Listener>()
let bound = false

/**
 * Worker отдаёт сохранённый ответ сразу, а свежий тянет в фоне; если они
 * отличаются, приходит сообщение DATA_UPDATED — и страница перечитывает данные.
 */
export function onDataUpdated(listener: Listener) {
  if (!bound && 'serviceWorker' in navigator) {
    bound = true
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data as { type?: string; url?: string } | undefined
      if (data?.type === 'DATA_UPDATED' && typeof data.url === 'string') {
        listeners.forEach((fn) => fn(data.url as string))
      }
    })
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
