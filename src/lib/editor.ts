import { Mark, mergeAttributes } from '@tiptap/core'
import type { TermColor } from './types'

/*
 * Этот файл тянет TipTap, поэтому его импортирует только редактор.
 * Всё, что нужно для чтения и поиска без TipTap, лежит в doc.ts и render.tsx.
 */

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
 * и по желанию короткую подсказку — она показывается в списке терминов под блоком.
 * Разметка в чтении повторяется в render.tsx (case 'term').
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
