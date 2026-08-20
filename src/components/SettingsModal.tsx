import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check, CloudDownload, Eye, EyeOff, Flower2, ImageUp, Share, Smartphone, Trash2, WifiOff,
} from 'lucide-react'
import { THEMES, THEME_META, useTheme } from '@/context/ThemeContext'
import { SCALES, useSettings } from '@/context/SettingsContext'
import { useAuth } from '@/context/AuthContext'
import { useTree } from '@/context/TreeContext'
import { uploadImage } from '@/lib/api'
import { PRESET_LABELS, type BackgroundPreset, type BackgroundSetting } from '@/lib/settings'
import {
  clearOffline, offlineStats, offlineSupported, prefetchForOffline,
  type OfflineStats, type PrefetchProgress,
} from '@/lib/offline'
import { useInstall } from '@/lib/install'
import { plural } from '@/lib/plural'
import { haptic } from '@/lib/telegram'
import { Button, ErrorNote, Modal, Spinner } from './ui'

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

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

/* ─── Установка на устройство ───────────────────────────────────────────── */

function InstallSection() {
  const { available, install, standalone, ios } = useInstall()

  if (standalone) {
    return (
      <p className="mt-6 flex items-center gap-2 text-[12.5px] text-[var(--fg-faint)]">
        <Smartphone size={14} />
        Открыто как приложение — всё на месте.
      </p>
    )
  }

  return (
    <section className="mt-6">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-medium text-[var(--fg-soft)]">
        <Smartphone size={14} className="text-[var(--accent)]" />
        Приложение на устройстве
      </h3>

      {available ? (
        <>
          <Button
            onClick={() => {
              haptic.tap()
              void install()
            }}
          >
            <Smartphone size={16} />
            Установить приложение
          </Button>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--fg-soft)]">
            Появится значок на экране, конспекты будут открываться без адресной строки.
          </p>
        </>
      ) : ios ? (
        <p className="rounded-2xl border border-[var(--line)] p-3.5 text-[13px] leading-relaxed text-[var(--fg-soft)]">
          В Safari нажмите{' '}
          <Share size={13} className="mx-0.5 inline align-[-2px] text-[var(--accent)]" />{' '}
          <b>Поделиться</b> внизу экрана → <b>На экран «Домой»</b>. Появится значок, и конспекты
          будут открываться как приложение.
        </p>
      ) : (
        <p className="rounded-2xl border border-[var(--line)] p-3.5 text-[13px] leading-relaxed text-[var(--fg-soft)]">
          В меню браузера выберите <b>Установить приложение</b> (в Chrome — значок с плюсом справа
          в адресной строке). В Telegram установка недоступна: откройте сайт в браузере.
        </p>
      )}
    </section>
  )
}

/* ─── Чтение без интернета ──────────────────────────────────────────────── */

function OfflineSection() {
  const { byId } = useTree()
  const [stats, setStats] = useState<OfflineStats | null>(null)
  const [progress, setProgress] = useState<PrefetchProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    void offlineStats().then(setStats)
  }, [])

  useEffect(refresh, [refresh])

  if (!offlineSupported()) return null

  const cardIds = [...byId.values()].filter((n) => n.kind === 'card').map((n) => n.id)

  const download = async () => {
    setBusy(true)
    setError(null)
    try {
      await prefetchForOffline(cardIds, setProgress)
      haptic.ok()
    } catch {
      haptic.err()
      setError('Не всё удалось скачать — попробуйте ещё раз при хорошей связи')
    } finally {
      setBusy(false)
      setProgress(null)
      refresh()
    }
  }

  const percent = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <section className="mt-6">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-medium text-[var(--fg-soft)]">
        <WifiOff size={14} className="text-[var(--accent)]" />
        Чтение без интернета
      </h3>

      <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--fg-soft)]">
        Открытые страницы сохраняются сами. Кнопка ниже скачивает сразу все карточки с фотографиями
        — после этого конспекты читаются в метро и в самолёте. Дополнять базу без сети нельзя.
      </p>

      {busy && progress ? (
        <div className="rounded-2xl border border-[var(--line)] p-3.5">
          <p className="flex items-center gap-2 text-[13px] text-[var(--fg-soft)]">
            <Spinner />
            {progress.stage === 'cards' ? 'Скачиваю карточки' : 'Скачиваю фотографии'} —{' '}
            {progress.done} из {progress.total}
          </p>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
            <div
              className="h-full rounded-full transition-[width] duration-200"
              style={{ width: `${percent}%`, background: 'var(--grad)' }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void download()} disabled={busy || cardIds.length === 0}>
            <CloudDownload size={16} />
            Скачать {cardIds.length} {plural(cardIds.length, 'карточку', 'карточки', 'карточек')}
          </Button>
          {stats && (stats.data > 0 || stats.media > 0) && (
            <Button
              variant="ghost"
              onClick={async () => {
                await clearOffline()
                refresh()
              }}
            >
              <Trash2 size={15} />
              Очистить
            </Button>
          )}
        </div>
      )}

      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}

      {stats?.savedAt && !busy && (
        <p className="mt-2 text-[12px] text-[var(--fg-faint)]">
          Скачано целиком {dateTime(stats.savedAt)} · сохранено {stats.data} ответов и {stats.media}{' '}
          файлов
        </p>
      )}
    </section>
  )
}

