import type { TermColor } from './types'

/**
 * Документ редактора в JSON — ровно то, что лежит в blocks.content.
 * Этот модуль не тянет TipTap: им пользуются и чтение, и офлайн, и поиск,
 * а сам редактор подгружается отдельным куском, только когда нужно писать.
 */
export interface DocNode {
  type?: string
  text?: string
  content?: DocNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  attrs?: Record<string, unknown>
}

/** После этих узлов в плоском тексте начинается новая строка */
const LINE_NODES = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'])

/** Плоский текст для полнотекстового поиска в Postgres */
export function contentToText(doc: unknown): string {
  const parts: string[] = []
  const walk = (node: DocNode | undefined) => {
    if (!node) return
    if (node.text) parts.push(node.text)
    if (node.type === 'hardBreak') parts.push('\n')
    if (node.type === 'image' && typeof node.attrs?.alt === 'string') parts.push(node.attrs.alt)
    if (node.content) {
      node.content.forEach(walk)
      if (LINE_NODES.has(node.type || '')) parts.push('\n')
    }
  }
  walk(doc as DocNode)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

export interface TermEntry {
  text: string
  color: TermColor
  note: string | null
}

/** Все помеченные термины документа — для списка терминов под блоком */
export function extractTerms(doc: unknown): TermEntry[] {
  const found = new Map<string, TermEntry>()
  const walk = (node: DocNode | undefined) => {
    if (!node) return
    const mark = node.marks?.find((m) => m.type === 'term')
    if (mark && node.text) {
      const color = (mark.attrs?.color as TermColor) || 'gold'
      const note = (mark.attrs?.note as string) || null
      const key = `${node.text.toLowerCase()}|${color}`
      const existing = found.get(key)
      if (!existing || (!existing.note && note)) found.set(key, { text: node.text, color, note })
    }
    node.content?.forEach(walk)
  }
  walk(doc as DocNode)
  return [...found.values()]
}

/** Адреса всех картинок документа — чтобы скачать их для чтения офлайн */
export function imageUrls(doc: unknown): string[] {
  const out: string[] = []
  const walk = (node: DocNode | undefined) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'image' && typeof node.attrs?.src === 'string') out.push(node.attrs.src)
    node.content?.forEach(walk)
  }
  walk(doc as DocNode)
  return out
}
