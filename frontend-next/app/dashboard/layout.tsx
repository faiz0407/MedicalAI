'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Menu } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, _hasHydrated } = useAuthStore()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!_hasHydrated) return
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, _hasHydrated, router])

  if (!_hasHydrated) return null
  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex">
        <DashboardSidebar />
      </div>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="relative z-50">
            <DashboardSidebar onClose={() => setSidebarOpen(false)} />
          </div>
          <div
            className="flex-1 bg-black/30"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-gray-500 hover:text-gray-900 rounded-lg">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-gray-900 text-sm">HealthcareAI</span>
          <div className="w-9" />
        </div>

        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  )
}
