import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from '@/lib/supabase'
import { checkIsEditor } from '@/lib/api'

interface AuthCtx {
  session: Session | null
  isEditor: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
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

  useEffect(() => {
    let active = true
    if (!session?.user) {
      setIsEditor(false)
      return
    }
    checkIsEditor(session.user.id).then((ok) => {
      if (active) setIsEditor(ok)
    })
    return () => {
      active = false
    }
  }, [session])

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      isEditor,
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, isEditor, loading],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth должен вызываться внутри AuthProvider')
  return ctx
}
