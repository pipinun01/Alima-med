import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, FilePlus2, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTree } from '@/context/TreeContext'
import { useAuth } from '@/context/AuthContext'
import { nextPosition, nodePatch, parentChoices, pathTo } from '@/lib/tree'
import { plural } from '@/lib/plural'
import { bindTelegramBack } from '@/lib/telegram'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { NodeCard } from '@/components/NodeCard'
import { BlockList } from '@/components/BlockList'
import { BranchTabs } from '@/components/BranchTabs'
import { NodeFormModal, type NodeFormValue } from '@/components/NodeFormModal'
import { Button, EmptyState, ErrorNote, IconButton, Modal, Spinner } from '@/components/ui'
import { KIND_META, type NodeKind } from '@/lib/types'

export function NodePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { roots, byId, loading, createNode, updateNode, deleteNode, moveNode } = useTree()
  const { isEditor } = useAuth()

  const [saving, setSaving] = useState(false)
  const [addParent, setAddParent] = useState<string | null>(null)
  const [addKind, setAddKind] = useState<NodeKind>('branch')
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const node = byId.get(id)
  const chain = useMemo(() => pathTo(byId, id), [byId, id])
  const parent = chain.length > 1 ? chain[chain.length - 2] : null

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [id])

  // Системная кнопка «назад» в Telegram ведёт на родительский узел
  useEffect(
    () => bindTelegramBack(() => navigate(parent ? `/n/${parent.id}` : '/')),
    [parent, navigate],
  )

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        <div className="h-4 w-48 animate-pulse rounded bg-[var(--bg-subtle)]" />
        <div className="mt-6 h-9 w-2/3 animate-pulse rounded-lg bg-[var(--bg-subtle)]" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-[var(--bg-subtle)]"
              style={{ width: `${95 - i * 9}%` }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (!node) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-8">
        <EmptyState
          icon={<FileText size={22} />}
          title="Страница не найдена"
          description="Возможно, запись удалили или ссылка устарела."
          action={<Button onClick={() => navigate('/')}>На главную</Button>}
        />
      </div>
    )
  }

  const meta = KIND_META[node.kind]
  const siblings = parent ? parent.children : []
  const indexAmongSiblings = siblings.findIndex((s) => s.id === id)
  const isCard = node.kind === 'card'
  const isTopic = node.kind === 'topic'

  const openAdd = (parentId: string, kind: NodeKind) => {
    setAddParent(parentId)
    setAddKind(kind)
  }

  const submitChild = async (value: NodeFormValue) => {
    if (!addParent) return
    setSaving(true)
    try {
      const siblingsOfNew = byId.get(addParent)?.children ?? []
      const created = await createNode({
        parent_id: addParent,
        title: value.title,
        subtitle: value.subtitle || null,
        kind: value.kind,
        icon: value.icon || null,
        position: nextPosition(siblingsOfNew),
      })
      setAddParent(null)
      if (created.kind === 'card' || addParent !== id) navigate(`/n/${created.id}`)
    } finally {
      setSaving(false)
    }
  }

  const submitRename = async (value: NodeFormValue) => {
    setSaving(true)
    try {
      await updateNode(id, nodePatch({ roots, byId }, node, value))
      setRenameOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    setSaving(true)
    setDeleteError(null)
    try {
      await deleteNode(id)
      navigate(parent ? `/n/${parent.id}` : '/', { replace: true })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Не удалось удалить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-5 sm:px-8 sm:pt-8">
      <Breadcrumbs chain={chain} />

      {/* ─── Заголовок ─────────────────────────────────────────────────────── */}
      <header className="animate-fade-up mt-4 flex items-start gap-3">
        {node.icon && <span className="mt-1 text-[26px] leading-none">{node.icon}</span>}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-faint)]">
            {meta.one}
          </p>
          <h1 className="mt-0.5 font-display text-[clamp(1.55rem,4.2vw,2.25rem)] font-bold leading-[1.15] tracking-[-0.025em]">
            {node.title}
          </h1>
          {node.subtitle && (
            <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--fg-soft)]">{node.subtitle}</p>
          )}
        </div>

        {isEditor && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Выше" disabled={indexAmongSiblings <= 0} onClick={() => void moveNode(id, -1)}>
              <ChevronUp size={17} />
            </IconButton>
            <IconButton
              label="Ниже"
              disabled={indexAmongSiblings < 0 || indexAmongSiblings >= siblings.length - 1}
              onClick={() => void moveNode(id, 1)}
            >
              <ChevronDown size={17} />
            </IconButton>
            <IconButton label="Переименовать" onClick={() => setRenameOpen(true)}>
              <Pencil size={16} />
            </IconButton>
            <IconButton label="Удалить" onClick={() => setDeleteOpen(true)} className="hover:text-[var(--danger)]">
              <Trash2 size={16} />
            </IconButton>
          </div>
        )}
      </header>

      {/* ─── Содержимое ────────────────────────────────────────────────────── */}
      {isCard ? (
        <section className="mt-8">
          <BlockList nodeId={id} canEdit={isEditor} />
        </section>
      ) : isTopic ? (
        node.children.length > 0 || isEditor ? (
          <BranchTabs
            branches={node.children}
            canEdit={isEditor}
            onAddBranch={() => openAdd(id, 'branch')}
            onAddCard={(branchId) => openAdd(branchId, 'card')}
          />
        ) : null
      ) : (
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="font-display text-[15px] font-semibold tracking-tight text-[var(--fg-soft)]">
              {node.children.length > 0 && meta.child
                ? `${node.children.length} ${plural(
                    node.children.length,
                    KIND_META[meta.child].one,
                    KIND_META[meta.child].few,
                    KIND_META[meta.child].many,
                  )}`
                : 'Внутри пока пусто'}
            </h2>
            {isEditor && meta.child && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => openAdd(id, meta.child as NodeKind)}
              >
                <Plus size={15} />
                {meta.childLabel}
              </Button>
            )}
          </div>

          {node.children.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {node.children.map((child, i) => (
                <NodeCard key={child.id} node={child} index={i} />
              ))}
            </div>
          ) : (
            isEditor &&
            meta.child && (
              <button
                onClick={() => openAdd(id, meta.child as NodeKind)}
                className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border
                  border-dashed border-[var(--line-strong)] px-4 py-5 text-left
                  text-[var(--fg-soft)] transition-colors hover:bg-[var(--bg-subtle)]"
              >
                <FilePlus2 size={17} className="text-[var(--fg-faint)]" />
                <span className="text-[14px]">Создать: {meta.childLabel.toLowerCase()}</span>
              </button>
            )
          )}
        </section>
      )}

      <NodeFormModal
        open={addParent !== null}
        title={`Новая запись: ${KIND_META[addKind].one}`}
        initial={{ kind: addKind }}
        saving={saving}
        onSubmit={submitChild}
        onClose={() => setAddParent(null)}
      />

      <NodeFormModal
        open={renameOpen}
        title="Изменить запись"
        initial={{
          title: node.title,
          subtitle: node.subtitle ?? '',
          kind: node.kind,
          icon: node.icon ?? '',
          parent_id: node.parent_id,
        }}
        parents={renameOpen ? parentChoices({ roots, byId }, node.id) : undefined}
        hasChildren={node.children.length > 0}
        saving={saving}
        onSubmit={submitRename}
        onClose={() => setRenameOpen(false)}
      />

      <Modal
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false)
          setDeleteError(null)
        }}
        title="Удалить запись?"
      >
        <p className="text-[14.5px] leading-relaxed text-[var(--fg-soft)]">
          «{node.title}» будет удалена
          {node.children.length > 0 && meta.child && (
            <>
              {' '}вместе со всем содержимым — это {node.children.length}{' '}
              {plural(
                node.children.length,
                KIND_META[meta.child].one,
                KIND_META[meta.child].few,
                KIND_META[meta.child].many,
              )}
            </>
          )}
          . Тексты блоков останутся в истории правок, но из интерфейса их уже не вернуть.
        </p>
        {deleteError && <ErrorNote className="mt-4">{deleteError}</ErrorNote>}
        <div className="mt-5 flex gap-2">
          <Button variant="danger" onClick={() => void confirmDelete()} disabled={saving}>
            {saving && <Spinner />}
            Удалить
          </Button>
          <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={saving}>
            Отмена
          </Button>
        </div>
      </Modal>
    </div>
  )
}
