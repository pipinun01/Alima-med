import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button, ErrorNote, Field, Spinner } from '@/components/ui'

export function LoginPage() {
  const { session, isEditor, signIn, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  if (session) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-8">
        <div className="animate-fade-up rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-card)] p-6 text-center shadow-[var(--shadow-sm)]">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <ShieldCheck size={22} />
          </span>
          <p className="font-display text-[17px] font-semibold tracking-tight">Вы вошли</p>
          <p className="mt-1 text-[14px] text-[var(--fg-soft)]">{session.user.email}</p>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--fg-soft)]">
            {isEditor
              ? 'Права редактора активны — можно создавать разделы и писать конспекты.'
              : 'Аккаунт есть, но прав редактора нет. Добавьте свой user id в таблицу editors (см. документацию).'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" onClick={() => navigate('/')}>
              К конспектам
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              <LogOut size={16} />
              Выйти
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-8">
      <form
        onSubmit={submit}
        className="animate-fade-up rounded-[var(--radius-card)] border border-[var(--line)]
          bg-[var(--bg-card)] p-6 shadow-[var(--shadow-md)]"
      >
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <KeyRound size={22} />
        </span>
        <h1 className="font-display text-[20px] font-bold tracking-tight">Вход для редактора</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--fg-soft)]">
          Читать конспекты можно без входа. Вход нужен, только чтобы дополнять базу.
        </p>

        <div className="mt-6 space-y-3">
          <Field
            label="Почта"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Пароль"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <ErrorNote className="mt-4">{error}</ErrorNote>}

        <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>
          {busy && <Spinner />}
          Войти
        </Button>
      </form>
    </div>
  )
}
