import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  AtSign, LockKeyhole, LogOut, MonitorSmartphone, PenLine, ShieldCheck, Ticket, UserRound,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { claimEditor, describeAuthError } from '@/lib/api'
import { haptic } from '@/lib/telegram'
import { Button, ErrorNote, Field, InfoNote, Spinner } from '@/components/ui'

/*
 * Профиль: кто вошёл, какие права, и всё, что человек может сделать со своим
 * аккаунтом сам — получить права по коду приглашения, сменить почту и пароль,
 * выйти отсюда или сразу отовсюду.
 *
 * Права не выдаются просто за регистрацию: читать базу может кто угодно, и
 * иначе редактором стал бы любой, кто нашёл адрес. Секретную фразу владелец
 * задаёт один раз в базе (таблица editor_invite), а проверяет её функция
 * claim_editor — см. supabase/schema.sql.
 */

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

function Section({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode
  title: string
  text: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] p-4">
      <h2 className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--fg-soft)]">
        <span className="text-[var(--accent)]">{icon}</span>
        {title}
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--fg-soft)]">{text}</p>
      {children}
    </section>
  )
}

/** Ввод кода приглашения: показывается тому, у кого прав ещё нет */
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
    <Section
      icon={<Ticket size={14} />}
      title="Код приглашения"
      text="Секретная фраза от владельца базы. Введёте верную — сразу появятся кнопки, чтобы создавать разделы и писать конспекты."
    >
      <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
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
      </form>
      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
    </Section>
  )
}

/** Смена почты: вступает в силу после подтверждения с обоих адресов */
function EmailForm({ current, pending }: { current: string; pending: string | null }) {
  const { changeEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = email.trim().toLowerCase()
    if (next === current.toLowerCase()) {
      setError('Это и есть ваша нынешняя почта')
      return
    }
    setBusy(true)
    setError(null)
    setSent(null)
    try {
      await changeEmail(next)
      haptic.ok()
      setSent(next)
      setEmail('')
    } catch (err) {
      haptic.err()
      const raw = String((err as { message?: string })?.message ?? '')
      setError(
        /already|registered|exists/i.test(raw)
          ? 'Эта почта уже занята другим аккаунтом'
          : describeAuthError(err),
      )
    } finally {
      setBusy(false)
    }
  }

  const waiting = sent ?? pending

  return (
    <Section
      icon={<AtSign size={14} />}
      title="Сменить почту"
      text="Придут два письма — на старую почту и на новую. Почта поменяется, когда откроете ссылки из обоих. До этого вход по старой."
    >
      <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
        <Field
          className="min-w-[12rem]"
          type="email"
          autoComplete="email"
          required
          value={email}
          placeholder="Новая почта"
          aria-label="Новая почта"
          onChange={(e) => {
            setEmail(e.target.value)
            setSent(null)
          }}
        />
        <Button type="submit" disabled={busy || !email.trim()}>
          {busy && <Spinner />}
          Отправить письма
        </Button>
      </form>
      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
      {!error && waiting && (
        <InfoNote className="mt-3">
          Ждём подтверждения для <b>{waiting}</b>. Проверьте обе почты, письмо могло попасть в спам.
        </InfoNote>
      )}
    </Section>
  )
}

/**
 * Смена пароля. Обычно спрашиваем и текущий — иначе любой, кто взял в руки
 * незаблокированный телефон, увёл бы аккаунт. После ссылки «восстановить»
 * текущего пароля человек как раз не знает, поэтому там поле не показываем.
 */
