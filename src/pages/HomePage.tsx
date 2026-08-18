import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Clock, FolderPlus, Library, Search, Sparkles } from 'lucide-react'
import { useTree } from '@/context/TreeContext'
import { useAuth } from '@/context/AuthContext'
import { NodeCard, plural } from '@/components/NodeCard'
import { NodeFormModal, type NodeFormValue } from '@/components/NodeFormModal'
import { Button, EmptyState } from '@/components/ui'
import { countCards, nextPosition, pathTo } from '@/lib/tree'
import { useSearchPalette } from '@/context/SearchContext'

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')} назад`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${plural(hours, 'час', 'часа', 'часов')} назад`
  const days = Math.round(hours / 24)
  if (days < 31) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function HomePage() {
  const { roots, byId, loading, createNode } = useTree()
  const { isEditor } = useAuth()
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const search = useSearchPalette()

  const totalCards = useMemo(() => roots.reduce((sum, r) => sum + countCards(r), 0), [roots])

  const recent = useMemo(
    () =>
      [...byId.values()]
        .filter((n) => n.kind === 'card')
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 6),
    [byId],
  )

  const submit = async (value: NodeFormValue) => {
    setSaving(true)
    try {
      await createNode({
        parent_id: null,
        title: value.title,
        subtitle: value.subtitle || null,
        kind: 'chapter',
        icon: value.icon || null,
        position: nextPosition(roots),
      })
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-8">
      {/* ─── Шапка ─────────────────────────────────────────────────────────── */}
      <section className="animate-fade-up py-10 sm:py-16">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)]
          bg-[var(--bg-card)] px-3 py-1 text-[12px] font-medium text-[var(--fg-soft)]">
          <Sparkles size={12} className="text-[var(--accent)]" />
          Учебная база конспектов
        </p>
        <h1 className="font-display text-[clamp(2rem,6vw,3.25rem)] font-bold leading-[1.08] tracking-[-0.03em]">
          Главы, темы, ветки{' '}
          <br className="max-sm:hidden" />
          <span className="text-grad">и карточки в одной структуре</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-[var(--fg-soft)]">
          Глава → тема → ветка → карточка. Ничего не сваливается в кучу: у каждого показателя
          своя карточка, а внутри — блоки с цветными метками терминов, текстом и фотографиями.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          {roots[0] && (
            <Button onClick={() => navigate(`/n/${roots[0].id}`)}>
              <Library size={16} />
              Открыть «{roots[0].title}»
            </Button>
          )}
          <Button
            variant="outline"
            onClick={search.open}
          >
            <Search size={16} />
            Найти анализ или термин
          </Button>
          {isEditor && (
            <Button variant="soft" onClick={() => setAdding(true)}>
              <FolderPlus size={16} />
              Новая глава
            </Button>
          )}
        </div>

        {!loading && roots.length > 0 && (
          <p className="mt-6 text-[13px] text-[var(--fg-faint)]">
            {roots.length} {plural(roots.length, 'глава', 'главы', 'глав')} ·{' '}
            {totalCards} {plural(totalCards, 'карточка', 'карточки', 'карточек')}
          </p>
        )}
      </section>

      {/* ─── Предметы ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[var(--radius-card)] bg-[var(--bg-subtle)]" />
          ))}
        </div>
      ) : roots.length === 0 ? (
        <EmptyState
          icon={<Library size={22} />}
          title="Здесь пока пусто"
          description={
            isEditor
              ? 'Создайте первую главу — например «Гинекология», а внутри уже темы, ветки и карточки.'
              : 'Владелец базы ещё не добавил главы.'
          }
          action={
            isEditor && (
              <Button onClick={() => setAdding(true)}>
                <FolderPlus size={16} />
                Создать главу
              </Button>
            )
          }
        />
      ) : (
        <section>
          <h2 className="mb-3 font-display text-[15px] font-semibold tracking-tight text-[var(--fg-soft)]">
            Главы
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roots.map((node, i) => (
              <NodeCard key={node.id} node={node} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* ─── Недавно обновлённое ───────────────────────────────────────────── */}
      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight text-[var(--fg-soft)]">
            <Clock size={14} />
            Недавно дополнено
          </h2>
          <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-card)]">
            {recent.map((node) => {
              const parents = pathTo(byId, node.id).slice(0, -1).map((n) => n.title).join(' / ')
              return (
                <li key={node.id} className="border-b border-[var(--line)] last:border-0">
                  <Link
                    to={`/n/${node.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{node.title}</span>
                      {parents && (
                        <span className="block truncate text-[12px] text-[var(--fg-faint)]">{parents}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[12px] text-[var(--fg-faint)]">
                      {relativeTime(node.updated_at)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <NodeFormModal
        open={adding}
        title="Новая глава"
        initial={{ kind: 'chapter' }}
        lockKind
        saving={saving}
        onSubmit={submit}
        onClose={() => setAdding(false)}
      />
    </div>
  )
}
