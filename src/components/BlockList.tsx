import { useCallback, useEffect, useState } from 'react'
import {
  ChevronDown, ChevronRight, ChevronUp, ChevronsDownUp, ChevronsUpDown, Pencil, Plus, Trash2,
} from 'lucide-react'
import * as api from '@/lib/api'
import { contentToText } from '@/lib/editor'
import { TERM_LABELS, type Block, type TermColor } from '@/lib/types'
import { haptic } from '@/lib/telegram'
import { NoteView } from './NoteView'
import { NoteEditor } from './NoteEditor'
import { Button, IconButton, Modal, Spinner } from './ui'

const COLORS = Object.keys(TERM_LABELS) as TermColor[]

/** «Открывать карточку свёрнутой» — выбор этого устройства, помним между заходами */
const COLLAPSE_PREF = 'lichnoe-info-blocks-collapsed'

const readCollapsePref = () => {
  try {
    return localStorage.getItem(COLLAPSE_PREF) === '1'
  } catch {
    return false
  }
}

const writeCollapsePref = (v: boolean) => {
  try {
    localStorage.setItem(COLLAPSE_PREF, v ? '1' : '0')
  } catch {
    /* приватный режим */
  }
}

/** Первая строка блока — чтобы в свёрнутом виде было понятно, что внутри */
function previewOf(block: Block) {
  const line = (block.content_text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return line.length > 90 ? `${line.slice(0, 90)}…` : line
}

/** Цветная метка блока — то, что не даёт спутать термины между собой */
export function BlockChip({ label, color }: { label: string; color: TermColor }) {
  if (!label) return null
  return (
    <span
      className="term inline-block text-[12px] font-semibold uppercase tracking-[0.08em]"
      data-color={color}
    >
      {label}
    </span>
  )
}

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

function BlockEditorCard({
  block,
  onSaved,
  onCancel,
  onDeleted,
}: {
  block: Block
  onSaved: (b: Block) => void
  onCancel: () => void
  onDeleted: (id: string) => void
}) {
  const [label, setLabel] = useState(block.label)
  const [color, setColor] = useState<TermColor>(block.color)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = async (json: unknown) => {
    setSaving(true)
    try {
      const updated = await api.updateBlock(block.id, {
        label: label.trim(),
        color,
        content: json as never,
        content_text: contentToText(json),
      })
      haptic.ok()
      onSaved(updated)
    } catch (e) {
      haptic.err()
      window.alert(`Не сохранилось: ${e instanceof Error ? e.message : 'ошибка'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="rounded-[var(--radius-card)] border border-[var(--accent)]
        bg-[var(--bg-card)] p-4 shadow-[var(--shadow-md)] sm:p-5"
    >
      <NoteEditor
        initialContent={block.content}
        saving={saving}
        onSave={save}
        onCancel={onCancel}
        placeholder="Текст блока: определение, механизм, нормы, клиника…"
        header={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Метка блока: ТПО, Тироцит…"
              className="h-11 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5
                text-[15px] font-medium placeholder:text-[var(--fg-faint)]
                focus:border-[var(--accent)] focus:outline-none
                focus:ring-4 focus:ring-[rgb(var(--accent-glow)/0.12)]"
            />
            <ColorPicker value={color} onChange={setColor} />
          </div>
        }
        extraActions={
          <Button
            variant="ghost"
            size="md"
            className="text-red-600 hover:bg-red-500/10"
            onClick={() => setConfirmDelete(true)}
            disabled={saving}
          >
            <Trash2 size={15} />
            Удалить блок
          </Button>
        }
      />

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Удалить блок?">
        <p className="text-[14.5px] leading-relaxed text-[var(--fg-soft)]">
          Блок «{block.label || 'без метки'}» будет удалён вместе с текстом. Остальные блоки
          карточки останутся на месте.
        </p>
        <div className="mt-5 flex gap-2">
          <Button
            variant="danger"
            onClick={async () => {
              await api.deleteBlock(block.id)
              onDeleted(block.id)
            }}
          >
            Удалить
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Отмена
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export function BlockList({ nodeId, canEdit }: { nodeId: string; canEdit: boolean }) {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    setLoading(true)
    setEditingId(null)
    api
      .fetchBlocks(nodeId)
      .then((data) => {
        if (!active) return
        setBlocks(data)
        // Если выбрано «открывать свёрнутыми» — прячем всё, кроме единственного блока
        setCollapsed(
          readCollapsePref() && data.length > 1 ? new Set(data.map((b) => b.id)) : new Set(),
        )
      })
      .catch(() => active && setBlocks([]))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [nodeId])

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allCollapsed = blocks.length > 0 && blocks.every((b) => collapsed.has(b.id))

  const toggleAll = () => {
    haptic.tap()
    setCollapsed(allCollapsed ? new Set() : new Set(blocks.map((b) => b.id)))
    writeCollapsePref(!allCollapsed)
  }

  const addBlock = useCallback(async () => {
    setAdding(true)
    try {
      const created = await api.createBlock({
        node_id: nodeId,
        label: '',
        color: 'gold',
        position: blocks.reduce((max, b) => Math.max(max, b.position), -1) + 1,
      })
      setBlocks((prev) => [...prev, created])
      setEditingId(created.id)
      haptic.hit()
    } catch (e) {
      window.alert(`Не удалось добавить блок: ${e instanceof Error ? e.message : 'ошибка'}`)
    } finally {
      setAdding(false)
    }
  }, [nodeId, blocks])

  const move = async (id: string, direction: -1 | 1) => {
    const index = blocks.findIndex((b) => b.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= blocks.length) return
    const next = [...blocks]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    const withPositions = next.map((b, i) => ({ ...b, position: i }))
    setBlocks(withPositions)
    await api.reorderBlocks(withPositions.map((b) => ({ id: b.id, position: b.position })))
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-[var(--radius-card)] border border-[var(--line)] p-5">
            <div className="h-5 w-24 animate-pulse rounded-full bg-[var(--bg-subtle)]" />
            <div className="mt-4 space-y-2.5">
              {Array.from({ length: 4 }).map((__, j) => (
                <div
                  key={j}
                  className="h-3.5 animate-pulse rounded bg-[var(--bg-subtle)]"
                  style={{ width: `${96 - j * 8}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {blocks.length > 1 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
            {allCollapsed ? 'Развернуть всё' : 'Свернуть всё'}
          </Button>
        </div>
      )}

      {blocks.map((block, index) =>
        editingId === block.id ? (
          <BlockEditorCard
            key={block.id}
            block={block}
            onCancel={() => setEditingId(null)}
            onSaved={(updated) => {
              setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
              setEditingId(null)
            }}
            onDeleted={(id) => {
              setBlocks((prev) => prev.filter((b) => b.id !== id))
              setEditingId(null)
            }}
          />
        ) : (
          <article
            key={block.id}
            className={`animate-fade-up rounded-[var(--radius-card)] border border-[var(--line)]
              bg-[var(--bg-card)] shadow-[var(--shadow-sm)] ${
                collapsed.has(block.id) ? 'px-4 py-3 sm:px-6 sm:py-4' : 'p-4 sm:p-6'
              }`}
            style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
          >
            <div className={`flex items-start gap-2 ${collapsed.has(block.id) ? '' : 'mb-3'}`}>
              {/* Вся строка с меткой — переключатель: нажали, блок раскрылся */}
              <button
                type="button"
                onClick={() => {
                  haptic.tap()
                  toggle(block.id)
                }}
                aria-expanded={!collapsed.has(block.id)}
                aria-label={collapsed.has(block.id) ? 'Развернуть блок' : 'Свернуть блок'}
                className="-my-1 -ml-1 flex min-w-0 flex-1 items-start gap-2 rounded-xl px-1 py-1
                  text-left transition-colors hover:bg-[var(--bg-subtle)]"
              >
                <ChevronRight
                  size={16}
                  className="mt-0.5 shrink-0 text-[var(--fg-faint)] transition-transform duration-200"
                  style={{ transform: collapsed.has(block.id) ? 'none' : 'rotate(90deg)' }}
                />
                <span className="min-w-0 flex-1">
                  <BlockChip label={block.label || 'Без метки'} color={block.color} />
                  {collapsed.has(block.id) && previewOf(block) && (
                    <span className="mt-1 block truncate text-[13px] text-[var(--fg-faint)]">
                      {previewOf(block)}
                    </span>
                  )}
                </span>
              </button>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton label="Выше" disabled={index === 0} onClick={() => void move(block.id, -1)}>
                    <ChevronUp size={16} />
                  </IconButton>
                  <IconButton
                    label="Ниже"
                    disabled={index === blocks.length - 1}
                    onClick={() => void move(block.id, 1)}
                  >
                    <ChevronDown size={16} />
                  </IconButton>
                  <IconButton
                    label="Редактировать блок"
                    onClick={() => {
                      // Правим только развёрнутый блок — иначе текст не виден
                      setCollapsed((prev) => {
                        const next = new Set(prev)
                        next.delete(block.id)
                        return next
                      })
                      setEditingId(block.id)
                    }}
                  >
                    <Pencil size={15} />
                  </IconButton>
                </div>
              )}
            </div>
            {!collapsed.has(block.id) && <NoteView content={block.content} />}
          </article>
        ),
      )}

      {canEdit && (
        <Button variant="outline" onClick={() => void addBlock()} disabled={adding} className="w-full sm:w-auto">
          {adding ? <Spinner /> : <Plus size={16} />}
          Добавить блок
        </Button>
      )}

      {!canEdit && blocks.length === 0 && (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)]
          px-4 py-6 text-center text-[14px] text-[var(--fg-faint)]">
          Конспект для этой карточки ещё не написан
        </p>
      )}
    </div>
  )
}
