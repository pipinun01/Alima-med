import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import {
  Bold, Check, Code, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered,
  MessageSquareText, Minus, Quote, Redo2, Strikethrough, Tag, Undo2, X,
} from 'lucide-react'
import { buildExtensions } from '@/lib/tiptap-config'
import { uploadImage } from '@/lib/api'
import { TERM_LABELS, type TermColor } from '@/lib/types'
import { haptic } from '@/lib/telegram'
import { Button, ErrorNote, Modal, Spinner } from './ui'

const TERM_SWATCH: Record<TermColor, string> = {
  red: 'var(--term-red-fg)',
  green: 'var(--term-green-fg)',
  gold: 'var(--term-gold-fg)',
}

function ToolButton({
  active,
  label,
  onClick,
  disabled,
  children,
}: {
  active?: boolean
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg transition-colors duration-120
        disabled:opacity-35 disabled:pointer-events-none
        ${
          active
            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'text-[var(--fg-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]'
        }`}
    >
      {children}
    </button>
  )
}

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-[var(--line)]" />

function Toolbar({
  editor,
  onPickImage,
  uploading,
  onEditTermNote,
}: {
  editor: Editor
  onPickImage: () => void
  uploading: boolean
  onEditTermNote: () => void
}) {
  const [, force] = useState(0)
  useEffect(() => {
    const rerender = () => force((n) => n + 1)
    editor.on('selectionUpdate', rerender)
    editor.on('transaction', rerender)
    return () => {
      editor.off('selectionUpdate', rerender)
      editor.off('transaction', rerender)
    }
  }, [editor])

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Ссылка (пусто — убрать)', previous ?? 'https://')
    if (url === null) return
    if (url === '') return void editor.chain().focus().unsetMark('link').run()
    editor.chain().focus().setMark('link', { href: url }).run()
  }

  const inTerm = editor.isActive('term')

  return (
    <div
      className="glass sticky top-15 z-20 -mx-1 flex flex-wrap items-center gap-0.5
        rounded-xl border border-[var(--line)] px-1.5 py-1.5 shadow-[var(--shadow-sm)]"
    >
      <ToolButton label="Отменить" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 size={16} />
      </ToolButton>
      <ToolButton label="Повторить" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 size={16} />
      </ToolButton>

      <Divider />

      <ToolButton label="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={16} />
      </ToolButton>
      <ToolButton label="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={16} />
      </ToolButton>
      <ToolButton label="Зачёркнутый" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough size={16} />
      </ToolButton>
      <ToolButton label="Моноширинный" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code size={16} />
      </ToolButton>

      <Divider />

      <ToolButton label="Заголовок" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 size={16} />
      </ToolButton>
      <ToolButton label="Подзаголовок" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 size={16} />
      </ToolButton>
      <ToolButton label="Список" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={16} />
      </ToolButton>
      <ToolButton label="Нумерованный список" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={16} />
      </ToolButton>
      <ToolButton label="Цитата" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote size={16} />
      </ToolButton>
      <ToolButton label="Разделитель" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus size={16} />
      </ToolButton>

      <Divider />

      {/* Метки терминов */}
      {(Object.keys(TERM_LABELS) as TermColor[]).map((color) => (
        <ToolButton
          key={color}
          label={`${TERM_LABELS[color].name} — ${TERM_LABELS[color].hint}`}
          active={editor.isActive('term', { color })}
          onClick={() => {
            haptic.tap()
            const note = (editor.getAttributes('term').note as string | null) ?? null
            editor.chain().focus().toggleTerm({ color, note }).run()
          }}
        >
          <Tag size={16} style={{ color: TERM_SWATCH[color] }} fill={editor.isActive('term', { color }) ? TERM_SWATCH[color] : 'none'} />
        </ToolButton>
      ))}
      <ToolButton label="Подсказка к термину" disabled={!inTerm} onClick={onEditTermNote}>
        <MessageSquareText size={16} />
      </ToolButton>
      <ToolButton label="Снять метку" disabled={!inTerm} onClick={() => editor.chain().focus().unsetTerm().run()}>
        <X size={16} />
      </ToolButton>

      <Divider />

      <ToolButton label="Ссылка" active={editor.isActive('link')} onClick={setLink}>
        <Link2 size={16} />
      </ToolButton>
      <ToolButton label="Вставить фото" onClick={onPickImage} disabled={uploading}>
        {uploading ? <Spinner /> : <ImagePlus size={16} />}
      </ToolButton>
    </div>
  )
}

export function NoteEditor({
  initialContent,
  onSave,
  onCancel,
  saving,
  error,
  header,
  placeholder,
  extraActions,
  onChange,
  replace,
}: {
  initialContent: unknown
  onSave: (json: unknown) => void | Promise<void>
  onCancel: () => void
  saving: boolean
  /** Почему не сохранилось — показывается под кнопками, текст остаётся в редакторе */
  error?: string | null
  /** Поля над текстом — например метка и цвет блока */
  header?: React.ReactNode
  placeholder?: string
  extraActions?: React.ReactNode
  /** Каждая правка текста — сюда; так пишется черновик */
  onChange?: (json: unknown) => void
  /** Подменить текст снаружи (восстановить черновик): новое значение version — новая подмена */
  replace?: { content: unknown; version: number } | null
}) {
  const [uploading, setUploading] = useState(false)
  const [termModal, setTermModal] = useState(false)
  const [termNote, setTermNote] = useState('')
  const [dirty, setDirty] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  const editor = useEditor({
    extensions: buildExtensions(
      placeholder ?? 'Пишите конспект. Выделите термин и нажмите цветную метку, чтобы не спутать его с другими.',
    ),
    content: (initialContent as never) ?? '',
    editable: true,
    immediatelyRender: true,
    onUpdate: ({ editor: current }) => {
      setDirty(true)
      onChangeRef.current?.(current.getJSON())
    },
    editorProps: {
      attributes: { class: 'prose prose-note max-w-none focus:outline-none' },
      handlePaste(_view, event) {
        const file = [...(event.clipboardData?.items ?? [])]
          .find((i) => i.type.startsWith('image/'))
          ?.getAsFile()
        if (!file) return false
        void insertImage(file)
        return true
      },
      handleDrop(_view, event) {
        const file = [...((event as DragEvent).dataTransfer?.files ?? [])].find((f) =>
          f.type.startsWith('image/'),
        )
        if (!file) return false
        event.preventDefault()
        void insertImage(file)
        return true
      },
    },
  })

  // Восстановление черновика: содержимое подменяется снаружи
  const appliedVersion = useRef(0)
  useEffect(() => {
    if (!editor || !replace || replace.version === appliedVersion.current) return
    appliedVersion.current = replace.version
    editor.commands.setContent((replace.content as never) ?? '', { emitUpdate: false })
    setDirty(true)
  }, [editor, replace])

  const insertImage = useCallback(
    async (file: File) => {
      if (!editor) return
      setUploading(true)
      try {
        const { url, width, height } = await uploadImage(file)
        editor
          .chain()
          .focus()
          .setImage({ src: url, width: width ?? undefined, height: height ?? undefined })
          .run()
        haptic.ok()
      } catch (e) {
        haptic.err()
        window.alert(`Не удалось загрузить фото: ${e instanceof Error ? e.message : 'ошибка'}`)
      } finally {
        setUploading(false)
      }
    },
    [editor],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (editor && !saving) void onSave(editor.getJSON())
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editor, onSave, saving])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!editor) return null

  return (
    <div className="animate-fade-up">
      <Toolbar
        editor={editor}
        uploading={uploading}
        onPickImage={() => fileRef.current?.click()}
        onEditTermNote={() => {
          setTermNote((editor.getAttributes('term').note as string) ?? '')
          setTermModal(true)
        }}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void insertImage(file)
          e.target.value = ''
        }}
      />

      {header && <div className="mt-4">{header}</div>}

      <div
        className="mt-3 rounded-[var(--radius-card)] border border-[var(--line)]
          bg-[var(--bg-card)] px-4 py-4 sm:px-6 sm:py-6"
      >
        <EditorContent editor={editor} />
      </div>

      {error && <ErrorNote className="mt-4">{error}</ErrorNote>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => void onSave(editor.getJSON())} disabled={saving}>
          {saving ? <Spinner /> : <Check size={16} />}
          {saving ? 'Сохраняю…' : error ? 'Попробовать ещё раз' : 'Сохранить'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Отмена
        </Button>
        {extraActions}
        <span className="ml-auto text-[12px] text-[var(--fg-faint)] max-sm:hidden">
          ⌘S — сохранить · фото можно вставить или перетащить
        </span>
      </div>

      <Modal open={termModal} onClose={() => setTermModal(false)} title="Подсказка к термину">
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--fg-soft)]">
          Короткое пояснение появится в списке терминов под блоком, а на компьютере — ещё и при
          наведении на термин.
        </p>
        <textarea
          value={termNote}
          onChange={(e) => setTermNote(e.target.value)}
          rows={3}
          placeholder="Например: фермент щитовидной железы, участвует в синтезе Т3 и Т4"
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-[15px]
            focus:border-[var(--accent)] focus:outline-none focus:ring-4
            focus:ring-[rgb(var(--accent-glow)/0.12)]"
        />
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() => {
              const color = (editor.getAttributes('term').color as TermColor) || 'gold'
              editor.chain().focus().setTerm({ color, note: termNote.trim() || null }).run()
              setTermModal(false)
            }}
          >
            Применить
          </Button>
          <Button variant="ghost" onClick={() => setTermModal(false)}>
            Отмена
          </Button>
        </div>
      </Modal>
    </div>
  )
}
