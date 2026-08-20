import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { Button } from './ui'
import type { TreeNode } from '@/lib/types'
import { haptic } from '@/lib/telegram'

/**
 * Тема показывает свои ветки лентой закладок, а под ними — карточки выбранной
 * ветки. Так гормоны, биохимия и коагулограмма не сваливаются в одну кучу.
 */
export function BranchTabs({
  branches,
  canEdit,
  onAddBranch,
  onAddCard,
}: {
  branches: TreeNode[]
  canEdit: boolean
  onAddBranch: () => void
  onAddCard: (branchId: string) => void
}) {
  // Выбранная ветка хранится в адресе (?b=…): вернулись из карточки — открыта та же вкладка
  const [params, setParams] = useSearchParams()
  const requested = params.get('b')
  const activeId = branches.some((b) => b.id === requested) ? requested : (branches[0]?.id ?? null)
  const active = branches.find((b) => b.id === activeId) ?? null

  const setActiveId = (id: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('b', id)
        return next
      },
      { replace: true },
    )

  return (
    <section className="mt-8">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto scrollbar-slim px-4 pb-2 sm:mx-0 sm:px-0">
        {branches.map((branch) => {
          const selected = branch.id === activeId
          return (
            <button
              key={branch.id}
              onClick={() => {
                haptic.tap()
                setActiveId(branch.id)
              }}
              className={`shrink-0 rounded-full px-4 py-2 text-[13.5px] font-medium
                transition-colors duration-150
                ${
                  selected
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-[var(--shadow-sm)]'
                    : 'border border-[var(--line)] bg-[var(--bg-card)] text-[var(--fg-soft)] hover:bg-[var(--bg-hover)]'
                }`}
            >
              {branch.title}
              <span className={`ml-2 text-[11px] tabular-nums ${selected ? 'opacity-70' : 'text-[var(--fg-faint)]'}`}>
                {branch.children.length}
              </span>
            </button>
          )
        })}

        {canEdit && (
          <button
            onClick={onAddBranch}
            className="shrink-0 rounded-full border border-dashed border-[var(--line-strong)]
              px-3.5 py-2 text-[13.5px] text-[var(--fg-soft)] transition-colors
              hover:bg-[var(--bg-hover)]"
          >
            <Plus size={14} className="mr-1 inline" />
            Ветка
          </button>
        )}
      </div>

      {active && (
        <div className="mt-4">
          <div className="mb-2.5 flex items-center gap-3">
            <Link
              to={`/n/${active.id}`}
              className="font-display text-[15px] font-semibold tracking-tight
                text-[var(--fg-soft)] transition-colors hover:text-[var(--fg)]"
            >
              {active.title}
            </Link>
            {canEdit && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onAddCard(active.id)}>
                <Plus size={15} />
                Карточка
              </Button>
            )}
          </div>

          {active.children.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)]
              px-4 py-6 text-center text-[14px] text-[var(--fg-faint)]">
              В этой ветке пока нет карточек
            </p>
          ) : (
            <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-card)]">
              {active.children.map((card) => (
                <li key={card.id} className="border-b border-[var(--line)] last:border-0">
                  <Link
                    to={`/n/${card.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--fg-faint)]">
                        Карточка
                      </span>
                      <span className="block truncate text-[15px] font-medium">{card.title}</span>
                      {card.subtitle && (
                        <span className="block truncate text-[12.5px] text-[var(--fg-soft)]">
                          {card.subtitle}
                        </span>
                      )}
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-[var(--fg-faint)]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
