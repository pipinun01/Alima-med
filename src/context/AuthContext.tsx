import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from '@/lib/supabase'
import { checkIsEditor } from '@/lib/api'
import { onDataUpdated } from '@/lib/sw-client'

interface AuthCtx {
  session: Session | null
  isEditor: boolean
  loading: boolean
  /**
   * Человек пришёл по ссылке «восстановить пароль» из письма: сессия уже
   * есть, но пароля он не знает — страница профиля просит задать новый, не
   * спрашивая текущий. Сбрасывается после смены пароля.
   */
  recovery: boolean
  signIn: (email: string, password: string) => Promise<void>
  /**
   * Регистрация. true — вход уже выполнен; false — проект Supabase требует
   * подтвердить почту письмом, и сессии пока нет.
   */
  signUp: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  /** Отозвать сессии на всех устройствах, включая это */
  signOutEverywhere: () => Promise<void>
  /**
   * Смена пароля. Если передан `current`, он сначала проверяется входом:
   * Supabase сам текущий пароль не спрашивает, а без проверки любой, кто
   * сел за незаблокированный телефон, сменил бы пароль и забрал аккаунт.
   */
  changePassword: (password: string, current?: string) => Promise<void>
  /**
   * Смена почты. Supabase шлёт письма и на старый адрес, и на новый; почта
   * меняется, когда подтвердят оба. До этого новая видна в `user.new_email`.
   */
  changeEmail: (email: string) => Promise<void>
  /** Письмо со ссылкой на сброс пароля; ссылка ведёт на страницу профиля */
  resetPassword: (email: string) => Promise<void>
  /** Перечитать права — после того, как ввели код приглашения */
  refreshEditor: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isEditor, setIsEditor] = useState(false)
  const [loading, setLoading] = useState(isConfigured)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (!isConfigured) return
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
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
      recovery,
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
      signOutEverywhere: async () => {
        const { error } = await supabase.auth.signOut({ scope: 'global' })
        if (error) throw error
      },
      changePassword: async (password, current) => {
        if (current !== undefined) {
          const email = session?.user.email
          if (!email) throw new Error('Нет сессии — войдите заново')
          const check = await supabase.auth.signInWithPassword({ email, password: current })
          if (check.error) throw new Error('Текущий пароль неверный')
        }
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setRecovery(false)
      },
      changeEmail: async (email) => {
        const { error } = await supabase.auth.updateUser({ email })
        if (error) throw error
      },
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/profile`,
        })
        if (error) throw error
      },
    }),
    [session, isEditor, loading, recovery, refreshEditor],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth должен вызываться внутри AuthProvider')
  return ctx
}
