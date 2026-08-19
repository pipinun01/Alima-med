import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, LogOut, Menu, PenLine, Search, Settings2, X } from 'lucide-react'
import { Logo } from './Logo'
import { Sidebar } from './Sidebar'
import { SearchPalette } from './SearchPalette'
import { ThemeSwitcher } from './ThemeSwitcher'
import { IconButton } from './ui'
import { useAuth } from '@/context/AuthContext'
import { inTelegram } from '@/lib/telegram'
import { SearchContext } from '@/context/SearchContext'
import { SettingsModal } from './SettingsModal'
import { BackgroundLayer } from './BackgroundLayer'
import { useSettings } from '@/context/SettingsContext'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false)
  const [search, setSearch] = useState(false)
  const [settings, setSettings] = useState(false)
  const { session, isEditor, signOut } = useAuth()
  const { effective } = useSettings()
  const location = useLocation()
  const navigate = useNavigate()

  const searchApi = useMemo(() => ({ open: () => setSearch(true) }), [])

  useEffect(() => setDrawer(false), [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch(true)
      }
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName)) {
        const editing = (e.target as HTMLElement)?.closest?.('.ProseMirror')
        if (!editing) {
          e.preventDefault()
          setSearch(true)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative min-h-full">
      <BackgroundLayer setting={effective} />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[28rem] -z-10"
        style={{ background: 'var(--halo)' }}
        aria-hidden
      />

      <header
        className="glass sticky top-0 z-40 border-b border-[var(--line)]"
        style={{ paddingTop: inTelegram() ? 'env(safe-area-inset-top)' : undefined }}
      >
        <div className="app-zoom mx-auto flex h-15 max-w-[1400px] items-center gap-2 px-3 py-3 sm:px-5">
          <IconButton label="Меню" className="lg:hidden" onClick={() => setDrawer(true)}>
            <Menu size={19} />
          </IconButton>

          <Logo />

          <div className="flex-1" />

          <button
            onClick={() => setSearch(true)}
            className="group flex h-9 items-center gap-2 rounded-xl border border-[var(--line)]
              bg-[var(--bg-card)] pl-3 pr-2 text-[13.5px] text-[var(--fg-faint)]
              shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--line-strong)]
              hover:text-[var(--fg-soft)] max-sm:w-9 max-sm:justify-center max-sm:px-0"
            aria-label="Поиск"
          >
            <Search size={16} className="shrink-0" />
            <span className="max-sm:hidden">Поиск</span>
            <kbd
              className="ml-4 hidden rounded-md border border-[var(--line)] bg-[var(--bg-subtle)]
                px-1.5 py-0.5 font-sans text-[11px] text-[var(--fg-faint)] sm:inline-block"
            >
              ⌘K
            </kbd>
          </button>

          <IconButton label="Настройки" onClick={() => setSettings(true)}>
            <Settings2 size={18} />
          </IconButton>

          {isEditor && (
            <IconButton
              label="Панель редактора"
              onClick={() => navigate('/edit')}
              className="text-[var(--accent)]"
            >
              <PenLine size={18} />
            </IconButton>
          )}

          {session ? (
            <IconButton label="Выйти" onClick={() => void signOut()}>
              <LogOut size={18} />
            </IconButton>
          ) : (
            <IconButton label="Войти" onClick={() => navigate('/login')}>
              <LogIn size={18} />
            </IconButton>
          )}
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] items-start">
        <aside
          className="app-zoom sticky top-15 hidden w-72 shrink-0 overflow-y-auto
            scrollbar-slim border-r border-[var(--line)] py-3 lg:block"
          style={{ height: 'calc((100dvh - 3.75rem * var(--app-zoom)) / var(--app-zoom))' }}
        >
          <Sidebar />
        </aside>

        <main className="app-zoom min-w-0 flex-1 pb-24">
          <SearchContext.Provider value={searchApi}>{children}</SearchContext.Provider>
        </main>
      </div>

      {/* Мобильная шторка с деревом */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Навигация">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-up" onClick={() => setDrawer(false)} />
          <div
            className="app-zoom animate-fade-up absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col
              border-r border-[var(--line)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <Logo />
              <IconButton label="Закрыть" onClick={() => setDrawer(false)}>
                <X size={18} />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-slim">
              <Sidebar onNavigate={() => setDrawer(false)} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
              <ThemeSwitcher />
              <Link to="/login" className="text-[13px] text-[var(--fg-faint)] hover:text-[var(--fg)]">
                {session ? 'Аккаунт' : 'Войти'}
              </Link>
            </div>
          </div>
        </div>
      )}

      <SearchPalette open={search} onClose={() => setSearch(false)} />
      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  )
}
