import Link from 'next/link'
import { Shield, Heart } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 bg-[#FF8CA0] rounded-xl flex items-center justify-center shadow-sm shadow-[#FF8CA0]/30">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg">HealthcareAI</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              AI-powered unified healthcare platform — empowering patients, doctors, and clinics.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-gray-400">
              Platform
            </h4>
            <ul className="space-y-2.5">
              {[
                { href: '/dashboard/chat', label: 'AI Assistant' },
                { href: '/dashboard/appointments', label: 'Book Appointment' },
                { href: '/blog', label: 'Medical News' },
                { href: '/login', label: 'Patient Login' },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-gray-400 hover:text-white text-sm transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-gray-400">
              Support
            </h4>
            <ul className="space-y-2.5">
              {[
                { href: '#', label: 'Help Center' },
                { href: '#', label: 'Privacy Policy' },
                { href: '#', label: 'Terms of Service' },
                { href: '#', label: 'HIPAA Compliance' },
              ].map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-gray-400 hover:text-white text-sm transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Emergency */}
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-gray-400">
              Emergency
            </h4>
            <div className="bg-red-900/30 border border-red-700/40 rounded-xl p-4">
              <p className="text-red-400 text-sm font-semibold mb-1">Medical Emergency?</p>
              <p className="text-gray-400 text-sm mb-3">Do not use this platform. Call emergency services immediately.</p>
              <a
                href="tel:911"
                className="block text-center bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg text-sm transition-colors"
              >
                Call 911 (US)
              </a>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} HealthcareAI. All rights reserved.
          </p>
          <p className="text-gray-600 text-xs flex items-center gap-1">
            Built with <Heart className="w-3 h-3 text-red-500 fill-red-500" /> for better healthcare
          </p>
          <p className="text-gray-600 text-xs text-center">
            ⚕️ This platform provides educational health information only — not medical advice.
          </p>
        </div>
      </div>
    </footer>
  )
}
