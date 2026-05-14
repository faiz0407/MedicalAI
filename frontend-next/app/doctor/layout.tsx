'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Shield, Calendar, MessageSquare, LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { cn } from '@/lib/utils'

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout, _hasHydrated } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!_hasHydrated) return
    if (!isAuthenticated || !['doctor', 'admin'].includes(user?.role || '')) {
      router.replace('/login')
    }
  }, [isAuthenticated, user, _hasHydrated, router])

  if (!_hasHydrated) return null
  if (!isAuthenticated) return null

  const NAV = [
    { href: '/doctor',            icon: Calendar,      label: 'My Appointments' },
    { href: '/dashboard/chat',    icon: MessageSquare, label: 'AI Assistant' },
  ]

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="flex flex-col h-full bg-white border-r border-gray-100 w-64 flex-shrink-0">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center shadow-sm shadow-teal-100">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-bold text-gray-900 text-sm">HealthcareAI</div>
              <div className="text-xs text-teal-600 font-medium">Doctor Portal</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  active ? 'bg-teal-50 text-teal-600' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-2 py-2 mb-2 rounded-xl hover:bg-gray-50 transition-colors">
            <div className="w-8 h-8 rounded-full bg-teal-500 text-white text-sm font-bold flex items-center justify-center">
              {(user?.full_name || user?.username || 'D')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.full_name || user?.username}</p>
              <p className="text-xs text-teal-600 font-medium capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={() => { logout(); router.push('/login') }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors font-medium"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
