import { useEffect } from 'react'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { syncUser } from '@/lib/api'
import type { User } from '@/types/workflow'

interface AuthState {
  user: User | null
  loading: boolean
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  updateUser: (updates: Partial<User>) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  updateUser: (updates) =>
    set((state) => ({ user: state.user ? { ...state.user, ...updates } : null })),
  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null })
  },
}))

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    let cancelled = false

    // Use getSession() for the initial check — it auto-refreshes an expired token,
    // which avoids a false redirect to /login when the access token has expired but
    // the refresh token is still valid (the common "browser refresh" failure mode).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return

      if (session?.user) {
        syncUser({
          supabase_id: session.user.id,
          email: session.user.email!,
          full_name: session.user.user_metadata?.full_name,
        })
          .then((appUser) => { if (!cancelled) setUser(appUser) })
          .catch(() => { if (!cancelled) setUser(null) })
          .finally(() => { if (!cancelled) setLoading(false) })
      } else {
        setUser(null)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setUser(null)
        setLoading(false)
      }
    })

    // Listen for subsequent auth events (sign-in, sign-out, token refresh).
    // Skip INITIAL_SESSION — already handled above via getSession().
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return

      if (session?.user) {
        syncUser({
          supabase_id: session.user.id,
          email: session.user.email!,
          full_name: session.user.user_metadata?.full_name,
        })
          .then((appUser) => { if (!cancelled) setUser(appUser) })
          .catch(() => { if (!cancelled) setUser(null) })
      } else {
        if (!cancelled) setUser(null)
      }
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [setUser, setLoading])
}
