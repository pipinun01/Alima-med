import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff, Flower2, ImageUp, Trash2 } from 'lucide-react'
import { THEMES, THEME_META, useTheme } from '@/context/ThemeContext'
import { useSettings } from '@/context/SettingsContext'
import { useAuth } from '@/context/AuthContext'
import { uploadImage } from '@/lib/api'
import { PRESET_LABELS, type BackgroundPreset, type BackgroundSetting } from '@/lib/settings'
import { haptic } from '@/lib/telegram'
import { Button, Modal, Spinner } from './ui'

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[13px] text-[var(--fg-soft)]">
        {label}
        <span className="tabular-nums text-[var(--fg-faint)]">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  )
}

export function AppearanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme } = useTheme()
  const { background, hidden, setHidden, save, preview } = useSettings()
  const { isEditor } = useAuth()

  const [draft, setDraft] = useState<BackgroundSetting>(background)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setDraft(background)
  }, [open, background])

  // Живой предпросмотр: меняем фон сразу, но в базу пишем только по кнопке
  useEffect(() => {
    if (!open) return preview(null)
    preview(draft)
    return () => preview(null)
  }, [open, draft, preview])

  const dirty = JSON.stringify(draft) !== JSON.stringify(background)

  const options: { key: string; value: BackgroundSetting; title: string; hint: string }[] = [
    { key: 'none', value: { ...draft, kind: 'none' }, title: 'Без фона', hint: 'Чистое полотно' },
    ...(Object.keys(PRESET_LABELS) as BackgroundPreset[]).map((preset) => ({
      key: preset,
      value: { ...draft, kind: 'preset' as const, preset },
      title: PRESET_LABELS[preset].title,
      hint: PRESET_LABELS[preset].hint,
    })),
  ]

  const pickPhoto = async (file: File) => {
    setUploading(true)
    try {
      const url = await uploadImage(file)
      setDraft((d) => ({ ...d, kind: 'photo', url }))
      haptic.ok()
    } catch (e) {
      haptic.err()
      window.alert(`Не удалось загрузить фото: ${e instanceof Error ? e.message : 'ошибка'}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Оформление">
      {/* ─── Тема ────────────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-2.5 text-[13px] font-medium text-[var(--fg-soft)]">Тема</h3>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <button
              key={t}
              onClick={() => {
                haptic.tap()
                setTheme(t)
              }}
              className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition-colors
                ${
                  theme === t
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--line)] hover:bg-[var(--bg-subtle)]'
                }`}
            >
              <span
                className="h-9 w-9 rounded-full border border-black/10 shadow-inner dark:border-white/15"
                style={{ background: THEME_META[t].swatch }}
              />
              <span className="text-[12.5px] font-medium">{THEME_META[t].label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ─── Показывать ли фон у себя ────────────────────────────────────── */}
      <section className="mt-6">
        <button
          onClick={() => setHidden(!hidden)}
          className="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)]
            p-3.5 text-left transition-colors hover:bg-[var(--bg-subtle)]"
        >
          {hidden ? (
            <EyeOff size={18} className="text-[var(--fg-faint)]" />
          ) : (
            <Eye size={18} className="text-[var(--accent)]" />
          )}
          <span className="flex-1">
            <span className="block text-[14px] font-medium">
              {hidden ? 'Фон скрыт' : 'Фон показывается'}
            </span>
            <span className="block text-[12.5px] text-[var(--fg-soft)]">
              Настройка только для этого устройства
            </span>
          </span>
          <span
            className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors
              ${hidden ? 'bg-[var(--line-strong)]' : 'bg-[var(--accent)]'}`}
          >
            <span
              className="block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
              style={{ transform: hidden ? 'none' : 'translateX(1.25rem)' }}
            />
          </span>
        </button>
      </section>

      {/* ─── Настройка фона для всех (только редактор) ───────────────────── */}
      {isEditor ? (
        <section className="mt-6">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-medium text-[var(--fg-soft)]">
            <Flower2 size={14} className="text-[var(--accent)]" />
            Фон для всех
          </h3>

          <div className="grid grid-cols-2 gap-2">
            {options.map((option) => {
              const active =
                draft.kind === option.value.kind &&
                (option.value.kind !== 'preset' || draft.preset === option.value.preset)
              return (
                <button
                  key={option.key}
                  onClick={() => setDraft(option.value)}
                  className={`rounded-2xl border p-3 text-left transition-colors
                    ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--line)] hover:bg-[var(--bg-subtle)]'
                    }`}
                >
                  <span className="block text-[13.5px] font-medium">{option.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-[var(--fg-soft)]">
                    {option.hint}
                  </span>
                </button>
              )
            })}

            <button
              onClick={() => fileRef.current?.click()}
              className={`col-span-2 flex items-center gap-2.5 rounded-2xl border p-3 text-left
                transition-colors
                ${
                  draft.kind === 'photo'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--line)] hover:bg-[var(--bg-subtle)]'
                }`}
            >
              {uploading ? <Spinner /> : <ImageUp size={17} className="shrink-0 text-[var(--fg-soft)]" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">Своё фото</span>
                <span className="block truncate text-[12px] text-[var(--fg-soft)]">
                  {draft.kind === 'photo' && draft.url ? draft.url.split('/').pop() : 'Например, пионы с телефона'}
                </span>
              </span>
              {draft.kind === 'photo' && draft.url && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Убрать фото"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDraft((d) => ({ ...d, kind: 'preset', preset: d.preset ?? 'peonies', url: null }))
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && setDraft((d) => ({ ...d, kind: 'preset', url: null }))}
                  className="rounded-lg p-1.5 text-[var(--fg-faint)] hover:bg-[var(--bg-hover)] hover:text-red-600"
                >
                  <Trash2 size={15} />
                </span>
              )}
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void pickPhoto(file)
              e.target.value = ''
            }}
          />

          {draft.kind !== 'none' && (
            <div className="mt-4 space-y-3.5">
              <Slider
                label="Насыщенность"
                value={draft.intensity}
                min={0.1}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setDraft((d) => ({ ...d, intensity: v }))}
              />
              <Slider
                label="Размытие"
                value={draft.blur}
                min={0}
                max={20}
                step={1}
                format={(v) => `${v} px`}
                onChange={(v) => setDraft((d) => ({ ...d, blur: v }))}
              />
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <Button
              disabled={!dirty || busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await save(draft)
                  haptic.ok()
                  onClose()
                } catch (e) {
                  window.alert(`Не сохранилось: ${e instanceof Error ? e.message : 'ошибка'}`)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? <Spinner /> : <Check size={16} />}
              Сохранить для всех
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(background)}>
                Сбросить
              </Button>
            )}
          </div>
        </section>
      ) : (
        <p className="mt-6 text-[12.5px] leading-relaxed text-[var(--fg-faint)]">
          Общий фон настраивает редактор базы. У себя его всегда можно скрыть переключателем выше.
        </p>
      )}
    </Modal>
  )
}
