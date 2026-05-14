'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthState, User } from '@/types'

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      _hasHydrated: false,

      setHasHydrated: (val: boolean) => set({ _hasHydrated: val }),

      setAuth: (token: string, user: User) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', token)
          // Cookie needed so Next.js middleware can verify auth on server-side navigation
          document.cookie = `access_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Strict`
        }
        set({ token, user, isAuthenticated: true })
      },

      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token')
          document.cookie = 'access_token=; path=/; max-age=0; SameSite=Strict'
        }
        set({ token: null, user: null, isAuthenticated: false })
      },

      updateUser: (updates: Partial<User>) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    {
      name: 'healthcare-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
