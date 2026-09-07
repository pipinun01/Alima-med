/**
 * «Вкладку открыли снова» — повод перечитать данные.
 *
 * Дерево и блоки читаются один раз при запуске, а телефон держит приложение
 * открытым сутками: конспект, дополненный с другого устройства, до перезагрузки
 * страницы так и не появлялся. Здесь один общий слушатель на всех подписчиков —
 * перечитывают они всё равно через service worker, то есть сначала из кэша.
 *
 * Слушаем и `visibilitychange`, и `pageshow`: возврат кнопкой «назад» поднимает
 * страницу из bfcache, и видимость при этом не меняется вовсе.
 */

type Listener = () => void

const listeners = new Set<Listener>()

/** Мелькание между вкладками — не новый заход; чаще этого не перечитываем */
const QUIET_MS = 20_000

/** Считаем от загрузки: данные только что прочитаны, сразу повторять незачем */
let lastRun = Date.now()
let bound = false

function fire() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  const now = Date.now()
  if (now - lastRun < QUIET_MS) return
  lastRun = now
  listeners.forEach((fn) => fn())
}

export function onReturn(listener: Listener) {
  if (!bound && typeof document !== 'undefined') {
    bound = true
    document.addEventListener('visibilitychange', fire)
    window.addEventListener('pageshow', (event) => {
      if ((event as PageTransitionEvent).persisted) fire()
    })
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
