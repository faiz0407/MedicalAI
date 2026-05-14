'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'
import type { User } from '@/types'

/**
 * Landing page after Google OAuth callback.
 * Backend redirects here with ?token=<JWT>.
 * We store the token, fetch the user profile, hydrate Zustand, then
 * redirect to the correct dashboard based on role.
 */
export default function GoogleSuccessPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token  = params.get('token')
    const error  = params.get('error')

    if (error || !token) {
      toast.error('Google sign-in failed. Please try again.')
      router.replace('/login')
      return
    }

    // Store token so the API interceptor attaches it to /api/auth/me
    localStorage.setItem('access_token', token)

    authApi.me()
      .then(({ data }) => {
        setAuth(token, data as User)
        toast.success(`Welcome, ${data.full_name || data.username}!`)
        const role = data.role
        if (role === 'admin')       router.replace('/admin')
        else if (role === 'doctor') router.replace('/doctor')
        else                        router.replace('/dashboard/chat')
      })
      .catch(() => {
        localStorage.removeItem('access_token')
        toast.error('Could not load your account. Please try again.')
        router.replace('/login')
      })
  }, [router, setAuth])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
      <p className="text-gray-500 text-sm">Completing Google sign-in…</p>
    </div>
  )
}
