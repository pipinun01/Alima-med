import { useEffect, useState } from 'react'
import { Button, ErrorNote, Field, Modal, Spinner } from './ui'
import type { NodeKind } from '@/lib/types'
import type { ParentChoice } from '@/lib/tree'

export interface NodeFormValue {
  title: string
  subtitle: string
  kind: NodeKind
  icon: string
  /** Раздел, в котором лежит запись: null — верхний уровень. Не задано — не менять */
  parent_id?: string | null
}

const KINDS: { value: NodeKind; label: string; hint: string }[] = [
  { value: 'chapter', label: 'Глава', hint: 'Верхний уровень: Гинекология, Терапия' },
  { value: 'topic',   label: 'Тема',  hint: 'Внутри главы: Анализы, Анатомия, ЭКО' },
  { value: 'branch',  label: 'Ветка', hint: 'Внутри темы: Гормоны, Биохимия, Коагулограмма' },
  { value: 'card',    label: 'Карточка', hint: 'Конечная запись: ТПО, Ферритин — блоки с текстом и фото' },
]

export function NodeFormModal({
  open,
  title,
  initial,
  lockKind,
  parents,
  hasChildren,
  saving,
  onSubmit,
  onClose,
}: {
  open: boolean
  title: string
  initial?: Partial<NodeFormValue>
  lockKind?: boolean
  /** Если передан список — можно выбрать, в какой раздел переложить запись */
  parents?: ParentChoice[]
  /** Внутри уже есть записи: карточкой такую запись не сделать */
  hasChildren?: boolean
  saving?: boolean
  onSubmit: (value: NodeFormValue) => void | Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState<NodeFormValue>({
    title: '',
    subtitle: '',
    kind: 'branch',
    icon: '',
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValue({
        title: initial?.title ?? '',
        subtitle: initial?.subtitle ?? '',
        kind: initial?.kind ?? 'branch',
        icon: initial?.icon ?? '',
        parent_id: initial?.parent_id,
      })
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async () => {
    if (!value.title.trim()) return
    setError(null)
    try {
      await onSubmit({ ...value, title: value.title.trim() })
    } catch (e) {
      // Окно остаётся открытым, введённое не теряется — можно нажать ещё раз
      setError(e instanceof Error ? e.message : 'Не сохранилось')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field
          label="Название"
          value={value.title}
          autoFocus
          required
          placeholder="Например: Гормоны"
          onChange={(e) => setValue((v) => ({ ...v, title: e.target.value }))}
        />
        <Field
          label="Подзаголовок"
          value={value.subtitle}
          placeholder="Короткое пояснение, необязательно"
          onChange={(e) => setValue((v) => ({ ...v, subtitle: e.target.value }))}
        />
        <Field
          label="Иконка"
          value={value.icon}
          placeholder="🧪 — один эмодзи, необязательно"
          maxLength={8}
          onChange={(e) => setValue((v) => ({ ...v, icon: e.target.value }))}
        />

        {parents && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-[var(--fg-soft)]">Где лежит</span>
            <select
              value={value.parent_id ?? ''}
              onChange={(e) => setValue((v) => ({ ...v, parent_id: e.target.value || null }))}
              className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg-card)] px-3
                text-[15px] text-[var(--fg)] focus:border-[var(--accent)] focus:outline-none
                focus:ring-4 focus:ring-[rgb(var(--accent-glow)/0.12)]"
            >
              {parents.map((p) => (
                <option key={p.id ?? 'root'} value={p.id ?? ''}>
                  {'  '.repeat(p.depth) + (p.depth ? '└ ' : '') + p.label}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-xs text-[var(--fg-faint)]">
              Запись переедет в выбранный раздел вместе со всем, что внутри
            </span>
          </label>
        )}

        {!lockKind && (
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-[var(--fg-soft)]">Тип</span>
            <div className="grid gap-1.5">
              {KINDS.map((k) => {
                const blocked = k.value === 'card' && hasChildren && value.kind !== 'card'
                return (
                  <label
                    key={k.value}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 transition-colors duration-150
                      ${blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                      ${
                        value.kind === k.value
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--line)] hover:bg-[var(--bg-subtle)]'
                      }`}
                  >
                    <input
                      type="radio"
                      name="kind"
                      className="mt-1 accent-[var(--accent)]"
                      checked={value.kind === k.value}
                      disabled={blocked}
                      onChange={() => setValue((v) => ({ ...v, kind: k.value }))}
                    />
                    <span>
                      <span className="block text-[14px] font-medium">{k.label}</span>
                      <span className="block text-[12.5px] text-[var(--fg-soft)]">
                        {blocked ? 'Внутри уже есть записи — карточка их не покажет' : k.hint}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={saving || !value.title.trim()}>
            {saving && <Spinner />}
            {error ? 'Попробовать ещё раз' : 'Сохранить'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  )
}
