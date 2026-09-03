import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, LockKeyhole, LogOut, ShieldCheck, Ticket, UserPlus } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { claimEditor, describeAuthError } from '@/lib/api'
import { haptic } from '@/lib/telegram'
import { Button, ErrorNote, Field, InfoNote, Spinner } from '@/components/ui'

/*
 * Вход, регистрация и то, что нужно уже вошедшему: получить права редактора
 * по коду приглашения и сменить пароль на тот, который легче запомнить.
 *
 * Права не выдаются просто за регистрацию: читать базу может кто угодно, и
 * иначе редактором стал бы любой, кто нашёл адрес. Секретную фразу владелец
 * задаёт один раз в базе (таблица editor_invite), а проверяет её функция
 * claim_editor — см. supabase/schema.sql.
 */

/** Ввод кода приглашения: показывается вошедшему, у которого прав ещё нет */
function InviteForm() {
  const { refreshEditor } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (await claimEditor(code)) {
        haptic.ok()
        await refreshEditor()
      } else {
        haptic.err()
        setError('Код не подошёл. Проверьте фразу — она вводится целиком, как её продиктовали')
      }
    } catch (err) {
      haptic.err()
      setError(describeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-2xl border border-[var(--line)] p-4">
      <h2 className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--fg-soft)]">
        <Ticket size={14} className="text-[var(--accent)]" />
        Код приглашения
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--fg-soft)]">
        Секретная фраза от владельца базы. Введёте верную — сразу появятся кнопки, чтобы
        создавать разделы и писать конспекты.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Field
          className="min-w-[12rem]"
          value={code}
          autoComplete="off"
          placeholder="Фраза целиком"
          aria-label="Код приглашения"
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" disabled={busy || !code.trim()}>
          {busy && <Spinner />}
          Получить права
        </Button>
      </div>
      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
    </form>
  )
}

/** Смена пароля на тот, который лучше запоминается */
function PasswordForm() {
  const { changePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== repeat) {
      setError('Пароли не совпадают — проверьте оба поля')
      return
    }
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      await changePassword(password)
      haptic.ok()
      setPassword('')
      setRepeat('')
      setDone(true)
    } catch (err) {
      haptic.err()
      setError(describeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border border-[var(--line)] p-4">
      <h2 className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--fg-soft)]">
        <LockKeyhole size={14} className="text-[var(--accent)]" />
        Сменить пароль
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--fg-soft)]">
        Новый пароль начнёт действовать сразу, на всех устройствах. Почта остаётся прежней.
      </p>
      <div className="mt-3 space-y-2.5">
        <Field
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setDone(false)
          }}
        />
        <Field
          label="Ещё раз"
          type="password"
          autoComplete="new-password"
          required
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value)
            setDone(false)
          }}
        />
      </div>
      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
      {done && <InfoNote className="mt-3">Пароль изменён — запомните новый.</InfoNote>}
      <Button type="submit" className="mt-3" disabled={busy || !password || !repeat}>
        {busy && <Spinner />}
        Сменить пароль
      </Button>
    </form>
  )
}

type Mode = 'in' | 'up'

export function LoginPage() {
  const { session, isEditor, signIn, signUp, signOut, refreshEditor } = useAuth()
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const submitIn = async () => {
    await signIn(email.trim(), password)
    navigate('/')
  }

  /**
   * Регистрация: сразу после неё пробуем обменять код на права. Если проект
   * Supabase требует подтверждения почты, сессии ещё нет — тогда просим
   * подтвердить письмо и войти, а код вводится уже здесь же, после входа.
   */
  const submitUp = async () => {
    const signedIn = await signUp(email.trim(), password)
    if (!signedIn) {
      setNotice(
        'Аккаунт создан. Откройте ссылку из письма, чтобы подтвердить почту, потом войдите — ' +
          'код приглашения можно будет ввести здесь же.',
      )
      setMode('in')
      setPassword('')
      return
    }
    if (!invite.trim()) {
      setNotice('Аккаунт создан. Права редактора появятся, когда введёте код приглашения ниже.')
      return
    }
    if (await claimEditor(invite)) {
      await refreshEditor()
      haptic.ok()
      navigate('/')
      return
    }
    setNotice('Аккаунт создан, но код не подошёл. Проверьте фразу и попробуйте ещё раз ниже.')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await (mode === 'in' ? submitIn() : submitUp())
    } catch (err) {
      haptic.err()
      setError(describeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  /* ─── Уже вошли ───────────────────────────────────────────────────────── */
  if (session) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-8">
        <div className="animate-fade-up rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-sm)]">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <ShieldCheck size={22} />
          </span>
          <p className="font-display text-[17px] font-semibold tracking-tight">Вы вошли</p>
          <p className="mt-1 text-[14px] text-[var(--fg-soft)]">{session.user.email}</p>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--fg-soft)]">
            {isEditor
              ? 'Права редактора активны — можно создавать разделы и писать конспекты.'
              : 'Пока это обычный читательский аккаунт. Чтобы дополнять базу, введите код приглашения.'}
          </p>

          {notice && <InfoNote className="mt-4">{notice}</InfoNote>}

          {!isEditor && <InviteForm />}
          <PasswordForm />

          <div className="mt-5 flex gap-2">
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

  /* ─── Вход и регистрация ──────────────────────────────────────────────── */
  const isUp = mode === 'up'

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-8">
      <form
        onSubmit={submit}
        className="animate-fade-up rounded-[var(--radius-card)] border border-[var(--line)]
          bg-[var(--bg-card)] p-6 shadow-[var(--shadow-md)]"
      >
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          {isUp ? <UserPlus size={22} /> : <KeyRound size={22} />}
        </span>

        {/* Переключатель: вход или новый аккаунт */}
        <div className="mb-5 flex gap-1 rounded-full border border-[var(--line)] bg-[var(--bg-subtle)] p-1">
          {([
            ['in', 'Вход'],
            ['up', 'Регистрация'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => switchMode(value)}
              className={`flex-1 rounded-full py-1.5 text-[13.5px] font-medium transition-colors duration-150
                ${
                  mode === value
                    ? '[background:var(--grad)] text-[var(--accent-fg)]'
                    : 'text-[var(--fg-soft)] hover:text-[var(--fg)]'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        <h1 className="font-display text-[20px] font-bold tracking-tight">
          {isUp ? 'Новый аккаунт' : 'Вход'}
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--fg-soft)]">
          {isUp
            ? 'Придумайте почту и пароль — их будете знать только вы. Код приглашения сразу даёт право дополнять базу.'
            : 'Читать конспекты можно без входа. Вход нужен, только чтобы дополнять базу.'}
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
            autoComplete={isUp ? 'new-password' : 'current-password'}
            required
            minLength={isUp ? 6 : undefined}
            hint={isUp ? 'Минимум 6 символов' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {isUp && (
            <Field
              label="Код приглашения"
              autoComplete="off"
              value={invite}
              placeholder="Секретная фраза от владельца базы"
              hint="Без кода аккаунт создастся, но останется читательским — код можно ввести и позже"
              onChange={(e) => setInvite(e.target.value)}
            />
          )}
        </div>

        {error && <ErrorNote className="mt-4">{error}</ErrorNote>}
        {notice && <InfoNote className="mt-4">{notice}</InfoNote>}

        <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>
          {busy && <Spinner />}
          {isUp ? 'Зарегистрироваться' : 'Войти'}
        </Button>
      </form>
    </div>
  )
}
