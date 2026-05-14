'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, BookOpen, Clock, Tag } from 'lucide-react'

const POSTS = [
  {
    tag: 'Cardiology',
    title: 'How AI is Revolutionising Early Heart Disease Detection',
    excerpt: 'New research shows AI models can detect cardiac anomalies up to 5 years before traditional methods, dramatically improving patient outcomes.',
    readTime: '4 min read',
    tagColor: 'bg-red-50 text-red-600',
  },
  {
    tag: 'Digital Health',
    title: 'The Rise of Telemedicine: What Patients Need to Know in 2026',
    excerpt: 'Telehealth adoption has surged 300% since 2020. We break down the benefits, limitations, and what to expect from virtual care.',
    readTime: '6 min read',
    tagColor: 'bg-blue-50 text-blue-600',
  },
  {
    tag: 'AI & ML',
    title: 'BioBERT Embeddings: Bringing NLP Precision to Clinical Notes',
    excerpt: 'How transformer-based medical language models are enabling more accurate symptom analysis and clinical decision support systems.',
    readTime: '5 min read',
    tagColor: 'bg-[#FF8CA0]/10 text-[#c0566d]',
  },
]

export default function NewsPreviewSection() {
  return (
    <section className="bg-gray-50 py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 bg-[#FF8CA0]/10 border border-[#FF8CA0]/20 text-[#c0566d] text-sm font-medium px-4 py-1.5 rounded-full mb-4"
            >
              <BookOpen className="w-3.5 h-3.5" /> Medical News & Blog
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-3xl sm:text-4xl font-bold text-gray-900"
            >
              Stay informed,{' '}
              <span className="bg-gradient-to-r from-[#FF8CA0] to-blue-600 bg-clip-text text-transparent">stay healthy</span>
            </motion.h2>
          </div>
          <Link
            href="/blog"
            className="flex items-center gap-2 text-[#c0566d] font-semibold text-sm hover:gap-3 transition-all shrink-0"
          >
            View all articles <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Posts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {POSTS.map(({ tag, title, excerpt, readTime, tagColor }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-[#FF8CA0]/20 transition-all group cursor-pointer"
            >
              {/* Image placeholder */}
              <div className="h-44 bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#FF8CA0]/20 to-blue-100/40" />
                <div className="absolute bottom-3 left-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${tagColor}`}>
                    <Tag className="w-3 h-3" /> {tag}
                  </span>
                </div>
              </div>

              <div className="p-5">
                <h3 className="font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-[#c0566d] transition-colors leading-snug">
                  {title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed line-clamp-3 mb-4">{excerpt}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="w-3.5 h-3.5" /> {readTime}
                  </div>
                  <span className="text-xs text-[#c0566d] font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                    Read more <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-gradient-to-r from-[#FF8CA0] to-[#c0566d] rounded-3xl p-8 sm:p-12 text-center text-white"
        >
          <h3 className="text-2xl sm:text-3xl font-bold mb-3">Ready to transform your healthcare experience?</h3>
          <p className="text-white/80 mb-8 max-w-lg mx-auto">
            Join thousands of patients and doctors already using HealthcareAI. Free to get started.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/register"
              className="flex items-center gap-2 bg-white text-[#c0566d] font-bold px-8 py-3.5 rounded-xl hover:bg-gray-50 transition-all shadow-lg hover:-translate-y-0.5"
            >
              Get Started Free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/blog"
              className="flex items-center gap-2 bg-white/10 border border-white/30 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-white/20 transition-all"
            >
              Read the Blog
            </Link>
          </div>
        </motion.div>

      </div>
    </section>
  )
}
