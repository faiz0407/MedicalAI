'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Brain, Calendar, Star, ArrowRight, CheckCircle, MessageCircle, Zap } from 'lucide-react'

const STEPS = [
  {
    step: '01',
    icon: Brain,
    title: 'Describe Your Symptoms',
    desc: 'Chat with our AI assistant powered by medical-grade models. Get instant, personalised health guidance.',
    color: 'text-[#FF8CA0]',
    bg: 'bg-[#FF8CA0]/10',
  },
  {
    step: '02',
    icon: Calendar,
    title: 'Book an Appointment',
    desc: 'Browse verified doctors by specialty and availability. Book in seconds — no phone calls needed.',
    color: 'text-blue-500',
    bg: 'bg-blue-50',
  },
  {
    step: '03',
    icon: Star,
    title: 'Rate Your Experience',
    desc: 'Leave reviews and help others find the best doctors. Our reputation system keeps quality high.',
    color: 'text-teal-500',
    bg: 'bg-teal-50',
  },
]

const CAPABILITIES = [
  'Symptom analysis & triage',
  'Medication reminders',
  'Lab result interpretation',
  'Follow-up scheduling',
  'Second opinion requests',
  'Health record summaries',
]

export default function AIOverviewSection() {
  return (
    <section id="features" className="bg-white py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 bg-[#FF8CA0]/10 border border-[#FF8CA0]/20 text-[#c0566d] text-sm font-medium px-4 py-1.5 rounded-full mb-5"
          >
            <Zap className="w-3.5 h-3.5" /> How it Works
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
          >
            Your complete healthcare journey,{' '}
            <span className="bg-gradient-to-r from-[#FF8CA0] to-blue-600 bg-clip-text text-transparent">simplified</span>
          </motion.h2>
          <p className="text-gray-500 leading-relaxed">
            From symptom check to specialist appointment — we handle the complexity so you can focus on getting better.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {STEPS.map(({ step, icon: Icon, title, desc, color, bg }, i) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="relative bg-gray-50 rounded-2xl p-7 border border-gray-100 hover:border-[#FF8CA0]/30 hover:shadow-lg transition-all group"
            >
              <span className="absolute top-6 right-6 text-5xl font-black text-gray-100 group-hover:text-[#FF8CA0]/10 transition-colors select-none">
                {step}
              </span>
              <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center mb-5`}>
                <Icon className={`w-6 h-6 ${color}`} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>

        {/* AI capabilities split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center bg-gray-50 rounded-3xl p-8 lg:p-12 border border-gray-100">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 bg-[#FF8CA0]/10 text-[#c0566d] text-sm font-medium px-3.5 py-1 rounded-full mb-5">
              <MessageCircle className="w-3.5 h-3.5" /> AI Assistant
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
              Medical-grade AI, available{' '}
              <span className="text-[#FF8CA0]">24/7</span>
            </h3>
            <p className="text-gray-500 leading-relaxed mb-6">
              Powered by BioBERT and advanced LLMs, our AI understands medical terminology and context
              to give you accurate, safe guidance — always knowing when to refer you to a real doctor.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-8">
              {CAPABILITIES.map((c) => (
                <div key={c} className="flex items-center gap-2.5 text-sm text-gray-600">
                  <CheckCircle className="w-4 h-4 text-[#FF8CA0] shrink-0" />
                  {c}
                </div>
              ))}
            </div>
            <Link href="/register" className="inline-flex items-center gap-2 bg-[#FF8CA0] hover:bg-[#e87a8e] text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-md hover:-translate-y-0.5">
              Try AI Assistant <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          {/* Right — chat preview */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
          >
            <div className="bg-gradient-to-r from-[#FF8CA0] to-[#c0566d] px-5 py-3 flex items-center gap-2.5">
              <Brain className="w-4 h-4 text-white" />
              <span className="text-white text-sm font-semibold">HealthcareAI Assistant</span>
              <span className="ml-auto text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">Online</span>
            </div>
            <div className="p-5 space-y-3 min-h-[280px]">
              {[
                { from: 'user',  text: 'I have a persistent headache for 3 days and mild fever.' },
                { from: 'ai',    text: 'I understand — persistent headaches with fever can have several causes. Are you also experiencing neck stiffness, sensitivity to light, or any rash? These details help me assess the situation better.' },
                { from: 'user',  text: 'No rash, but slight light sensitivity.' },
                { from: 'ai',    text: 'Based on your symptoms, I recommend seeing a doctor within 24 hours. I can help you book an appointment with a neurologist right now. Would you like that?' },
              ].map((m, i) => (
                <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] text-xs rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                    m.from === 'user'
                      ? 'bg-[#FF8CA0] text-white rounded-tr-sm'
                      : 'bg-gray-100 text-gray-700 rounded-tl-sm'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 px-4 py-3 flex gap-2">
              <div className="flex-1 bg-gray-50 rounded-xl px-3.5 py-2 text-xs text-gray-400">Type your symptoms...</div>
              <button className="w-8 h-8 bg-[#FF8CA0] rounded-lg flex items-center justify-center">
                <ArrowRight className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </motion.div>
        </div>

      </div>
    </section>
  )
}
