'use client'
import { motion } from 'framer-motion'
import { Shield, Layers, Monitor, Package, Code, Zap, Lock, HeartPulse } from 'lucide-react'

const FEATURES = [
  {
    icon: Layers,
    title: 'Reusable AI Modules',
    desc: 'Modular architecture — swap in specialised agents for any medical domain without rebuilding your workflow.',
    color: 'text-[#FF8CA0]',
    bg: 'bg-[#FF8CA0]/10',
  },
  {
    icon: Monitor,
    title: 'Every Screen Size',
    desc: 'Fully responsive across desktop, tablet, and mobile. Patients and doctors get the same great experience.',
    color: 'text-blue-500',
    bg: 'bg-blue-50',
  },
  {
    icon: Package,
    title: 'Organised Layer Structure',
    desc: 'Clean, logical component hierarchy. Named layers, grouped sections, and reusable blocks for easy maintenance.',
    color: 'text-teal-500',
    bg: 'bg-teal-50',
  },
  {
    icon: Code,
    title: 'Dev-Ready Code',
    desc: 'FastAPI + Next.js 14 stack with full TypeScript support. Production-grade code ready for deployment.',
    color: 'text-purple-500',
    bg: 'bg-purple-50',
  },
  {
    icon: Lock,
    title: 'HIPAA-Grade Security',
    desc: 'JWT authentication, encrypted data at rest, and role-based access control for patients, doctors, and admins.',
    color: 'text-green-500',
    bg: 'bg-green-50',
  },
  {
    icon: Zap,
    title: 'Ready to Go Live',
    desc: 'Docker Compose setup included. One command to spin up the full stack — database, backend, and frontend.',
    color: 'text-orange-500',
    bg: 'bg-orange-50',
  },
]

const TESTIMONIALS = [
  {
    quote: 'HealthcareAI transformed how I manage my appointments. The AI assistant caught a warning sign I had missed.',
    name: 'Priya S.',
    role: 'Patient',
    avatar: 'P',
    color: 'bg-[#FF8CA0]',
  },
  {
    quote: 'As a cardiologist, the smart scheduling and patient summaries save me 2 hours every day. Incredible tool.',
    name: 'Dr. Raj M.',
    role: 'Cardiologist',
    avatar: 'R',
    color: 'bg-blue-500',
  },
  {
    quote: "Our clinic's no-show rate dropped 40% after switching to HealthcareAI's automated reminders.",
    name: 'Admin Team',
    role: 'Clinic Administrator',
    avatar: 'A',
    color: 'bg-teal-500',
  },
]

export default function TrustSection() {
  return (
    <>
      {/* Features grid */}
      <section id="about" className="bg-gray-50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 bg-[#FF8CA0]/10 border border-[#FF8CA0]/20 text-[#c0566d] text-sm font-medium px-4 py-1.5 rounded-full mb-5"
            >
              <HeartPulse className="w-3.5 h-3.5" /> Product Highlights
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
            >
              Everything you need,{' '}
              <span className="bg-gradient-to-r from-[#FF8CA0] to-blue-600 bg-clip-text text-transparent">nothing you don't</span>
            </motion.h2>
            <p className="text-gray-500">
              Built specifically for healthcare — not a generic SaaS platform bolted on with medical terminology.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, color, bg }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-[#FF8CA0]/30 hover:shadow-lg transition-all group"
              >
                <div className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
              Loved by Patients & Doctors
            </h2>
            <p className="text-gray-500">Real feedback from real users of the platform.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(({ quote, name, role, avatar, color }, i) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.1 }}
                className="bg-gray-50 rounded-2xl p-6 border border-gray-100"
              >
                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <svg key={j} className="w-4 h-4 text-[#FF8CA0] fill-[#FF8CA0]" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-5 italic">"{quote}"</p>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 ${color} rounded-full flex items-center justify-center text-white text-sm font-bold`}>
                    {avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{name}</p>
                    <p className="text-xs text-gray-400">{role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-6 mt-14">
            {[
              { icon: Shield, label: 'HIPAA Compliant' },
              { icon: Lock,   label: 'End-to-End Encrypted' },
              { icon: Zap,    label: '99.9% Uptime SLA' },
              { icon: HeartPulse, label: 'Clinically Reviewed' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 text-gray-600 text-sm font-medium px-5 py-2.5 rounded-full">
                <Icon className="w-4 h-4 text-[#FF8CA0]" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
