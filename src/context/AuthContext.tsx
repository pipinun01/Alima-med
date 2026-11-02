import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from '@/lib/supabase'
import { claimEditor, fetchEditorRole, telegramSession, type EditorRole } from '@/lib/api'
import { onDataUpdated } from '@/lib/sw-client'
import { inTelegram, telegramInitData, telegramStartParam, telegramUser } from '@/lib/telegram'

/** outside — открыто не в боте; failed — вход не удался, можно повторить; ready — можно читать */
export type AuthStatus = 'loading' | 'outside' | 'failed' | 'ready'

interface AuthCtx {
  status: AuthStatus
  failure: string | null
  session: Session | null
  /** Редактор: создаёт, правит и удаляет. Все остальные в боте — читатели */
  isEditor: boolean
  /** Владелец: ещё и приглашает людей и убирает их */
  isOwner: boolean
  /** Открыли по приглашению, но код использован, устарел или неверен */
  inviteRejected: boolean
  retry: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [failure, setFailure] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<EditorRole | null>(null)
  const [inviteRejected, setInviteRejected] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const signingIn = useRef(false)

  useEffect(() => {
    if (!isConfigured) return
    if (!inTelegram()) {
      setStatus('outside')
      return
    }
    let active = true
    signingIn.current = true

    const start = async () => {
      const next = await telegramSession(telegramInitData(), telegramUser()?.id)
      let nextRole = await fetchEditorRole(next.user.id)
      const code = telegramStartParam()
      let rejected = false
      if (!nextRole && code) {
        if (await claimEditor(code)) nextRole = await fetchEditorRole(next.user.id)
        else rejected = true
      }
      if (!active) return
      setSession(next)
      setRole(nextRole)
      setInviteRejected(rejected)
      setFailure(null)
      setStatus('ready')
    }

    start()
      .catch((e: unknown) => {
        if (!active) return
        setFailure(e instanceof Error ? e.message : 'Не удалось войти')
        setStatus('failed')
      })
      .finally(() => {
        signingIn.current = false
      })

    return () => {
      active = false
    }
  }, [attempt])

  const retry = useCallback(() => {
    setStatus('loading')
    setFailure(null)
    setAttempt((n) => n + 1)
  }, [])

  // Сессию отозвали или она протухла, пока приложение открыто — входим заново
  useEffect(() => {
    if (!isConfigured) return
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (next) setSession(next)
      if (event === 'SIGNED_OUT' && !signingIn.current) {
        setStatus('loading')
        setAttempt((n) => n + 1)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  /**
   * Человека могли убрать или повысить с другого устройства. Ответ про права
   * лежит в офлайн-кэше, и без подписки приложение показывало бы прежнее до
   * второй перезагрузки.
   */
  const userId = session?.user.id ?? null
  useEffect(
    () => onDataUpdated((url) => {
      if (userId && url.includes('/rest/v1/editors')) {
        fetchEditorRole(userId).then(setRole).catch(() => {})
      }
    }),
    [userId],
  )

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      failure,
      session,
      isEditor: role !== null,
      isOwner: role === 'owner',
      inviteRejected,
      retry,
    }),
    [status, failure, session, role, inviteRejected, retry],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth должен вызываться внутри AuthProvider')
  return ctx
}
