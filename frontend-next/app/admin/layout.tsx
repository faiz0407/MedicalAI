'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Shield, LayoutDashboard, Users, Star, FileText,
  Bell, Activity, Menu, X, LogOut, Calendar, Stethoscope,
} from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { cn } from '@/lib/utils'

const ADMIN_NAV = [
  { href: '/admin',                    icon: LayoutDashboard, label: 'Overview' },
  { href: '/admin/users',              icon: Users,           label: 'Users' },
  { href: '/admin/doctors',            icon: Stethoscope,     label: 'Doctors' },
  { href: '/admin/appointments',       icon: Calendar,        label: 'Appointments' },
  { href: '/admin/reviews',            icon: Star,            label: 'Reviews' },
  { href: '/admin/blog',               icon: FileText,        label: 'Blog & Content' },
  { href: '/admin/notifications',      icon: Bell,            label: 'Notifications' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout, _hasHydrated } = useAuthStore()
  const router   = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!_hasHydrated) return
    if (!isAuthenticated || user?.role !== 'admin') {
      router.replace('/login')
    }
  }, [isAuthenticated, user, _hasHydrated, router])

  if (!_hasHydrated) return null
  if (!isAuthenticated || user?.role !== 'admin') return null

  const handleLogout = () => { logout(); router.push('/login') }

  const Sidebar = ({ onClose }: { onClose?: () => void }) => (
    <aside className="flex flex-col h-full bg-white border-r border-gray-100 w-64 flex-shrink-0">
      <div className="p-5 border-b border-gray-100">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center shadow-sm shadow-purple-200">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm text-gray-900">HealthcareAI</div>
            <div className="text-xs text-gray-400">Admin Panel</div>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="absolute top-4 right-4 lg:hidden text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {ADMIN_NAV.map(({ href, icon: Icon, label }) => {
          const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                active ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="w-4.5 h-4.5 w-5 h-5" />
              {label}
            </Link>
          )
        })}

        <div className="pt-3 border-t border-gray-100 mt-3">
          <Link
            href="/dashboard/chat"
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <Activity className="w-5 h-5" />
            AI Assistant
          </Link>
        </div>
      </nav>

      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-2 py-2 mb-2 rounded-xl hover:bg-gray-50 transition-colors">
          <div className="w-8 h-8 rounded-full bg-purple-500 text-white text-sm font-bold flex items-center justify-center">
            {(user?.full_name || user?.username || 'A')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.full_name || user?.username}</p>
            <p className="text-xs text-gray-400">Administrator</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors font-medium"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <div className="hidden lg:flex"><Sidebar /></div>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <Sidebar onClose={() => setOpen(false)} />
          <div className="flex-1 bg-black/30" onClick={() => setOpen(false)} />
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="lg:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setOpen(true)} className="p-2 -ml-2 text-gray-500 hover:text-gray-900 rounded-lg">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm text-gray-900">Admin Panel</span>
          <div className="w-9" />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}
