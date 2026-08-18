import { Link } from 'react-router-dom'
import { ArrowUpRight, FileText, Layers } from 'lucide-react'
import { countCards } from '@/lib/tree'
import { KIND_META, type TreeNode } from '@/lib/types'

export function NodeCard({ node, index = 0 }: { node: TreeNode; index?: number }) {
  const cards = countCards(node)
  const isCard = node.kind === 'card'
  const childMeta = KIND_META[node.kind].child

  return (
    <Link
      to={`/n/${node.id}`}
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
        <ArrowUpRight
          size={16}
          className="mt-1 shrink-0 text-[var(--fg-faint)] opacity-0 transition-opacity
            duration-200 group-hover:opacity-100"
        />
      </div>

      {!isCard && childMeta && (
        <span className="mt-auto pt-1 text-[12px] text-[var(--fg-faint)]">
          {node.children.length}{' '}
          {plural(
            node.children.length,
            KIND_META[childMeta].one,
            KIND_META[childMeta].few,
            KIND_META[childMeta].many,
          )}
          {cards > 0 && childMeta !== 'card' && ` · ${cards} ${plural(cards, 'карточка', 'карточки', 'карточек')}`}
        </span>
      )}
    </Link>
  )
}

export function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
