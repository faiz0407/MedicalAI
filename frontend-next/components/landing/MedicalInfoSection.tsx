'use client'
import { motion } from 'framer-motion'
import { Heart, Users, Award, TrendingUp, Clock, Globe } from 'lucide-react'

const STATS = [
  { icon: Users,     value: '10,000+', label: 'Patients Served',     color: 'text-[#FF8CA0]', bg: 'bg-[#FF8CA0]/10' },
  { icon: Heart,     value: '500+',    label: 'Verified Doctors',    color: 'text-blue-500',   bg: 'bg-blue-50' },
  { icon: Award,     value: '98%',     label: 'Patient Satisfaction', color: 'text-teal-500',  bg: 'bg-teal-50' },
  { icon: TrendingUp,value: '3x',      label: 'Faster Diagnosis',    color: 'text-purple-500', bg: 'bg-purple-50' },
  { icon: Clock,     value: '24/7',    label: 'AI Availability',     color: 'text-orange-500', bg: 'bg-orange-50' },
  { icon: Globe,     value: '15+',     label: 'Specialties Covered', color: 'text-green-500',  bg: 'bg-green-50' },
]

const BRANDS = ['Cardiology', 'Neurology', 'Pediatrics', 'Orthopedics', 'Dermatology', 'Oncology', 'Gynecology', 'Psychiatry']

export default function MedicalInfoSection() {
  return (
    <section className="bg-gray-50 py-20 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Specialties marquee */}
        <div className="mb-16">
          <p className="text-center text-sm font-semibold text-gray-400 uppercase tracking-widest mb-8">
            Covering All Major Medical Specialties
          </p>
          <div className="relative flex overflow-hidden">
            <motion.div
              animate={{ x: ['0%', '-50%'] }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              className="flex gap-6 shrink-0"
            >
              {[...BRANDS, ...BRANDS].map((b, i) => (
                <div key={i} className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 font-medium text-sm px-5 py-2.5 rounded-full shadow-sm whitespace-nowrap">
                  <Heart className="w-3.5 h-3.5 text-[#FF8CA0]" />
                  {b}
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="text-center mb-12">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
          >
            Healthcare by the{' '}
            <span className="bg-gradient-to-r from-[#FF8CA0] to-blue-600 bg-clip-text text-transparent">Numbers</span>
          </motion.h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Real impact for real patients — our platform drives better outcomes every day.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {STATS.map(({ icon: Icon, value, label, color, bg }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="bg-white rounded-2xl p-5 text-center border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mx-auto mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className={`text-2xl font-bold ${color} mb-1`}>{value}</p>
              <p className="text-xs text-gray-500 leading-tight">{label}</p>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  )
}
