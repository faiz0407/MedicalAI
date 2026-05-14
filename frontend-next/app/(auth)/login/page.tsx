'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'
import type { User } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function LoginPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()

  const [form, setForm] = useState({ username: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err === 'google_denied') toast.error('Google sign-in was cancelled.')
    else if (err) toast.error('Google sign-in failed. Please try again.')
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username || !form.password) { toast.error('Please fill in all fields'); return }
    setLoading(true)
    try {
      const { data } = await authApi.login(form.username, form.password)
      setAuth(data.access_token, data.user as User)
      toast.success(`Welcome back, ${data.user.full_name || data.user.username}!`)

      // Respect callbackUrl from middleware redirect, otherwise use role-based default
      const params = new URLSearchParams(window.location.search)
      const callbackUrl = params.get('callbackUrl')
      const role = data.user.role
      const destination = callbackUrl || (role === 'admin' ? '/admin' : role === 'doctor' ? '/doctor' : '/dashboard/chat')
      router.push(destination)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
        <p className="text-gray-500 text-sm">Sign in to your HealthcareAI account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="Enter your username"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#FF8CA0] focus:ring-2 focus:ring-[#FF8CA0]/20 outline-none transition-all text-gray-900 placeholder-gray-400 bg-gray-50"
            autoComplete="username"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Enter your password"
              className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 focus:border-[#FF8CA0] focus:ring-2 focus:ring-[#FF8CA0]/20 outline-none transition-all text-gray-900 placeholder-gray-400 bg-gray-50"
              autoComplete="current-password"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <Link href="#" className="text-xs text-[#c0566d] hover:underline">Forgot password?</Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-[#FF8CA0] hover:bg-[#e87a8e] text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-md shadow-[#FF8CA0]/30 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : <><LogIn className="w-4 h-4" /> Sign In</>}
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-3 bg-white text-gray-400">or continue with</span>
        </div>
      </div>

      {/* Google */}
      <a
        href={`${API_URL}/api/auth/google`}
        className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors text-sm font-medium text-gray-700 shadow-sm"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </a>

      {/* Demo accounts */}
      <div className="mt-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Demo Accounts</p>
        <div className="space-y-1.5">
          {[
            { label: 'Admin',   user: 'admin',    pass: 'Admin@123' },
            { label: 'Patient', user: 'patient1', pass: 'Patient@123' },
          ].map((acc) => (
            <button
              key={acc.label}
              onClick={() => setForm({ username: acc.user, password: acc.pass })}
              className="w-full text-left px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-[#FF8CA0] hover:bg-[#FF8CA0]/5 transition-colors text-xs"
            >
              <span className="font-semibold text-gray-700">{acc.label}:</span>{' '}
              <span className="text-gray-500 font-mono">{acc.user}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-center text-gray-500 text-sm mt-5">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-[#c0566d] font-semibold hover:underline">Create account</Link>
      </p>
    </div>
  )
}
