'use client'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowRight, Shield, Star, CheckCircle } from 'lucide-react'

const FEATURES = ['AI Medical Assistant', 'Smart Appointments', 'Doctor Reviews', 'Health Analytics']

const STATS = [
  { value: '10K+', label: 'Patients Served' },
  { value: '500+', label: 'Verified Doctors' },
  { value: '98%',  label: 'Satisfaction Rate' },
]

export default function Hero() {
  return (
    <section className="relative min-h-screen bg-white overflow-hidden flex items-center pt-16">
      {/* Subtle background blobs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#FF8CA0]/5 rounded-full blur-3xl -translate-y-1/4 translate-x-1/4 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-50/60 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8 items-center">

          {/* ── Left ── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-[#FF8CA0]/10 border border-[#FF8CA0]/30 text-[#c0566d] text-sm font-medium px-4 py-1.5 rounded-full mb-6">
              <Star className="w-3.5 h-3.5 fill-[#FF8CA0] text-[#FF8CA0]" />
              Trusted Healthcare Platform
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-gray-900 leading-[1.1] mb-6">
              AI-Powered{' '}
              <span className="bg-gradient-to-r from-[#FF8CA0] to-[#c0566d] bg-clip-text text-transparent">
                Clinic Management
              </span>{' '}
              for Modern Healthcare
            </h1>

            <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-lg">
              One intelligent platform for patients, doctors, and clinics. Book appointments,
              get AI health guidance, and manage care — all in one place.
            </p>

            <div className="flex flex-wrap gap-2.5 mb-10">
              {FEATURES.map((f) => (
                <span key={f} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 text-gray-600 text-sm px-3.5 py-1.5 rounded-full">
                  <CheckCircle className="w-3.5 h-3.5 text-[#FF8CA0]" />
                  {f}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 mb-14">
              <Link
                href="/register"
                className="flex items-center gap-2 bg-[#FF8CA0] hover:bg-[#e87a8e] text-white font-semibold px-7 py-3.5 rounded-xl transition-all shadow-lg shadow-[#FF8CA0]/30 hover:-translate-y-0.5 active:scale-95"
              >
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login"
                className="flex items-center gap-2 bg-white border-2 border-gray-200 hover:border-[#FF8CA0] text-gray-700 font-semibold px-7 py-3.5 rounded-xl transition-all hover:-translate-y-0.5"
              >
                Sign In
              </Link>
            </div>

            <div className="flex items-center gap-8 pt-8 border-t border-gray-100">
              {STATS.map((s, i) => (
                <div key={i}>
                  <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Right — AI-generated doctor image ── */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative hidden lg:flex items-center justify-center"
          >
            <Image
              src="/doctor-hero.png"
              alt="AI Healthcare Doctor"
              width={600}
              height={804}
              priority
              className="w-full max-w-[480px] object-contain -translate-y-10"
            />

            {/* HIPAA badge — bottom left */}
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute bottom-4 left-0 bg-white shadow-xl border border-gray-100 rounded-2xl px-4 py-3 z-20"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-[#FF8CA0]/10 rounded-full flex items-center justify-center">
                  <Shield className="w-4 h-4 text-[#FF8CA0]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-800">HIPAA Compliant</p>
                  <p className="text-xs text-gray-400">Secure &amp; Private</p>
                </div>
              </div>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  )
}
