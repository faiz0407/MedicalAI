'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Shield, MessageSquare, Calendar, ClipboardList,
  Bell, Settings, LogOut, X
} from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard/chat',          icon: MessageSquare,  label: 'AI Assistant',     roles: ['patient','doctor','admin'] },
  { href: '/dashboard/appointments',  icon: Calendar,       label: 'Appointments',     roles: ['patient'] },
  { href: '/dashboard/history',       icon: ClipboardList,  label: 'Medical History',  roles: ['patient'] },
  { href: '/dashboard/notifications', icon: Bell,           label: 'Notifications',    roles: ['patient','doctor'] },
]

interface Props {
  onClose?: () => void
}

export default function DashboardSidebar({ onClose }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const { user, logout } = useAuthStore()

  const visibleNav = NAV.filter((n) => n.roles.includes(user?.role || 'patient'))

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return (
    <aside className="flex flex-col h-full bg-white border-r border-gray-100 w-64 flex-shrink-0">
      {/* Logo + close (mobile) */}
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#FF8CA0] rounded-lg flex items-center justify-center shadow-sm shadow-[#FF8CA0]/30">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900">HealthcareAI</span>
        </Link>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Role Badge */}
      <div className="px-5 py-3">
        <span className={cn(
          'text-xs font-semibold px-3 py-1 rounded-full capitalize',
          user?.role === 'admin'  ? 'bg-purple-100 text-purple-600' :
          user?.role === 'doctor' ? 'bg-teal-100 text-teal-600' :
          'bg-[#FF8CA0]/10 text-[#c0566d]'
        )}>
          {user?.role || 'patient'}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pb-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'sidebar-link',
                active ? 'sidebar-link-active' : 'sidebar-link-inactive'
              )}
            >
              <Icon className="w-4.5 h-4.5 w-5 h-5 flex-shrink-0" />
              {label}
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FF8CA0]" />}
            </Link>
          )
        })}

        {/* Admin shortcut */}
        {user?.role === 'admin' && (
          <Link
            href="/admin"
            onClick={onClose}
            className="sidebar-link sidebar-link-inactive mt-2 border-t border-gray-100 pt-3"
          >
            <Shield className="w-5 h-5 flex-shrink-0 text-purple-500" />
            <span className="text-purple-600">Admin Panel</span>
          </Link>
        )}
      </nav>

      {/* User + Logout */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-2 py-2 mb-2 rounded-xl hover:bg-gray-50 transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF8CA0] to-[#c0566d] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
            {(user?.full_name || user?.username || 'U')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {user?.full_name || user?.username}
            </p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors font-medium"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
