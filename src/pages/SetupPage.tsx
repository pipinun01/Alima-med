import { Database } from 'lucide-react'

const STEPS = [
  ['Создайте проект на supabase.com', 'Регион — ближайший к вам, пароль базы сохраните.'],
  [
    'Откройте SQL Editor и выполните supabase/schema.sql',
    'Затем при желании supabase/seed.sql — это демо-структура.',
  ],
  [
    'Нажмите Connect вверху дашборда',
    'Вкладка App Frameworks → React + Vite. Там сразу готовы и адрес, и ключ.',
  ],
  [
    'Скопируйте .env.example в .env.local',
    'Вставьте адрес и один ключ: publishable (sb_publishable_…) или anon (eyJ…).',
  ],
  ['Перезапустите npm run dev', 'Переменные читаются только при старте.'],
]

/** Показывается, пока не заданы переменные окружения Supabase */
export function SetupPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-8">
      <span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Database size={22} />
      </span>
      <h1 className="font-display text-[26px] font-bold tracking-tight">Осталось подключить базу</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--fg-soft)]">
        Приложение собрано, но не знает, куда ходить за данными. Пять шагов — и всё заработает.
      </p>

      <ol className="mt-8 space-y-3">
        {STEPS.map(([title, hint], i) => (
          <li
            key={title}
            className="flex gap-3.5 rounded-[var(--radius-card)] border border-[var(--line)]
              bg-[var(--bg-card)] p-4"
          >
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px]
                font-semibold text-[var(--accent-fg)]"
              style={{ background: 'var(--grad)' }}
            >
              {i + 1}
            </span>
            <span>
              <span className="block text-[14.5px] font-medium">{title}</span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-[var(--fg-soft)]">{hint}</span>
            </span>
          </li>
        ))}
      </ol>

      <pre
        className="mt-6 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line)]
          bg-[var(--bg-subtle)] p-4 text-[12.5px] leading-relaxed"
      >
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# или, если у проекта старый ключ:
# VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}
      </pre>
      <p className="mt-3 text-[13px] text-[var(--fg-faint)]">
        Подробности — в README.md и docs/SETUP.md
      </p>
    </div>
  )
}
