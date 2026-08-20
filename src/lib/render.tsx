import { Fragment, type ReactNode } from 'react'
import type { DocNode } from './doc'

/**
 * Чтение без редактора.
 *
 * Документ TipTap (JSON) превращается в обычные React-элементы. Разметка
 * повторяет ту, что рисует сам редактор, поэтому в чтении и в правке всё
 * выглядит одинаково — но читателю не приходится грузить ProseMirror, а это
 * почти половина кода приложения, и не приходится держать по экземпляру
 * редактора на каждый блок.
 *
 * Набор узлов и меток здесь = набор расширений в tiptap-config.ts.
 * Добавили расширение редактору — добавьте ветку и сюда.
 */

/** Ссылки со схемой пропускаем только безопасные; без схемы (относительные) — можно */
const SAFE_SCHEME = /^(https?|mailto|tel):/i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const SAFE_IMAGE = /^https?:\/\//i

function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const href = value.trim()
  if (!href) return null
  if (HAS_SCHEME.test(href) && !SAFE_SCHEME.test(href)) return null
  return href
}

/** Размер картинки: число или строка с числом, иначе ничего */
function dimension(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/** Оборачиваем текст в метки: жирный, курсив, ссылка, термин… */
function withMarks(node: DocNode, inner: ReactNode): ReactNode {
  return (node.marks ?? []).reduceRight<ReactNode>((child, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{child}</strong>
      case 'italic':
        return <em>{child}</em>
      case 'strike':
        return <s>{child}</s>
      case 'underline':
        return <u>{child}</u>
      case 'code':
        return <code>{child}</code>
      case 'link': {
        const href = safeHref(mark.attrs?.href)
        return href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {child}
          </a>
        ) : (
          child
        )
      }
      case 'term': {
        const note = text(mark.attrs?.note)
        return (
          <span className="term" data-term="" data-color={text(mark.attrs?.color) ?? 'gold'} data-note={note} title={note}>
            {child}
          </span>
        )
      }
      default:
        return child
    }
  }, inner)
}

function children(node: DocNode): ReactNode[] | null {
  if (!node.content?.length) return null
  return node.content.map((child, i) => renderNode(child, i))
}

function renderNode(node: DocNode, key: number): ReactNode {
  switch (node.type) {
    case 'text':
      return <Fragment key={key}>{withMarks(node, node.text ?? '')}</Fragment>
    case 'hardBreak':
      return <br key={key} />
    case 'paragraph':
      // Пустой абзац в редакторе занимает строку — сохраняем это и в чтении
      return <p key={key}>{children(node) ?? <br />}</p>
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2))
      const Tag = `h${level}` as 'h2'
      return <Tag key={key}>{children(node)}</Tag>
    }
    case 'bulletList':
      return <ul key={key}>{children(node)}</ul>
    case 'orderedList': {
      const start = Number(node.attrs?.start)
      return (
        <ol key={key} start={start > 1 ? start : undefined}>
          {children(node)}
        </ol>
      )
    }
    case 'listItem':
      return <li key={key}>{children(node)}</li>
    case 'blockquote':
      return <blockquote key={key}>{children(node)}</blockquote>
    case 'codeBlock': {
      const language = text(node.attrs?.language)
      return (
        <pre key={key}>
          <code className={language ? `language-${language}` : undefined}>{children(node)}</code>
        </pre>
      )
    }
    case 'horizontalRule':
      return <hr key={key} />
    case 'image': {
      const src = node.attrs?.src
      if (typeof src !== 'string' || !SAFE_IMAGE.test(src)) return null
      return (
        <img
          key={key}
          src={src}
          alt={text(node.attrs?.alt) ?? ''}
          title={text(node.attrs?.title)}
          width={dimension(node.attrs?.width)}
          height={dimension(node.attrs?.height)}
          // crossorigin: так ответ попадает в офлайн-кэш; lazy: фото ниже экрана не тормозят страницу
          crossOrigin="anonymous"
          loading="lazy"
          decoding="async"
        />
      )
    }
    default:
      // Незнакомый узел не должен ломать страницу — показываем хотя бы содержимое
      return node.content ? <div key={key}>{children(node)}</div> : null
  }
}

/** Документ блока → элементы для чтения. Пустой или чужой объект → ничего. */
export function renderDoc(doc: unknown): ReactNode {
  if (!doc || typeof doc !== 'object') return null
  const root = doc as DocNode
  if (root.type !== 'doc') return null
  return children(root)
}
