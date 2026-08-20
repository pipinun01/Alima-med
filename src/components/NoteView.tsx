import { useMemo, useState } from 'react'
import { renderDoc } from '@/lib/render'
import { extractTerms } from '@/lib/doc'
import { Lightbox } from './Lightbox'

/**
 * Только чтение. Документ рисуется статически (render.tsx), без экземпляра
 * редактора: на телефоне это заметно легче, а разметка та же, что в редакторе.
 */
export function NoteView({ content }: { content: unknown }) {
  const [zoom, setZoom] = useState<string | null>(null)

  const body = useMemo(() => renderDoc(content), [content])
  // Подсказки к терминам: на телефоне всплывашки по наведению нет, поэтому список под текстом
  const terms = useMemo(() => extractTerms(content).filter((t) => t.note), [content])

  return (
    <>
      <div
        className="prose prose-note note-body max-w-none"
        onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName === 'IMG') setZoom((target as HTMLImageElement).src)
        }}
      >
        {body}
      </div>

      {terms.length > 0 && (
        <dl className="mt-4 space-y-1.5 border-t border-[var(--line)] pt-3 text-[13.5px] leading-relaxed">
          {terms.map((term) => (
            <div key={`${term.text}|${term.color}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <dt className="shrink-0">
                <span className="term text-[12.5px]" data-color={term.color}>
                  {term.text}
                </span>
              </dt>
              <dd className="min-w-0 text-[var(--fg-soft)]">{term.note}</dd>
            </div>
          ))}
        </dl>
      )}

      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </>
  )
}
