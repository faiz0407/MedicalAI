import Link from 'next/link'
import { Shield } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#FF8CA0]/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-100/50 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#FF8CA0] rounded-xl flex items-center justify-center shadow-lg shadow-[#FF8CA0]/30">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-gray-900 font-bold text-xl">HealthcareAI</span>
        </Link>

        {children}

        <p className="text-center text-gray-400 text-xs mt-6">
          ⚕️ For educational use only — not a substitute for professional medical advice.
        </p>
      </div>
    </div>
  )
}
