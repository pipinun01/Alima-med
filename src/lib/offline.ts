/**
 * Офлайн-режим: регистрация service worker и «скачать всё для чтения».
 *
 * Сам по себе service worker сохраняет то, что вы уже открывали. Чтобы конспект
 * читался и в дороге, есть кнопка: она проходит по всем карточкам, тянет блоки
 * и фотографии — дальше их отдаёт кэш, даже когда сети нет.
 */

import * as api from './api'
import { imageUrls } from './doc'
import { askWorker } from './sw-client'

const SAVED_AT = 'lichnoe-info-offline-at'

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  // В разработке кэш только мешает: файлы меняются на каждом сохранении
  if (!import.meta.env.PROD) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* не поддерживается или заблокировано — приложение работает и без этого */
    })
  })
}

export const offlineSupported = () => 'serviceWorker' in navigator && 'caches' in window

export interface OfflineStats {
  /** Сколько ответов с данными сохранено */
  data: number
  /** Сколько картинок и шрифтов сохранено */
  media: number
  /** Когда последний раз скачивали целиком */
  savedAt: string | null
}

export async function offlineStats(): Promise<OfflineStats> {
  const counts = await askWorker({ type: 'CACHE_STATS' }, { data: 0, media: 0 })
  return { ...counts, savedAt: readSavedAt() }
}

export async function clearOffline() {
  await askWorker({ type: 'CLEAR_OFFLINE' }, { ok: false })
  try {
    localStorage.removeItem(SAVED_AT)
  } catch {
    /* приватный режим */
  }
}

function readSavedAt(): string | null {
  try {
    return localStorage.getItem(SAVED_AT)
  } catch {
    return null
  }
}

/** Выполняет задачи пачками, чтобы не заваливать сеть сотней запросов разом */
async function inBatches<T>(tasks: (() => Promise<T>)[], size = 4, onStep?: () => void) {
  const results: T[] = []
  for (let i = 0; i < tasks.length; i += size) {
    const batch = await Promise.all(
      tasks.slice(i, i + size).map((task) =>
        task()
          .catch(() => null)
          .finally(() => onStep?.()),
      ),
    )
    results.push(...(batch.filter((r) => r !== null) as T[]))
  }
  return results
}

export interface PrefetchProgress {
  done: number
  total: number
  stage: 'cards' | 'images'
}

/**
 * Скачивает блоки всех карточек, а затем их фотографии.
 * Возвращает, сколько карточек и картинок удалось сохранить.
 */
export async function prefetchForOffline(
  cardIds: string[],
  onProgress?: (p: PrefetchProgress) => void,
) {
  let done = 0
  const blocks = await inBatches(
    cardIds.map((id) => () => api.fetchBlocks(id)),
    4,
    () => onProgress?.({ done: ++done, total: cardIds.length, stage: 'cards' }),
  )

  const urls = [...new Set(blocks.flat().flatMap((block) => imageUrls(block.content)))]
  let images = 0
  await inBatches(
    // cors — тот же режим, что у <img crossorigin>: ответ ляжет в кэш и подойдёт картинкам
    urls.map((url) => () => fetch(url, { mode: 'cors', cache: 'no-cache' })),
    4,
    () => onProgress?.({ done: ++images, total: urls.length, stage: 'images' }),
  )

  try {
    localStorage.setItem(SAVED_AT, new Date().toISOString())
  } catch {
    /* приватный режим */
  }

  return { cards: cardIds.length, images: urls.length }
}
