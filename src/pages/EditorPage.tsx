import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CircleDashed, FolderPlus, Layers, Lock, PenLine } from 'lucide-react'
import { useTree } from '@/context/TreeContext'
import { useAuth } from '@/context/AuthContext'
import { fetchEmptyCards } from '@/lib/api'
import { countCards, nextPosition, pathTo } from '@/lib/tree'
import { NodeFormModal, type NodeFormValue } from '@/components/NodeFormModal'
import { Button, EmptyState } from '@/components/ui'
import { plural } from '@/components/NodeCard'
import { TERM_LABELS, type TermColor } from '@/lib/types'

export function EditorPage() {
  const { isEditor, session } = useAuth()
  const { roots, byId, createNode } = useTree()
  const [empty, setEmpty] = useState<{ id: string; title: string }[]>([])
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  const totals = useMemo(
    () => ({
      chapters: roots.length,
      nodes: byId.size,
      cards: roots.reduce((sum, r) => sum + countCards(r), 0),
    }),
    [roots, byId],
  )

  useEffect(() => {
    if (isEditor) fetchEmptyCards().then(setEmpty).catch(() => setEmpty([]))
  }, [isEditor])

  if (!isEditor) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-8">
        <EmptyState
          icon={<Lock size={22} />}
          title="Только для редактора"
          description={
            session
              ? 'Аккаунт не в списке редакторов. Добавьте его user id в таблицу editors.'
              : 'Войдите под аккаунтом редактора, чтобы попасть в панель.'
          }
          action={<Button onClick={() => navigate(session ? '/' : '/login')}>
            {session ? 'К конспектам' : 'Войти'}
          </Button>}
        />
      </div>
    )
  }

  const submit = async (value: NodeFormValue) => {
    setSaving(true)
    try {
      const created = await createNode({
        parent_id: null,
        title: value.title,
        subtitle: value.subtitle || null,
        kind: 'chapter',
        icon: value.icon || null,
        position: nextPosition(roots),
      })
      setAdding(false)
      navigate(`/n/${created.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-8">
      <h1 className="font-display text-[26px] font-bold tracking-tight">Панель редактора</h1>
      <p className="mt-1.5 text-[15px] text-[var(--fg-soft)]">
        Вошли как {session?.user.email}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Глав', value: totals.chapters },
          { label: 'Всего записей', value: totals.nodes },
          { label: 'Карточек', value: totals.cards },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-card)] p-4"
          >
            <p className="font-display text-[26px] font-bold tabular-nums tracking-tight">{stat.value}</p>
            <p className="text-[13px] text-[var(--fg-soft)]">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => setAdding(true)}>
          <FolderPlus size={16} />
          Новая глава
        </Button>
        <Button variant="outline" onClick={() => navigate('/')}>
          <Layers size={16} />
          К дереву
        </Button>
      </div>

      {/* ─── Что осталось написать ─────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight text-[var(--fg-soft)]">
          <CircleDashed size={14} />
          Карточки без блоков
          {empty.length > 0 && (
            <span className="text-[12px] font-normal text-[var(--fg-faint)]">{empty.length}</span>
          )}
        </h2>
        {empty.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-card)] px-4 py-5 text-[14px] text-[var(--fg-soft)]">
            Все карточки заполнены — красиво.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-card)]">
            {empty.map((item) => (
              <li key={item.id} className="border-b border-[var(--line)] last:border-0">
                <Link
                  to={`/n/${item.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  <PenLine size={15} className="shrink-0 text-[var(--fg-faint)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{item.title}</span>
                    <span className="block truncate text-[12px] text-[var(--fg-faint)]">
                      {pathTo(byId, item.id).slice(0, -1).map((n) => n.title).join(' / ')}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Памятка по меткам ─────────────────────────────────────────────── */}
      <section className="mt-10 mb-4">
        <h2 className="mb-3 font-display text-[15px] font-semibold tracking-tight text-[var(--fg-soft)]">
          Цветные метки блоков
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(TERM_LABELS) as TermColor[]).map((color) => (
            <div
              key={color}
              className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-card)] p-4"
            >
              <span className="term text-[14px]" data-color={color}>
                {TERM_LABELS[color].name}
              </span>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--fg-soft)]">
                {TERM_LABELS[color].hint}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--fg-faint)]">
          Смысл цветов задаётся в одном месте — <code>src/lib/types.ts</code>, константа{' '}
          <code>TERM_LABELS</code>. Всего {plural(3, 'цвет', 'цвета', 'цветов')}: их видно и в
          карточке, и в поиске.
        </p>
      </section>

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
