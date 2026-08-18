import { THEMES, THEME_META, useTheme } from '@/context/ThemeContext'
import { haptic } from '@/lib/telegram'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-[var(--line)]
        bg-[var(--bg-card)] p-1 shadow-[var(--shadow-sm)]"
      role="radiogroup"
      aria-label="Тема оформления"
    >
      {THEMES.map((t) => {
        const active = theme === t
        return (
          <button
            key={t}
            role="radio"
            aria-checked={active}
            aria-label={THEME_META[t].label}
            title={THEME_META[t].label}
            onClick={() => {
              haptic.tap()
              setTheme(t)
            }}
            className={`relative h-6 w-6 rounded-full transition-transform duration-200
              ${active ? 'scale-100' : 'scale-90 opacity-70 hover:opacity-100 hover:scale-95'}`}
          >
            <span
              className="absolute inset-0 rounded-full border border-black/10 dark:border-white/15"
              style={{ background: THEME_META[t].swatch }}
            />
            {active && (
              <span
                className="absolute -inset-[3px] rounded-full border-2 border-[var(--accent)]"
                aria-hidden
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
