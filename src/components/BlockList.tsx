import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, ChevronUp, ChevronsDownUp, ChevronsUpDown, Pencil, Plus,
} from 'lucide-react'
import * as api from '@/lib/api'
import { clearDraft, draftKey } from '@/lib/drafts'
import { onDataUpdated } from '@/lib/sw-client'
import type { Block, TermColor } from '@/lib/types'
import { haptic } from '@/lib/telegram'
import { NoteView } from './NoteView'
import { ErrorBoundary } from './ErrorBoundary'
import { Button, ErrorNote, IconButton, Modal, Spinner } from './ui'

/** Редактор тянет TipTap — почти половину кода приложения. Читателям он не нужен, грузим по клику. */
const BlockEditorCard = lazy(() => import('./BlockEditor'))

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

function EditorSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--accent)] p-5">
      <p className="flex items-center gap-2 text-[13.5px] text-[var(--fg-soft)]">
        <Spinner />
        Открываю редактор…
      </p>
    </div>
  )
}

/** Какой блок редактируется: id существующего или 'new' для ещё не сохранённого */
type Editing = string | 'new' | null

export function BlockList({ nodeId, canEdit }: { nodeId: string; canEdit: boolean }) {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  /** Куда хотели перейти, когда в редакторе остались несохранённые правки */
  const [pending, setPending] = useState<{ next: Editing } | null>(null)
  const dirty = useRef(false)

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const data = await api.fetchBlocks(nodeId)
        setBlocks(data)
        setLoadError(null)
        if (!silent) {
          // Если выбрано «открывать свёрнутыми» — прячем всё, кроме единственного блока
          setCollapsed(readCollapsePref() && data.length > 1 ? new Set(data.map((b) => b.id)) : new Set())
        }
      } catch (e) {
        if (!silent) {
          setBlocks([])
          setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить')
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [nodeId],
  )

  useEffect(() => {
    setEditing(null)
    dirty.current = false
    void load()
  }, [load])

  // Service worker показал сохранённые блоки, а на сервере они уже другие
  useEffect(
    () => onDataUpdated((url) => {
      if (url.includes('/rest/v1/blocks') && url.includes(nodeId)) void load(true)
    }),
    [nodeId, load],
  )

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

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

  /** Переход к другому блоку или закрытие — с вопросом, если есть несохранённое */
  const go = (next: Editing) => {
    if (dirty.current && next !== editing) {
      setPending({ next })
      return
    }
    if (next && next !== 'new') {
      // Правим только развёрнутый блок — иначе текст не виден
      setCollapsed((prev) => {
        const copy = new Set(prev)
        copy.delete(next)
        return copy
      })
    }
    setEditing(next)
  }

  const discardAndGo = () => {
    if (!pending) return
    clearDraft(draftKey(editing === 'new' ? null : editing, nodeId))
    dirty.current = false
    const { next } = pending
    setPending(null)
    go(next)
  }

  const move = async (id: string, direction: -1 | 1) => {
    const index = blocks.findIndex((b) => b.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= blocks.length) return
    const snapshot = blocks
    const next = [...blocks]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    const withPositions = next.map((b, i) => ({ ...b, position: i }))
    setBlocks(withPositions)
    // Пишем только те блоки, у которых позиция действительно изменилась
    const before = new Map(snapshot.map((b) => [b.id, b.position]))
    try {
      await api.reorderBlocks(
        nodeId,
        withPositions
          .filter((b) => before.get(b.id) !== b.position)
          .map((b) => ({ id: b.id, position: b.position })),
      )
    } catch (e) {
      setBlocks(snapshot)
      setNotice(`Порядок не сохранился: ${e instanceof Error ? e.message : 'ошибка'}`)
    }
  }

  /** Заготовка нового блока: в базу попадёт только после первого «Сохранить» */
  const draftBlock = (): Block => ({
    id: 'new',
    node_id: nodeId,
    label: '',
    color: 'gold',
    content: null,
    content_text: null,
    position: blocks.reduce((max, b) => Math.max(max, b.position), -1) + 1,
    created_at: '',
    updated_at: '',
  })

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
      {loadError && (
        <ErrorNote>
          Не удалось загрузить блоки: {loadError}{' '}
          <button type="button" className="font-medium underline" onClick={() => void load()}>
            Повторить
          </button>
        </ErrorNote>
      )}
      {notice && <ErrorNote>{notice}</ErrorNote>}

      {blocks.length > 1 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
            {allCollapsed ? 'Развернуть всё' : 'Свернуть всё'}
          </Button>
        </div>
      )}

      {blocks.map((block, index) =>
        editing === block.id ? (
          <Suspense key={block.id} fallback={<EditorSkeleton />}>
            <BlockEditorCard
              block={block}
              onCancel={() => go(null)}
              onDirtyChange={(v) => {
                dirty.current = v
              }}
              onSaved={(updated) => {
                setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
                setEditing(null)
              }}
              onDeleted={(id) => {
                setBlocks((prev) => prev.filter((b) => b.id !== id))
                setEditing(null)
              }}
            />
          </Suspense>
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
                  <IconButton label="Редактировать блок" onClick={() => go(block.id)}>
                    <Pencil size={15} />
                  </IconButton>
                </div>
              )}
            </div>
            {!collapsed.has(block.id) && (
              <ErrorBoundary title="Не получилось показать этот блок">
                <NoteView content={block.content} />
              </ErrorBoundary>
            )}
          </article>
        ),
      )}

      {editing === 'new' && (
        <Suspense fallback={<EditorSkeleton />}>
          <BlockEditorCard
            block={draftBlock()}
            isNew
            onCancel={() => go(null)}
            onDirtyChange={(v) => {
              dirty.current = v
            }}
            onSaved={(created) => {
              setBlocks((prev) => [...prev.filter((b) => b.id !== created.id), created])
              setEditing(null)
            }}
            onDeleted={() => setEditing(null)}
          />
        </Suspense>
      )}

      {canEdit && editing !== 'new' && (
        <Button variant="outline" onClick={() => go('new')} className="w-full sm:w-auto">
          <Plus size={16} />
          Добавить блок
        </Button>
      )}

      {!canEdit && blocks.length === 0 && !loadError && (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)]
          px-4 py-6 text-center text-[14px] text-[var(--fg-faint)]">
          Конспект для этой карточки ещё не написан
        </p>
      )}

      <Modal open={pending !== null} onClose={() => setPending(null)} title="Есть несохранённые изменения">
        <p className="text-[14.5px] leading-relaxed text-[var(--fg-soft)]">
          В блоке остался несохранённый текст. Закрыть редактор без сохранения?
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="danger" onClick={discardAndGo}>
            Не сохранять
          </Button>
          <Button variant="ghost" onClick={() => setPending(null)}>
            Вернуться к правке
          </Button>
        </div>
      </Modal>
    </div>
  )
}
