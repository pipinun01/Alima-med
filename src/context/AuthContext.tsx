import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from '@/lib/supabase'
import { checkIsEditor } from '@/lib/api'
import { onDataUpdated } from '@/lib/sw-client'

interface AuthCtx {
  session: Session | null
  isEditor: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  /**
   * Регистрация. true — вход уже выполнен; false — проект Supabase требует
   * подтвердить почту письмом, и сессии пока нет.
   */
  signUp: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  changePassword: (password: string) => Promise<void>
  /** Перечитать права — после того, как ввели код приглашения */
  refreshEditor: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isEditor, setIsEditor] = useState(false)
  const [loading, setLoading] = useState(isConfigured)

  useEffect(() => {
    if (!isConfigured) return
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Проверяем по id пользователя, а не по объекту сессии: токен обновляется
  // каждый час, и перепроверять права при каждом обновлении незачем
  const userId = session?.user.id ?? null
  useEffect(() => {
    let active = true
    if (!userId) {
      setIsEditor(false)
      return
    }
    checkIsEditor(userId).then((ok) => {
      if (active) setIsEditor(ok)
    })
    return () => {
      active = false
    }
  }, [userId])

  const refreshEditor = useCallback(async () => {
    if (!userId) {
      setIsEditor(false)
      return
    }
    setIsEditor(await checkIsEditor(userId))
  }, [userId])

  /**
   * Права могли выдать не отсюда: код приглашения ввели на другом устройстве
   * или строку в `editors` добавили руками через SQL. Ответ «этот аккаунт не
   * редактор» при этом лежит в офлайн-кэше, и без подписки приложение
   * показывало бы читательский вид до второй перезагрузки.
   */
  useEffect(
    () => onDataUpdated((url) => {
      if (url.includes('/rest/v1/editors')) void refreshEditor()
    }),
    [refreshEditor],
  )

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      isEditor,
      loading,
      refreshEditor,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      signUp: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        return Boolean(data.session)
      },
      signOut: async () => {
        await supabase.auth.signOut()
      },
      changePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
      },
    }),
    [session, isEditor, loading, refreshEditor],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth должен вызываться внутри AuthProvider')
  return ctx
}
