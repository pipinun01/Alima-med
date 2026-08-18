import { useEffect, useState } from 'react'
import { Button, Field, Modal, Spinner } from './ui'
import type { NodeKind } from '@/lib/types'

export interface NodeFormValue {
  title: string
  subtitle: string
  kind: NodeKind
  icon: string
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
  saving,
  onSubmit,
  onClose,
}: {
  open: boolean
  title: string
  initial?: Partial<NodeFormValue>
  lockKind?: boolean
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

  useEffect(() => {
    if (open) {
      setValue({
        title: initial?.title ?? '',
        subtitle: initial?.subtitle ?? '',
        kind: initial?.kind ?? 'branch',
        icon: initial?.icon ?? '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.title.trim()) void onSubmit({ ...value, title: value.title.trim() })
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
          maxLength={4}
          onChange={(e) => setValue((v) => ({ ...v, icon: e.target.value }))}
        />

        {!lockKind && (
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-[var(--fg-soft)]">Тип</span>
            <div className="grid gap-1.5">
              {KINDS.map((k) => (
                <label
                  key={k.value}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3
                    transition-colors duration-150
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
                    onChange={() => setValue((v) => ({ ...v, kind: k.value }))}
                  />
                  <span>
                    <span className="block text-[14px] font-medium">{k.label}</span>
                    <span className="block text-[12.5px] text-[var(--fg-soft)]">{k.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={saving || !value.title.trim()}>
            {saving && <Spinner />}
            Сохранить
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  )
}
