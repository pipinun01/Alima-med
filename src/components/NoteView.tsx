import { useEffect, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { buildExtensions } from '@/lib/tiptap-config'
import { Lightbox } from './Lightbox'

/** Только чтение: тот же набор расширений, что и в редакторе, чтобы вёрстка совпадала */
export function NoteView({ content }: { content: unknown }) {
  const [zoom, setZoom] = useState<string | null>(null)

  const editor = useEditor(
    {
      extensions: buildExtensions(),
      content: (content as never) ?? '',
      editable: false,
      immediatelyRender: true,
    },
    [],
  )

  useEffect(() => {
    if (!editor) return
    const current = JSON.stringify(editor.getJSON())
    const next = JSON.stringify(content ?? { type: 'doc', content: [] })
    if (current !== next) editor.commands.setContent((content as never) ?? '', { emitUpdate: false })
  }, [content, editor])

  return (
    <>
      <div
        className="prose prose-note max-w-none"
        onClick={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName === 'IMG') setZoom((target as HTMLImageElement).src)
        }}
      >
        <EditorContent editor={editor} />
      </div>
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </>
  )
}
