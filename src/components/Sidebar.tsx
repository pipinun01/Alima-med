import { useEffect, useMemo, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { ChevronRight, FileText, Hash } from 'lucide-react'
import { useTree } from '@/context/TreeContext'
import { countCards, pathTo } from '@/lib/tree'
import { haptic } from '@/lib/telegram'
import type { TreeNode } from '@/lib/types'

function Row({
  node,
  expanded,
  toggle,
  onNavigate,
}: {
  node: TreeNode
  expanded: Set<string>
  toggle: (id: string) => void
  onNavigate?: () => void
}) {
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.id)
  const cards = useMemo(() => countCards(node), [node])

  return (
    <li>
      <div className="flex items-stretch">
        {hasChildren ? (
          <button
            onClick={() => {
              haptic.tap()
              toggle(node.id)
            }}
            aria-label={isOpen ? 'Свернуть' : 'Развернуть'}
            aria-expanded={isOpen}
            className="grid w-6 shrink-0 place-items-center rounded-lg text-[var(--fg-faint)]
              transition-colors hover:text-[var(--fg)]"
            style={{ marginLeft: node.depth * 12 }}
          >
            <ChevronRight
              size={14}
              className="transition-transform duration-200"
              style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
            />
          </button>
        ) : (
          <span className="w-6 shrink-0" style={{ marginLeft: node.depth * 12 }} />
        )}

        <NavLink
          to={`/n/${node.id}`}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-[13.5px]
             transition-colors duration-120
             ${
               isActive
                 ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                 : 'text-[var(--fg-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]'
             }`
          }
        >
          <span className="shrink-0 text-[13px] leading-none">
            {node.icon ? (
              node.icon
            ) : node.kind === 'card' ? (
              <FileText size={13} className="opacity-60" />
            ) : (
              <Hash size={13} className="opacity-50" />
            )}
          </span>
          <span className="truncate">{node.title}</span>
          {hasChildren && cards > 0 && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--fg-faint)]">
              {cards}
            </span>
          )}
        </NavLink>
      </div>

      {hasChildren && isOpen && (
        <ul className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <Row
              key={child.id}
              node={child}
              expanded={expanded}
              toggle={toggle}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { roots, byId, loading } = useTree()
  const { id } = useParams()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Раскрываем ветку до текущего узла, чтобы он всегда был виден
  useEffect(() => {
    if (!id) return
    const chain = pathTo(byId, id)
    if (!chain.length) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const n of chain) next.add(n.id)
      return next
    })
  }, [id, byId])

  // При первой загрузке показываем предметы раскрытыми на один уровень
  useEffect(() => {
    if (roots.length && expanded.size === 0) setExpanded(new Set(roots.map((r) => r.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots.length])

  const toggle = (nodeId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-7 animate-pulse rounded-lg bg-[var(--bg-subtle)]"
            style={{ width: `${60 + ((i * 13) % 35)}%` }}
          />
        ))}
      </div>
    )
  }

  if (!roots.length) {
    return (
      <p className="px-4 py-6 text-[13px] leading-relaxed text-[var(--fg-faint)]">
        Пока пусто. Войдите как редактор и добавьте первую главу.
      </p>
    )
  }

  return (
    <nav aria-label="Дерево конспектов" className="p-2">
      <ul className="space-y-0.5">
        {roots.map((node) => (
          <Row
            key={node.id}
            node={node}
            expanded={expanded}
            toggle={toggle}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </nav>
  )
}
