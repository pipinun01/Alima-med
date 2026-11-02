import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, Crown, PenLine, Phone, Send, ShieldCheck, Ticket, Trash2, UserPlus, UserRound, Users } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { createEditorInvite, describeAuthError, fetchMyPhone, listPeople, makeEditor, removeEditor, type Person } from '@/lib/api'
import { botLink, haptic, requestPhone, shareViaTelegram, telegramUser } from '@/lib/telegram'
import { onReturn } from '@/lib/visibility'
import { Button, ErrorNote, Field, IconButton, Modal, Spinner } from '@/components/ui'

/*
 * Профиль: кто вошёл, с какой ролью, а у владельца ещё и список всех людей.
 * Вход делает сам Telegram (см. AuthContext), поэтому паролей и почты здесь нет.
 */

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

/** Новая ссылка: скопировать или сразу переслать */
function InviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const text = 'Приглашение дополнять конспекты'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      haptic.ok()
      setCopied(true)
    } catch {
      // Встроенные окна могут не пускать к буферу: выделяем, чтобы скопировать вручную
      box.current?.querySelector('input')?.select()
    }
  }

  const send = () => {
    shareViaTelegram(link, text)
  }

  return (
    <div ref={box} className="mt-3">
      <Field
        readOnly
        value={link}
        aria-label="Ссылка-приглашение"
        onFocus={(e) => e.target.select()}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void copy()}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Скопировано' : 'Скопировать'}
        </Button>
        <Button variant="ghost" onClick={send}>
          <Send size={16} />
          Отправить
        </Button>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--fg-soft)]">
        Ссылка сработает один раз и действует 7 дней. Перешлите её только тому, кого приглашаете.
      </p>
    </div>
  )
}

/** Сколько ждать, пока контакт дойдёт от Telegram до базы */
const PHONE_WAIT_TRIES = 10
const PHONE_WAIT_MS = 1000

/** Свой номер: необязательно, только с согласия человека */
function MyPhone() {
  const [phone, setPhone] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchMyPhone()
      .then((value) => {
        if (alive) setPhone(value)
      })
      .catch(() => {
        if (alive) setPhone(null)
      })
    return () => {
      alive = false
    }
  }, [])

  const share = async () => {
    setBusy(true)
    setError(null)
    try {
      if (!(await requestPhone())) return
      // Контакт идёт через бота, поэтому в базе появляется не мгновенно
      for (let i = 0; i < PHONE_WAIT_TRIES; i++) {
        await new Promise((resolve) => setTimeout(resolve, PHONE_WAIT_MS))
        const saved = await fetchMyPhone()
        if (saved) {
          setPhone(saved)
          haptic.ok()
          return
        }
      }
      setError('Номер ещё не дошёл. Откройте профиль чуть позже.')
    } catch (err) {
      haptic.err()
      setError(describeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  if (phone === undefined) return null
  if (phone) {
    return (
      <p className="mt-4 flex items-center gap-1.5 text-[14px] text-[var(--fg-soft)]">
        <Phone size={14} className="text-[var(--accent)]" />
        {phone}
      </p>
    )
  }
  return (
    <div className="mt-4">
      <Button variant="outline" onClick={() => void share()} disabled={busy}>
        {busy ? <Spinner /> : <Phone size={16} />}
        Поделиться номером
      </Button>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--fg-soft)]">
        По желанию. Номер увидят только владельцы базы.
      </p>
      {error && <ErrorNote className="mt-2">{error}</ErrorNote>}
    </div>
  )
}

const ROLE_LABEL = { owner: 'Владелец', editor: 'Редактор', reader: 'Читатель' } as const