/* ─── Всё окно ──────────────────────────────────────────────────────────── */

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme } = useTheme()
  const { background, hidden, setHidden, scale, setScale, save, preview } = useSettings()
  const { isEditor } = useAuth()

  const [draft, setDraft] = useState<BackgroundSetting>(background)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setDraft(background)
      setError(null)
    }
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
    setError(null)
    try {
      const { url } = await uploadImage(file)
      setDraft((d) => ({ ...d, kind: 'photo', url }))
      haptic.ok()
    } catch (e) {
      haptic.err()
      setError(`Не удалось загрузить фото: ${e instanceof Error ? e.message : 'ошибка'}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Настройки">
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

      {/* ─── Размер текста ───────────────────────────────────────────────── */}
      <section className="mt-6">
        <h3 className="mb-2.5 text-[13px] font-medium text-[var(--fg-soft)]">
          Размер текста
          <span className="ml-1.5 font-normal text-[var(--fg-faint)]">только на этом устройстве</span>
        </h3>
        <div className="grid grid-cols-5 gap-2">
          {SCALES.map((value, i) => (
            <button
              key={value}
              onClick={() => {
                haptic.tap()
                setScale(value)
              }}
              aria-pressed={scale === value}
              className={`flex flex-col items-center gap-1 rounded-2xl border py-2.5 transition-colors
                ${
                  scale === value
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line)] text-[var(--fg-soft)] hover:bg-[var(--bg-subtle)]'
                }`}
            >
              <span
                className="font-display font-semibold leading-none"
                style={{ fontSize: [13, 16, 19, 22, 26][i] }}
              >
                А
              </span>
              <span className="text-[10.5px] tabular-nums text-[var(--fg-faint)]">
                {Math.round(value * 100)}%
              </span>
            </button>
          ))}
        </div>
      </section>

      <InstallSection />
      <OfflineSection />

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

            {/* Кнопка «убрать» лежит рядом, а не внутри: кнопка в кнопке — невалидная разметка */}
            <div className="relative col-span-2">
              <button
                onClick={() => fileRef.current?.click()}
                className={`flex w-full items-center gap-2.5 rounded-2xl border p-3 text-left transition-colors
                  ${draft.kind === 'photo' && draft.url ? 'pr-12' : ''}
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
              </button>
              {draft.kind === 'photo' && draft.url && (
                <button
                  type="button"
                  aria-label="Убрать фото"
                  title="Убрать фото"
                  onClick={() => setDraft((d) => ({ ...d, kind: 'preset', preset: d.preset ?? 'peonies', url: null }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--fg-faint)]
                    hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
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

          {error && <ErrorNote className="mt-4">{error}</ErrorNote>}

          <div className="mt-5 flex gap-2">
            <Button
              disabled={!dirty || busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  await save(draft)
                  haptic.ok()
                  onClose()
                } catch (e) {
                  setError(`Не сохранилось: ${e instanceof Error ? e.message : 'ошибка'}`)
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
