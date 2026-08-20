import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, FileText, FolderTree, Search, X } from 'lucide-react'
import { searchAll } from '@/lib/api'
import { useTree } from '@/context/TreeContext'
import { pathTo } from '@/lib/tree'
import { haptic } from '@/lib/telegram'
import { Spinner } from './ui'
import type { SearchHit } from '@/lib/types'

/** Postgres отдаёт фрагмент с маркерами [[...]] — превращаем их в подсветку */
function Snippet({ text }: { text: string }) {
  const parts = useMemo(() => text.split(/(\[\[[^\]]*\]\])/g).filter(Boolean), [text])
  return (
    <span className="line-clamp-2 text-[13px] leading-relaxed text-[var(--fg-soft)]">
      {parts.map((part, i) =>
        part.startsWith('[[') && part.endsWith(']]') ? (
          <mark
            key={i}
            className="rounded bg-[var(--accent-soft)] px-0.5 font-medium text-[var(--accent)]"
          >
            {part.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  )
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const navigate = useNavigate()
  const { byId } = useTree()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  /** Мгновенные совпадения по заголовкам из уже загруженного дерева */
  const local = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const out: SearchHit[] = []
    for (const node of byId.values()) {
      const haystack = `${node.title} ${node.subtitle ?? ''}`.toLowerCase()
      if (!haystack.includes(q)) continue
      out.push({
        id: node.id,
        title: node.title,
        kind: node.kind,
        path: pathTo(byId, node.id).slice(0, -1).map((n) => n.title).join(' / ') || null,
        label: null,
        snippet: node.subtitle,
        rank: node.title.toLowerCase().startsWith(q) ? 3 : 2,
      })
      if (out.length > 30) break
    }
    return out.sort((a, b) => b.rank - a.rank)
  }, [query, byId])

  const results = useMemo(() => {
    // локальные совпадения по названию идут первыми, серверные добавляют текст блоков
    const seen = new Set(local.map((r) => r.id))
    return [...local, ...remote.filter((r) => !seen.has(r.id) || r.label)].slice(0, 40)
  }, [local, remote])

  useEffect(() => {
    if (!open) return
    setCursor(0)
    const q = query.trim()
    if (q.length < 2) {
      setRemote([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        setRemote(await searchAll(q))
      } catch {
        setRemote([])
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => clearTimeout(timer)
  }, [query, open])

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      setTimeout(() => inputRef.current?.focus(), 40)
      return () => {
        document.body.style.overflow = prev
      }
    }
    setQuery('')
    setRemote([])
  }, [open])

  const go = useCallback(
    (id: string) => {
      haptic.hit()
      onClose()
      navigate(`/n/${id}`)
    },
    [navigate, onClose],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && results[cursor]) {
      e.preventDefault()
      go(results[cursor].id)
    }
  }

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center px-3 pt-[8vh] sm:pt-[12vh]">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px] animate-fade-up" onClick={onClose} />

      <div
        className="app-zoom animate-pop-in relative flex w-full max-w-2xl flex-col overflow-hidden
          rounded-3xl border border-[var(--line)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4">
          <Search size={19} className="shrink-0 text-[var(--fg-faint)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти анализ, термин, тему…"
            className="h-14 flex-1 bg-transparent text-[16px] text-[var(--fg)]
              placeholder:text-[var(--fg-faint)] focus:outline-none"
          />
          {loading && <Spinner className="text-[var(--fg-faint)]" />}
          <button
            onClick={onClose}
            aria-label="Закрыть поиск"
            className="rounded-lg p-1.5 text-[var(--fg-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
          >
            <X size={17} />
          </button>
        </div>

        <div
          ref={listRef}
          className="overflow-y-auto scrollbar-slim p-2"
          style={{ maxHeight: 'calc(60vh / var(--app-zoom))' }}
        >
          {query.trim().length < 2 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--fg-faint)]">
              Введите минимум два символа — поиск идёт и по названиям, и по тексту конспектов
            </p>
          ) : results.length === 0 && !loading ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--fg-faint)]">
              Ничего не нашлось по запросу «{query.trim()}»
            </p>
          ) : (
            results.map((hit, i) => (
              <button
                // одна карточка может встретиться несколько раз — по разу на каждый блок
                key={`${hit.id}|${hit.label ?? ''}`}
                data-index={i}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(hit.id)}
                className={`flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left
                  transition-colors duration-100
                  ${i === cursor ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-subtle)]'}`}
              >
                <span
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg
                    bg-[var(--bg-subtle)] text-[var(--fg-soft)]"
                >
                  {hit.kind === 'card' ? <FileText size={15} /> : <FolderTree size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-medium">{hit.title}</span>
                    {hit.label && (
                      <span className="term shrink-0 text-[11.5px]" data-color={hit.color ?? 'gold'}>
                        {hit.label}
                      </span>
                    )}
                  </span>
                  {hit.path && (
                    <span className="block truncate text-[12px] text-[var(--fg-faint)]">{hit.path}</span>
                  )}
                  {hit.snippet && <Snippet text={hit.snippet} />}
                </span>
                {i === cursor && (
                  <CornerDownLeft size={15} className="mt-2 shrink-0 text-[var(--fg-faint)]" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