/** Все, кто открывал бота: виден только владельцам */
function TeamSection() {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [filter, setFilter] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [pending, setPending] = useState<{ person: Person; grant: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setPeople(await listPeople())
    } catch (err) {
      setError(describeAuthError(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Человек мог открыть бота, пока вы пересылали ему ссылку
  useEffect(() => onReturn(() => void load()), [load])

  const invite = async () => {
    setInviting(true)
    setError(null)
    try {
      setLink(botLink(await createEditorInvite()))
      haptic.ok()
    } catch (err) {
      haptic.err()
      setError(describeAuthError(err))
    } finally {
      setInviting(false)
    }
  }

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      if (pending.grant) await makeEditor(pending.person.user_id)
      else await removeEditor(pending.person.user_id)
      haptic.ok()
      setPending(null)
      await load()
    } catch (err) {
      haptic.err()
      setPending(null)
      setError(describeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const query = filter.trim().toLowerCase()
  const shown = people?.filter(
    (p) =>
      !query ||
      p.name.toLowerCase().includes(query) ||
      p.username?.toLowerCase().includes(query) ||
      p.phone?.includes(query),
  )

  return (
    <Section
      icon={<Users size={14} />}
      title="Люди"
      text="Читатель только читает. Редактор ещё создаёт, правит и удаляет. Давать права могут только владельцы."
    >
      {people === null && !error && (
        <div className="mt-3 text-[var(--fg-faint)]">
          <Spinner />
        </div>
      )}

      {people && people.length > 8 && (
        <div className="mt-3">
          <Field
            value={filter}
            placeholder="Найти по имени или номеру"
            aria-label="Найти по имени или номеру"
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}

      {shown && (
        <ul className="mt-3 divide-y divide-[var(--line)]">
          {shown.map((person) => (
            <li key={person.user_id} className="flex min-h-11 items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 text-[14px]" title={person.name}>
                <span className="block truncate">
                  {person.name}
                  {person.username && <span className="ml-1.5 text-[var(--fg-faint)]">@{person.username}</span>}
                </span>
                {person.phone && <span className="block truncate text-[12.5px] text-[var(--fg-soft)]">{person.phone}</span>}
              </span>
              <span
                className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${
                  person.role === 'owner'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'bg-[var(--bg-subtle)] text-[var(--fg-soft)]'
                }`}
              >
                {person.role === 'owner' && <Crown size={12} />}
                {ROLE_LABEL[person.role]}
              </span>
              {person.role === 'editor' && (
                <IconButton label={`Убрать права: ${person.name}`} onClick={() => setPending({ person, grant: false })}>
                  <Trash2 size={16} />
                </IconButton>
              )}
              {person.role === 'reader' && (
                <IconButton label={`Сделать редактором: ${person.name}`} onClick={() => setPending({ person, grant: true })}>
                  <UserPlus size={16} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}

      <div className="mt-3">
        <p className="mb-2 text-[12.5px] leading-relaxed text-[var(--fg-soft)]">
          Кого нет в списке, тот ещё не открывал бота. Ему можно сразу отправить ссылку с правами редактора.
        </p>
        <Button variant="outline" onClick={() => void invite()} disabled={inviting}>
          {inviting ? <Spinner /> : <Ticket size={16} />}
          {link ? 'Создать другую ссылку' : 'Ссылка для нового редактора'}
        </Button>
      </div>

      {link && <InviteLink key={link} link={link} />}

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.grant ? 'Сделать редактором?' : 'Убрать права?'}
      >
        <p className="text-[14px] leading-relaxed text-[var(--fg-soft)]">
          <b>{pending?.person.name}</b>{' '}
          {pending?.grant
            ? 'сможет читать, создавать, править и удалять конспекты.'
            : 'снова станет читателем: читать сможет, а менять нет. Всё написанное останется.'}
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant={pending?.grant ? 'primary' : 'danger'} onClick={() => void confirm()} disabled={busy}>
            {busy && <Spinner />}
            {pending?.grant ? 'Сделать редактором' : 'Убрать права'}
          </Button>
          <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
            Отмена
          </Button>
        </div>
      </Modal>
    </Section>
  )
}

export function ProfilePage() {
  const { isEditor, isOwner } = useAuth()
  const navigate = useNavigate()
  const me = telegramUser()
  const name = [me?.first_name, me?.last_name].filter(Boolean).join(' ')

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-8 sm:py-16">
      <div className="animate-fade-up rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-sm)]">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            {isEditor ? <ShieldCheck size={22} /> : <UserRound size={22} />}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-[17px] font-semibold tracking-tight">{name || 'Ваш аккаунт'}</p>
            {me?.username && <p className="mt-0.5 truncate text-[14px] text-[var(--fg-soft)]">@{me.username}</p>}
            <p className="mt-2">
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[12.5px] font-medium text-[var(--accent)]">
                {isOwner ? 'Владелец' : isEditor ? 'Редактор' : 'Читатель'}
              </span>
            </p>
          </div>
        </div>

        <MyPhone />

        <p className="mt-4 text-[13px] leading-relaxed text-[var(--fg-soft)]">
          {isOwner
            ? 'Вы владелец базы: можно создавать разделы, писать конспекты и приглашать людей.'
            : isEditor
            ? 'Можно создавать, править и удалять конспекты. Права другим дают владельцы.'
            : 'Можно читать все конспекты. Чтобы их дополнять, нужны права от владельца.'}
        </p>

        {isOwner && (
          <div className="mt-5">
            <TeamSection />
          </div>
        )}

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
