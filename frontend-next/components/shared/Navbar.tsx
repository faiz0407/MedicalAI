'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Shield, Menu, X, ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/#features',  label: 'Features' },
  { href: '/blog',       label: 'Blog & News' },
  { href: '/#about',     label: 'About' },
]

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { isAuthenticated, user } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  const dashboardHref =
    user?.role === 'admin'   ? '/admin' :
    user?.role === 'doctor'  ? '/doctor' : '/dashboard/chat'

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300">
      <div className="bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#FF8CA0] rounded-xl flex items-center justify-center shadow-sm shadow-[#FF8CA0]/30">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-gray-900 text-lg tracking-tight">HealthcareAI</span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-3">
              {isAuthenticated ? (
                <Link
                  href={dashboardHref}
                  className="flex items-center gap-1.5 bg-[#FF8CA0] hover:bg-[#e87a8e] text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors shadow-sm shadow-[#FF8CA0]/30"
                >
                  Dashboard <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    className="bg-[#FF8CA0] hover:bg-[#e87a8e] text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors shadow-sm shadow-[#FF8CA0]/30"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden text-gray-600 p-2"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block text-gray-600 hover:text-gray-900 text-sm font-medium py-2"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 flex flex-col gap-2">
              {isAuthenticated ? (
                <Link href={dashboardHref} className="btn-primary text-center text-sm">
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" className="btn-secondary text-center text-sm">Sign In</Link>
                  <Link href="/register" className="btn-primary text-center text-sm">Get Started</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
