import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, ChevronUp, FileText, Layers, Pencil } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTree } from '@/context/TreeContext'
import { countCards, nodePatch, parentChoices } from '@/lib/tree'
import { plural } from '@/lib/plural'
import { haptic } from '@/lib/telegram'
import { KIND_META, type TreeNode } from '@/lib/types'
import { NodeFormModal, type NodeFormValue } from './NodeFormModal'
import { IconButton } from './ui'

export function NodeCard({ node, index = 0 }: { node: TreeNode; index?: number }) {
  const { isEditor } = useAuth()
  const { roots, byId, moveNode, updateNode } = useTree()
  const [renaming, setRenaming] = useState(false)
  const [saving, setSaving] = useState(false)

  const cards = countCards(node)
  const isCard = node.kind === 'card'
  const childMeta = KIND_META[node.kind].child

  // Порядок правится прямо здесь, в списке: сразу видно, куда переехала запись
  const siblings = node.parent_id ? (byId.get(node.parent_id)?.children ?? []) : roots
  const position = siblings.findIndex((s) => s.id === node.id)

  const rename = async (value: NodeFormValue) => {
    setSaving(true)
    try {
      await updateNode(node.id, nodePatch({ roots, byId }, node, value))
      setRenaming(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article
      className="group animate-fade-up relative flex flex-col gap-2 overflow-hidden
        rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-card)]
        p-4 shadow-[var(--shadow-sm)] transition-[transform,box-shadow,border-color] duration-200
        hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-md)]"
      style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-0
          transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: 'var(--grad)' }}
        aria-hidden
      />

      <div className="flex items-start gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--bg-subtle)]
            text-[15px] text-[var(--fg-soft)]"
        >
          {node.icon || (isCard ? <FileText size={16} /> : <Layers size={16} />)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug tracking-tight">
            {node.title}
          </span>
          {node.subtitle && (
            <span className="mt-0.5 block line-clamp-2 text-[13px] leading-relaxed text-[var(--fg-soft)]">
              {node.subtitle}
            </span>
          )}
        </span>

        {!isEditor && (
          <ArrowUpRight
            size={16}
            className="mt-1 shrink-0 text-[var(--fg-faint)] opacity-0 transition-opacity
              duration-200 group-hover:opacity-100"
          />
        )}
      </div>

      {/* Нижняя строка: счётчики слева, кнопки редактора справа — заголовок не жмётся */}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--fg-faint)]">
          {!isCard && childMeta && (
            <>
              {node.children.length}{' '}
              {plural(
                node.children.length,
                KIND_META[childMeta].one,
                KIND_META[childMeta].few,
                KIND_META[childMeta].many,
              )}
              {cards > 0 && childMeta !== 'card' && ` · ${cards} ${plural(cards, 'карточка', 'карточки', 'карточек')}`}
            </>
          )}
        </span>

        {isEditor && (
          /* Кнопки лежат поверх ссылки — z-10 не даёт открыть запись по ошибке */
          <span className="relative z-10 -mb-1 -mr-1 flex shrink-0 items-center gap-0.5">
            <IconButton
              label="Выше"
              className="h-8 w-8"
              disabled={position <= 0}
              onClick={() => {
                haptic.tap()
                void moveNode(node.id, -1)
              }}
            >
              <ChevronUp size={16} />
            </IconButton>
            <IconButton
              label="Ниже"
              className="h-8 w-8"
              disabled={position < 0 || position >= siblings.length - 1}
              onClick={() => {
                haptic.tap()
                void moveNode(node.id, 1)
              }}
            >
              <ChevronDown size={16} />
            </IconButton>
            <IconButton label="Переименовать" className="h-8 w-8" onClick={() => setRenaming(true)}>
              <Pencil size={15} />
            </IconButton>
          </span>
        )}
      </div>

      {/* Ссылка растянута на всю карточку: кликается любое место, кроме кнопок */}
      <Link to={`/n/${node.id}`} className="absolute inset-0" aria-label={node.title} />

      <NodeFormModal
        open={renaming}
        title="Изменить запись"
        initial={{
          title: node.title,
          subtitle: node.subtitle ?? '',
          kind: node.kind,
          icon: node.icon ?? '',
          parent_id: node.parent_id,
        }}
        parents={renaming ? parentChoices({ roots, byId }, node.id) : undefined}
        hasChildren={node.children.length > 0}
        saving={saving}
        onSubmit={rename}
        onClose={() => setRenaming(false)}
      />
    </article>
  )
}
