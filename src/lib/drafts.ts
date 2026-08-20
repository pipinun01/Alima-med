import type { TermColor } from './types'

/**
 * Черновики блоков — то, что набрано, но ещё не сохранено на сервер.
 *
 * Телефон легко выгружает вкладку, пока ищешь картинку в другом приложении,
 * а Telegram закрывает мини-приложение свайпом. Чтобы длинный блок не пропал,
 * текст по ходу набора откладывается в localStorage этого устройства, а при
 * следующем открытии редактора предлагается восстановить.
 */

const PREFIX = 'lichnoe-info-draft:'

export interface BlockDraft {
  label: string
  color: TermColor
  content: unknown
  savedAt: string
}

/** Ключ: у существующего блока — его id, у нового — карточка, в которой его начали */
export const draftKey = (blockId: string | null, nodeId: string) =>
  PREFIX + (blockId ? `block:${blockId}` : `new:${nodeId}`)

export function readDraft(key: string): BlockDraft | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const draft = JSON.parse(raw) as BlockDraft
    return draft && typeof draft === 'object' && 'content' in draft ? draft : null
  } catch {
    return null
  }
}

export function writeDraft(key: string, draft: Omit<BlockDraft, 'savedAt'>) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }))
  } catch {
    /* приватный режим или переполнено — просто без черновика */
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* приватный режим */
  }
}
