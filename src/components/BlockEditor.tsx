import { useEffect, useRef, useState } from 'react'
import { History, Trash2 } from 'lucide-react'
import * as api from '@/lib/api'
import { contentToText } from '@/lib/doc'
import { clearDraft, draftKey, readDraft, writeDraft, type BlockDraft } from '@/lib/drafts'
import { TERM_LABELS, type Block, type TermColor } from '@/lib/types'
import { haptic } from '@/lib/telegram'
import { NoteEditor } from './NoteEditor'
import { Button, Modal } from './ui'

/*
 * Правка одного блока. Этот файл тянет TipTap и подгружается отдельным куском
 * только когда редактор нажал «Редактировать» или «Добавить блок» — читателям
 * он не нужен (см. BlockList.tsx, lazy).
 */

const COLORS = Object.keys(TERM_LABELS) as TermColor[]

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

function ColorPicker({
  value,
  onChange,
}: {
  value: TermColor
  onChange: (c: TermColor) => void
}) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Цвет метки">
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          title={`${TERM_LABELS[color].name} — ${TERM_LABELS[color].hint}`}
          onClick={() => {
            haptic.tap()
            onChange(color)
          }}
          className={`term h-9 rounded-lg px-3 text-[12px] font-semibold uppercase tracking-wide
            transition-transform duration-150
            ${value === color ? 'scale-100 ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]' : 'scale-95 opacity-70 hover:opacity-100'}`}
          data-color={color}
        >
          {TERM_LABELS[color].name}
        </button>
      ))}
    </div>
  )
}

export default function BlockEditorCard({
  block,
  isNew = false,
  onSaved,
  onCancel,
  onDeleted,
  onDirtyChange,
}: {
  block: Block
  /** Новый блок: строки в базе ещё нет, она появится при первом сохранении */
  isNew?: boolean
  onSaved: (b: Block) => void
  onCancel: () => void
  onDeleted: (id: string) => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [label, setLabel] = useState(block.label)
  const [color, setColor] = useState<TermColor>(block.color)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [replace, setReplace] = useState<{ content: unknown; version: number } | null>(null)

  /* ─── Черновик: всё набранное откладывается на устройстве, пока не сохранится ─── */
  const key = draftKey(isNew ? null : block.id, block.node_id)
  const [pendingDraft, setPendingDraft] = useState<BlockDraft | null>(() => {
    const draft = readDraft(key)
    if (!draft) return null
    const same =
      draft.label === block.label &&
      draft.color === block.color &&
      JSON.stringify(draft.content ?? null) === JSON.stringify(block.content ?? null)
    return same ? null : draft
  })
  const contentRef = useRef<unknown>(block.content)
  const labelRef = useRef(label)
  const colorRef = useRef(color)
  useEffect(() => {
    labelRef.current = label
    colorRef.current = color
  })
  const dirtyRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Любая правка: помечаем «есть несохранённое» и через секунду откладываем черновик */
  const markDirty = () => {
    if (!dirtyRef.current) {
      dirtyRef.current = true
      onDirtyChange?.(true)
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(
      () => writeDraft(key, { label: labelRef.current, color: colorRef.current, content: contentRef.current }),
      800,
    )
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      onDirtyChange?.(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const restoreDraft = () => {
    if (!pendingDraft) return
    setLabel(pendingDraft.label)
    setColor(pendingDraft.color)
    contentRef.current = pendingDraft.content
    setReplace((r) => ({ content: pendingDraft.content, version: (r?.version ?? 0) + 1 }))
    setPendingDraft(null)
    markDirty()
  }

  const dropDraft = () => {
    clearDraft(key)
    setPendingDraft(null)
  }

  /* ─── Сохранение ─── */
  const save = async (json: unknown) => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const patch = {
        label: label.trim(),
        color,
        content: json as never,
        content_text: contentToText(json),
      }
      const saved = isNew
        ? await api.createBlock({ node_id: block.node_id, position: block.position, ...patch })
        : await api.updateBlock(block.id, patch)
      clearDraft(key)
      dirtyRef.current = false
      onDirtyChange?.(false)
      haptic.ok()
      onSaved(saved)
    } catch (e) {
      haptic.err()
      // Текст остаётся в редакторе и в черновике — можно просто нажать ещё раз
      setError(e instanceof Error ? e.message : 'Не сохранилось')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.deleteBlock(block.id, block.node_id)
      clearDraft(key)
      setConfirmDelete(false)
      onDeleted(block.id)
    } catch (e) {
      setConfirmDelete(false)
      setError(e instanceof Error ? e.message : 'Не удалось удалить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="rounded-[var(--radius-card)] border border-[var(--accent)]
        bg-[var(--bg-card)] p-4 shadow-[var(--shadow-md)] sm:p-5"
    >
      {pendingDraft && (
        <div
          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--line)]
            bg-[var(--bg-subtle)] px-3.5 py-2.5 text-[13.5px]"
        >
          <History size={15} className="shrink-0 text-[var(--accent)]" />
          <span className="min-w-0 flex-1 text-[var(--fg-soft)]">
            Есть несохранённый черновик от {timeOf(pendingDraft.savedAt)}
          </span>
          <span className="flex gap-1.5">
            <Button size="sm" variant="soft" onClick={restoreDraft}>
              Восстановить
            </Button>
            <Button size="sm" variant="ghost" onClick={dropDraft}>
              Удалить черновик
            </Button>
          </span>
        </div>
      )}

      <NoteEditor
        initialContent={block.content}
        saving={saving}
        error={error}
        onSave={save}
        onCancel={onCancel}
        onChange={(json) => {
          contentRef.current = json
          markDirty()
        }}
        replace={replace}
        placeholder="Текст блока: определение, механизм, нормы, клиника…"
        header={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={label}
              onChange={(e) => {
                setLabel(e.target.value)
                markDirty()
              }}
              placeholder="Метка блока: ТПО, Тироцит…"
              className="h-11 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5
                text-[15px] font-medium placeholder:text-[var(--fg-faint)]
                focus:border-[var(--accent)] focus:outline-none
                focus:ring-4 focus:ring-[rgb(var(--accent-glow)/0.12)]"
            />
            <ColorPicker
              value={color}
              onChange={(c) => {
                setColor(c)
                markDirty()
              }}
            />
          </div>
        }
        extraActions={
          !isNew && (
            <Button
              variant="ghost"
              size="md"
              className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
            >
              <Trash2 size={15} />
              Удалить блок
            </Button>
          )
        }
      />

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Удалить блок?">
        <p className="text-[14.5px] leading-relaxed text-[var(--fg-soft)]">
          Блок «{block.label || 'без метки'}» будет удалён вместе с текстом. Остальные блоки
          карточки останутся на месте, а последняя версия текста сохранится в истории.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="danger" onClick={() => void remove()} disabled={saving}>
            Удалить
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={saving}>
            Отмена
          </Button>
        </div>
      </Modal>
    </div>
  )
}
