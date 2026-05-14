'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, UserPlus, CheckCircle2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'
import type { User } from '@/types'

interface FormData {
  username: string; email: string; password: string; confirm_password: string
  full_name: string; age: string; gender: string
}

const GENDER_OPTIONS = ['male', 'female', 'non-binary', 'prefer not to say']

export default function RegisterPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()

  const [form, setForm] = useState<FormData>({
    username: '', email: '', password: '', confirm_password: '',
    full_name: '', age: '', gender: '',
  })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const field = (key: keyof FormData) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [key]: e.target.value }),
    disabled: loading,
  })

  const pwChecks = {
    length:   form.password.length >= 8,
    upper:    /[A-Z]/.test(form.password),
    number:   /[0-9]/.test(form.password),
    special:  /[^A-Za-z0-9]/.test(form.password),
    matches:  form.password !== '' && form.password === form.confirm_password,
  }

  const PasswordCheck = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-1.5 text-xs">
      {ok
        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        : <XCircle className="w-3.5 h-3.5 text-gray-300" />
      }
      <span className={ok ? 'text-green-600' : 'text-gray-400'}>{label}</span>
    </div>
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!Object.values(pwChecks).every(Boolean)) {
      toast.error('Please fix password requirements')
      return
    }
    setLoading(true)
    try {
      const { data } = await authApi.register({
        username:  form.username,
        email:     form.email,
        password:  form.password,
        full_name: form.full_name || undefined,
        age:       form.age ? parseInt(form.age) : undefined,
        gender:    form.gender || undefined,
        role:      'patient',
      })
      setAuth(data.access_token, data.user as User)
      toast.success('Account created! Welcome to HealthcareAI.')
      router.push('/dashboard/chat')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Create Account</h1>
        <p className="text-gray-500 text-sm">Join HealthcareAI — your AI health companion</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Username *</label>
            <input type="text" {...field('username')} placeholder="johndoe" className="input-field text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Full Name</label>
            <input type="text" {...field('full_name')} placeholder="John Doe" className="input-field text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Email Address *</label>
          <input type="email" {...field('email')} placeholder="you@example.com" className="input-field" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Age</label>
            <input type="number" {...field('age')} placeholder="30" min="1" max="120" className="input-field text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Gender</label>
            <select {...field('gender')} className="input-field text-sm">
              <option value="">Select...</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Password *</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              {...field('password')}
              placeholder="Create a strong password"
              className="input-field pr-11"
              required
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {form.password && (
            <div className="mt-2 grid grid-cols-2 gap-1 p-3 bg-gray-50 border border-gray-200 rounded-xl">
              <PasswordCheck ok={pwChecks.length}  label="8+ characters" />
              <PasswordCheck ok={pwChecks.upper}   label="Uppercase letter" />
              <PasswordCheck ok={pwChecks.number}  label="Number" />
              <PasswordCheck ok={pwChecks.special} label="Special character" />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Confirm Password *</label>
          <input
            type="password"
            {...field('confirm_password')}
            placeholder="Confirm your password"
            className="input-field"
            required
          />
          {form.confirm_password && !pwChecks.matches && (
            <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
          <p className="text-xs text-blue-600">
            By creating an account, you agree to our Terms of Service and acknowledge that
            this platform provides educational health information only — not medical advice.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !Object.values(pwChecks).every(Boolean)}
          className="w-full flex items-center justify-center gap-2 bg-[#FF8CA0] hover:bg-[#e87a8e] text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-md shadow-[#FF8CA0]/30 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</>
          ) : (
            <><UserPlus className="w-4 h-4" /> Create Account</>
          )}
        </button>
      </form>

      <p className="text-center text-gray-500 text-sm mt-5">
        Already have an account?{' '}
        <Link href="/login" className="text-[#c0566d] font-semibold hover:underline">Sign in</Link>
      </p>
    </div>
  )
}
