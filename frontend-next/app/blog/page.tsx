'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/shared/Navbar'
import Footer from '@/components/shared/Footer'
import { Search, Clock, Tag, Loader2, ArrowRight, ExternalLink } from 'lucide-react'
import { blogApi, getErrorMessage } from '@/lib/api'
import { formatDate, truncate, cn } from '@/lib/utils'
import type { BlogPost, NewsArticle } from '@/types'

const CATEGORIES = [
  { id: 'all',          label: 'All' },
  { id: 'health',       label: 'General Health' },
  { id: 'ai-healthcare', label: 'AI in Healthcare' },
  { id: 'research',     label: 'Medical Research' },
  { id: 'prevention',   label: 'Preventive Care' },
  { id: 'disease',      label: 'Disease Awareness' },
]

export default function BlogPage() {
  const [posts, setPosts]       = useState<BlogPost[]>([])
  const [news, setNews]         = useState<NewsArticle[]>([])
  const [search, setSearch]     = useState('')
  const [category, setCategory] = useState('all')
  const [page, setPage]         = useState(1)
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [newsLoading, setNewsLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    blogApi.posts({
      category: category !== 'all' ? category : undefined,
      search: search || undefined,
      page, per_page: 9,
    })
      .then(({ data }) => {
        setPosts(data.posts || [])
        setTotal(data.total || 0)
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [category, search, page])

  useEffect(() => {
    setNewsLoading(true)
    blogApi.news(category !== 'all' ? category : 'health', 3)
      .then(({ data }) => setNews(data.articles || []))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false))
  }, [category])

  const totalPages = Math.ceil(total / 9)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Hero */}
      <div className="pt-24 pb-16 text-white bg-gradient-to-br from-[#FF8CA0] to-[#c0566d]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl font-extrabold mb-4">Medical Blog & News</h1>
          <p className="text-white/80 text-lg mb-8">
            Expert insights, AI in healthcare, research breakthroughs, and preventive health guidance
          </p>
          {/* Search */}
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search articles…"
              className="w-full pl-11 pr-4 py-4 rounded-2xl bg-white text-gray-900 shadow-xl focus:ring-2 focus:ring-white/50 outline-none text-sm placeholder-gray-400 border border-white/30"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap mb-10">
          {CATEGORIES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setCategory(id); setPage(1) }}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-all',
                category === id
                  ? 'bg-[#FF8CA0] text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-[#FF8CA0] hover:text-[#c0566d]'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Live News Section */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <h2 className="font-bold text-gray-900 text-xl">Live Medical News</h2>
          </div>
          {newsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array(3).fill(0).map((_, i) => (
                <div key={i} className="medical-card animate-pulse">
                  <div className="h-4 bg-gray-200 rounded mb-2 w-3/4" />
                  <div className="h-3 bg-gray-200 rounded mb-1" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {news.map((article, i) => (
                <a
                  key={i}
                  href={article.url !== '#' ? article.url : undefined}
                  target={article.url !== '#' ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className="medical-card hover:-translate-y-0.5 group block"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-[#c0566d] bg-[#FF8CA0]/10 px-2 py-0.5 rounded-full">
                      {article.source}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(article.published_at)}</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm leading-snug mb-1 group-hover:text-[#c0566d] transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">{article.description}</p>
                  {article.url !== '#' && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-[#c0566d]">
                      Read more <ExternalLink className="w-3 h-3" />
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Blog Posts */}
        <div>
          <h2 className="font-bold text-gray-900 text-xl mb-5">
            {search ? `Search results for "${search}"` : 'Published Articles'}
            {total > 0 && <span className="text-sm font-normal text-gray-400 ml-2">({total} found)</span>}
          </h2>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="medical-card animate-pulse">
                  <div className="h-5 bg-gray-200 rounded mb-3 w-3/4" />
                  <div className="h-3 bg-gray-200 rounded mb-1" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No articles found. Try a different search.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/blog/${post.id}`}
                    className="medical-card hover:-translate-y-1 group block"
                  >
                    <div
                      className="h-36 rounded-xl mb-4 flex items-center justify-center text-4xl font-bold"
                      style={{ background: `linear-gradient(135deg, hsl(${post.id * 47 % 360},60%,90%), hsl(${(post.id * 47 + 50) % 360},60%,85%))` }}
                    >
                      {['🏥','🧬','💊','🩺','🧠','❤️','🔬','📊','🌡️'][post.id % 9]}
                    </div>

                    <div className="flex flex-wrap gap-1 mb-2">
                      {(post.tags || []).slice(0, 2).map((tag) => (
                        <span key={tag} className="flex items-center gap-0.5 text-xs text-[#c0566d] bg-[#FF8CA0]/10 px-2 py-0.5 rounded-full">
                          <Tag className="w-2.5 h-2.5" />{tag}
                        </span>
                      ))}
                    </div>

                    <h3 className="font-bold text-gray-900 text-base leading-snug mb-2 group-hover:text-[#c0566d] transition-colors line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="text-gray-500 text-sm leading-relaxed line-clamp-3">{post.preview}</p>

                    <div className="flex items-center justify-between mt-3">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />{formatDate(post.published_at || post.created_at)}
                      </span>
                      <span className="text-xs text-[#c0566d] font-medium flex items-center gap-0.5">
                        Read <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        'w-9 h-9 rounded-xl text-sm font-medium transition-all',
                        p === page ? 'bg-[#FF8CA0] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#FF8CA0]'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Footer />
    </div>
  )
}
