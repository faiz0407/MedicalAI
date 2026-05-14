'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/shared/Navbar'
import Footer from '@/components/shared/Footer'
import { Clock, Tag, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { blogApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { BlogPost } from '@/types'

export default function BlogDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    blogApi.post(parseInt(id))
      .then(({ data }) => setPost(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="pt-24 pb-16">
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF8CA0]" />
          </div>
        ) : error || !post ? (
          <div className="max-w-2xl mx-auto px-4 text-center py-24">
            <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-700 mb-2">Article not found</h1>
            <p className="text-gray-500 mb-6">This article may have been removed or is not yet published.</p>
            <Link href="/blog" className="btn-primary">← Back to Blog</Link>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            {/* Back */}
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#c0566d] mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Blog
            </Link>

            {/* Article */}
            <article className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Header */}
              <div
                className="h-56 flex items-center justify-center text-7xl"
                style={{ background: `linear-gradient(135deg, hsl(${parseInt(id) * 47 % 360},60%,85%), hsl(${(parseInt(id) * 47 + 50) % 360},60%,75%))` }}
              >
                {['🏥','🧬','💊','🩺','🧠','❤️','🔬','📊','🌡️'][parseInt(id) % 9]}
              </div>

              <div className="p-8">
                {/* Meta */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  {(post.tags || []).map((tag) => (
                    <span key={tag} className="flex items-center gap-0.5 text-xs text-[#c0566d] bg-[#FF8CA0]/10 px-2.5 py-1 rounded-full font-medium">
                      <Tag className="w-3 h-3" />{tag}
                    </span>
                  ))}
                  <span className="flex items-center gap-1 text-sm text-gray-400">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(post.published_at || post.created_at)}
                  </span>
                </div>

                <h1 className="text-3xl font-extrabold text-gray-900 mb-6 leading-tight">{post.title}</h1>

                {/* Disclaimer */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-700 text-sm leading-relaxed">
                    ⚕️ <strong>Medical Disclaimer:</strong> This content is for educational purposes only and does not
                    constitute medical advice. Always consult a qualified healthcare professional for medical decisions.
                  </p>
                </div>

                {/* Content */}
                <div className="prose max-w-none text-gray-700">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 className="text-2xl font-bold text-gray-900 mt-8 mb-4">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-xl font-bold text-gray-900 mt-6 mb-3">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-lg font-semibold text-gray-900 mt-4 mb-2">{children}</h3>,
                      p: ({ children }) => <p className="text-gray-600 leading-relaxed mb-4">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1.5">{children}</ol>,
                      li: ({ children }) => <li className="text-gray-600 leading-relaxed">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-[#FF8CA0] pl-4 italic text-gray-500 my-4">{children}</blockquote>
                      ),
                    }}
                  >
                    {post.content || '*Content not available*'}
                  </ReactMarkdown>
                </div>
              </div>
            </article>

            {/* CTA */}
            <div className="mt-8 bg-blue-600 rounded-2xl p-6 text-white text-center">
              <h3 className="font-bold text-xl mb-2">Need personalised health guidance?</h3>
              <p className="text-white/80 mb-4">Talk to our AI assistant for safe, evidence-based health information.</p>
              <Link href="/dashboard/chat" className="inline-flex items-center gap-2 bg-white text-blue-700 font-bold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors">
                Chat with AI Assistant →
              </Link>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
