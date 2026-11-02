import { useState } from 'react'
import { MessageCircle, RefreshCw, Ticket, TriangleAlert } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { botLink } from '@/lib/telegram'
import { Button, Spinner } from './ui'

function Screen({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode
  title: string
  text: string
  children?: React.ReactNode
}) {
  return (
    <div className="grid min-h-full place-items-center px-6 py-16 text-center">
      <div className="max-w-sm animate-fade-up">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </span>
        <h1 className="font-display text-[20px] font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--fg-soft)]">{text}</p>
        {children && <div className="mt-5 flex justify-center">{children}</div>}
      </div>
    </div>
  )
}

/**
 * Единственный вход в приложение. Всё, что читает базу, смонтировано внутри него:
 * до входа запросы вернули бы пустоту, и она осела бы в офлайн-кэше.
 */
export function TelegramGate({ children }: { children: React.ReactNode }) {
  const { status, failure, inviteRejected, retry } = useAuth()
  const [inviteSeen, setInviteSeen] = useState(false)

  if (status === 'loading') {
    return (
      <div className="grid min-h-full place-items-center text-[var(--fg-faint)]">
        <Spinner />
      </div>
    )
  }

  if (status === 'outside') {
    return (
      <Screen
        icon={<MessageCircle size={24} />}
        title="Конспекты живут в Telegram"
        text="Здесь они не открываются. Перейдите в бота и нажмите кнопку «Конспекты» внизу чата."
      >
        <a
          href={botLink()}
          className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-[15px] font-medium text-[var(--accent-fg)]"
          style={{ background: 'var(--grad)' }}
        >
          Открыть бота
        </a>
      </Screen>
    )
  }

  if (status === 'failed') {
    return (
      <Screen icon={<TriangleAlert size={24} />} title="Не получилось войти" text={failure ?? 'Попробуйте ещё раз'}>
        <Button onClick={retry}>
          <RefreshCw size={16} />
          Повторить
        </Button>
      </Screen>
    )
  }

  // Читать можно и без приглашения, поэтому неподошедшая ссылка не закрывает приложение
  if (inviteRejected && !inviteSeen) {
    return (
      <Screen
        icon={<Ticket size={24} />}
        title="Приглашение не подошло"
        text="Ссылка срабатывает один раз и действует 7 дней. За новой обратитесь к владельцу. Читать конспекты можно и так."
      >
        <Button onClick={() => setInviteSeen(true)}>Читать конспекты</Button>
      </Screen>
    )
  }

  return <>{children}</>
}
