import { Link } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import type { TreeNode } from '@/lib/types'

export function Breadcrumbs({ chain }: { chain: TreeNode[] }) {
  const trail = chain.slice(0, -1)

  return (
    <nav aria-label="Хлебные крошки" className="flex items-center gap-1 overflow-x-auto scrollbar-slim">
      <Link
        to="/"
        className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[13px]
          text-[var(--fg-faint)] transition-colors hover:text-[var(--fg)]"
      >
        <Home size={13} />
      </Link>
      {trail.map((node) => (
        <span key={node.id} className="flex shrink-0 items-center gap-1">
          <ChevronRight size={13} className="text-[var(--fg-faint)] opacity-50" />
          <Link
            to={`/n/${node.id}`}
            className="max-w-[11rem] truncate rounded-lg px-1.5 py-1 text-[13px]
              text-[var(--fg-soft)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
          >
            {node.title}
          </Link>
        </span>
      ))}
    </nav>
  )
}
