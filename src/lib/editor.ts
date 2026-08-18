import { Mark, mergeAttributes } from '@tiptap/core'
import type { TermColor } from './types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    term: {
      setTerm: (attrs: { color: TermColor; note?: string | null }) => ReturnType
      toggleTerm: (attrs: { color: TermColor; note?: string | null }) => ReturnType
      unsetTerm: () => ReturnType
    }
  }
}

/**
 * Метка термина: выделяем слово, вешаем цвет (красный / зелёный / золотой)
 * и по желанию короткую подсказку, которая всплывает при наведении.
 */
export const TermMark = Mark.create({
  name: 'term',
  inclusive: false,
  exitable: true,

  addAttributes() {
    return {
      color: {
        default: 'gold' as TermColor,
        parseHTML: (el) => el.getAttribute('data-color') || 'gold',
        renderHTML: (attrs) => ({ 'data-color': attrs.color }),
      },
      note: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-note'),
        renderHTML: (attrs) =>
          attrs.note ? { 'data-note': attrs.note, title: attrs.note } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-term]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-term': '', class: 'term' }), 0]
  },

  addCommands() {
    return {
      setTerm:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      toggleTerm:
        (attrs) =>
        ({ commands }) =>
          commands.toggleMark(this.name, attrs),
      unsetTerm:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})

/* ─── Работа с JSON-документом ProseMirror ────────────────────────────────── */

interface PmNode {
  type?: string
  text?: string
  content?: PmNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  attrs?: Record<string, unknown>
}

/** Плоский текст для полнотекстового поиска в Postgres */
export function contentToText(doc: unknown): string {
  const parts: string[] = []
  const walk = (node: PmNode | undefined) => {
    if (!node) return
    if (node.text) parts.push(node.text)
    if (node.type === 'image' && typeof node.attrs?.alt === 'string') parts.push(node.attrs.alt)
    if (node.content) {
      node.content.forEach(walk)
      if (['paragraph', 'heading', 'listItem', 'blockquote'].includes(node.type || '')) parts.push('\n')
    }
  }
  walk(doc as PmNode)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

export interface TermEntry {
  text: string
  color: TermColor
  note: string | null
}

/** Собираем все помеченные термины узла — для легенды под конспектом */
export function extractTerms(doc: unknown): TermEntry[] {
  const found = new Map<string, TermEntry>()
  const walk = (node: PmNode | undefined) => {
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
  walk(doc as PmNode)
  return [...found.values()]
}

export function isEmptyDoc(doc: unknown): boolean {
  return contentToText(doc).length === 0
}
