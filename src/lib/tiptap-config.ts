import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import { TermMark } from './editor'

/**
 * Набор расширений редактора. Чтение рисуется без TipTap — в render.tsx,
 * и там должны поддерживаться те же узлы и метки, что перечислены здесь.
 */
export function buildExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
      // crossorigin — чтобы ответ попал в офлайн-кэш; lazy — чтобы фото ниже экрана не тормозили
      HTMLAttributes: { crossorigin: 'anonymous', loading: 'lazy', decoding: 'async' },
    }),
    TermMark,
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ]
}