function PasswordForm({ recovery }: { recovery: boolean }) {
  const { changePassword } = useAuth()
  const [current, setCurrent] = useState('')
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
      await changePassword(password, recovery ? undefined : current)
      haptic.ok()
      setCurrent('')
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

  const touch = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value)
    setDone(false)
  }

  return (
    <Section
      icon={<LockKeyhole size={14} />}
      title={recovery ? 'Новый пароль' : 'Сменить пароль'}
      text={
        recovery
          ? 'Вы вошли по ссылке из письма. Задайте новый пароль — старый спрашивать не будем.'
          : 'Новый пароль начнёт действовать сразу, на всех устройствах. Почта остаётся прежней.'
      }
    >
      <form onSubmit={submit} className="mt-3 space-y-2.5">
        {!recovery && (
          <Field
            label="Текущий пароль"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={touch(setCurrent)}
          />
        )}
        <Field
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          hint="Минимум 6 символов"
          value={password}
          onChange={touch(setPassword)}
        />
        <Field
          label="Ещё раз"
          type="password"
          autoComplete="new-password"
          required
          value={repeat}
          onChange={touch(setRepeat)}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        {done && <InfoNote>Пароль изменён — запомните новый.</InfoNote>}
        <Button type="submit" disabled={busy || !password || !repeat || (!recovery && !current)}>
          {busy && <Spinner />}
          {recovery ? 'Сохранить пароль' : 'Сменить пароль'}
        </Button>
      </form>
    </Section>
  )
}

/** Выход: отсюда или сразу со всех устройств, где вошли под этой почтой */
function SessionsSection() {
  const { signOut, signOutEverywhere } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const everywhere = async () => {
    setBusy(true)
    setError(null)
    try {
      await signOutEverywhere()
      haptic.ok()
    } catch (err) {
      haptic.err()
      setError(describeAuthError(err))
      setBusy(false)
    }
  }

  return (
    <Section
      icon={<MonitorSmartphone size={14} />}
      title="Устройства"
      text="«Выйти везде» пригодится, если вошли на чужом компьютере и забыли выйти: все прежние входы перестанут действовать, включая этот."
    >
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void signOut()}>
          <LogOut size={16} />
          Выйти
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void everywhere()}>
          {busy && <Spinner />}
          Выйти везде
        </Button>
      </div>
      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
    </Section>
  )
}

export function ProfilePage() {
  const { session, isEditor, loading, recovery } = useAuth()
  const navigate = useNavigate()
  // Сообщение со страницы входа: «аккаунт создан, но код не подошёл» и подобное
  const notice = (useLocation().state as { notice?: string } | null)?.notice ?? null

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-[var(--fg-faint)]">
        <Spinner />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />

  const { user } = session
  const pendingEmail = user.new_email && user.new_email !== user.email ? user.new_email : null

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-8 sm:py-16">
      <div className="animate-fade-up rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-sm)]">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            {isEditor ? <ShieldCheck size={22} /> : <UserRound size={22} />}
          </span>
          <div className="min-w-0">
            <p className="font-display text-[17px] font-semibold tracking-tight">Ваш аккаунт</p>
            <p className="mt-0.5 truncate text-[14px] text-[var(--fg-soft)]" title={user.email}>
              {user.email}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[var(--fg-faint)]">
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  isEditor
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'bg-[var(--bg-subtle)] text-[var(--fg-soft)]'
                }`}
              >
                {isEditor ? 'Редактор' : 'Читатель'}
              </span>
              {user.created_at && <span>с {date(user.created_at)}</span>}
            </p>
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-[var(--fg-soft)]">
          {isEditor
            ? 'Права редактора активны — можно создавать разделы и писать конспекты.'
            : 'Пока это обычный читательский аккаунт. Чтобы дополнять базу, введите код приглашения.'}
        </p>

        {notice && <InfoNote className="mt-4">{notice}</InfoNote>}

        <div className="mt-5 space-y-4">
          {recovery && <PasswordForm recovery />}
          {!isEditor && <InviteForm />}
          <EmailForm current={user.email ?? ''} pending={pendingEmail} />
          {!recovery && <PasswordForm recovery={false} />}
          <SessionsSection />
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={() => navigate('/')}>
            К конспектам
          </Button>
          {isEditor && (
            <Button variant="ghost" onClick={() => navigate('/edit')}>
              <PenLine size={16} />
              Панель редактора
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
