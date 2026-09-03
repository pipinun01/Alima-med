import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { KeyRound, MailQuestion, UserPlus } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { claimEditor, describeAuthError } from '@/lib/api'
import { haptic } from '@/lib/telegram'
import { Button, ErrorNote, Field, InfoNote, Spinner } from '@/components/ui'

/*
 * Вход, регистрация и «забыли пароль». Всё, что нужно уже вошедшему —
 * код приглашения, смена почты и пароля, выход — живёт в профиле
 * (`ProfilePage`), сюда вошедшего перенаправляем.
 *
 * Права не выдаются просто за регистрацию: читать базу может кто угодно, и
 * иначе редактором стал бы любой, кто нашёл адрес. Секретную фразу владелец
 * задаёт один раз в базе (таблица editor_invite), а проверяет её функция
 * claim_editor — см. supabase/schema.sql.
 */

type Mode = 'in' | 'up' | 'reset'

const HEAD: Record<Mode, { icon: React.ReactNode; title: string; text: string; submit: string }> = {
  in: {
    icon: <KeyRound size={22} />,
    title: 'Вход',
    text: 'Читать конспекты можно без входа. Вход нужен, только чтобы дополнять базу.',
    submit: 'Войти',
  },
  up: {
    icon: <UserPlus size={22} />,
    title: 'Новый аккаунт',
    text: 'Придумайте почту и пароль — их будете знать только вы. Код приглашения сразу даёт право дополнять базу.',
    submit: 'Зарегистрироваться',
  },
  reset: {
    icon: <MailQuestion size={22} />,
    title: 'Забыли пароль',
    text: 'Пришлём на почту ссылку. Откроете её — попадёте в профиль, где зададите новый пароль.',
    submit: 'Отправить ссылку',
  },
}

export function LoginPage() {
  const { session, loading, signIn, signUp, resetPassword, refreshEditor } = useAuth()
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  // Вошедшему здесь делать нечего — всё про аккаунт в профиле. Пока сессия
  // читается из памяти, ничего не рисуем, иначе форма мигнёт перед переходом
  if (loading) return null
  if (session) return <Navigate to="/profile" replace />

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const submitIn = async () => {
    await signIn(email.trim(), password)
    navigate('/profile')
  }

  /**
   * Регистрация: сразу после неё пробуем обменять код на права. Если проект
   * Supabase требует подтверждения почты, сессии ещё нет — тогда просим
   * подтвердить письмо и войти, а код вводится уже в профиле, после входа.
   */
  const submitUp = async () => {
    const signedIn = await signUp(email.trim(), password)
    if (!signedIn) {
      setNotice(
        'Аккаунт создан. Откройте ссылку из письма, чтобы подтвердить почту, потом войдите — ' +
          'код приглашения можно будет ввести в профиле.',
      )
      setMode('in')
      setPassword('')
      return
    }
    if (invite.trim() && (await claimEditor(invite))) {
      await refreshEditor()
      haptic.ok()
      navigate('/')
      return
    }
    // Без кода или с неверным — в профиль: там поле для кода ждёт своего часа
    navigate('/profile', {
      replace: true,
      state: {
        notice: invite.trim()
          ? 'Аккаунт создан, но код не подошёл. Проверьте фразу и попробуйте ещё раз ниже.'
          : 'Аккаунт создан. Права редактора появятся, когда введёте код приглашения.',
      },
    })
  }

  const submitReset = async () => {
    await resetPassword(email.trim())
    haptic.ok()
    setNotice('Письмо отправлено. Если его нет несколько минут — загляните в спам.')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'in') await submitIn()
      else if (mode === 'up') await submitUp()
      else await submitReset()
    } catch (err) {
      haptic.err()
      setError(describeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const head = HEAD[mode]
  const isUp = mode === 'up'
  const isReset = mode === 'reset'

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-8">
      <form
        onSubmit={submit}
        className="animate-fade-up rounded-[var(--radius-card)] border border-[var(--line)]
          bg-[var(--bg-card)] p-6 shadow-[var(--shadow-md)]"
      >
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          {head.icon}
        </span>

        {/* Переключатель: вход или новый аккаунт. «Забыли пароль» — не вкладка, а ссылка под формой */}
        {!isReset && (
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
        )}

        <h1 className="font-display text-[20px] font-bold tracking-tight">{head.title}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--fg-soft)]">{head.text}</p>

        <div className="mt-6 space-y-3">
          <Field
            label="Почта"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {!isReset && (
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
          )}
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
          {head.submit}
        </Button>

        <button
          type="button"
          onClick={() => switchMode(isReset ? 'in' : 'reset')}
          className="mt-4 block w-full text-center text-[13px] text-[var(--fg-faint)] hover:text-[var(--fg)]"
        >
          {isReset ? 'Вспомнили? Вернуться ко входу' : 'Забыли пароль?'}
        </button>
      </form>
    </div>
  )
}
