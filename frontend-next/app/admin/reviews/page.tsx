'use client'
import { useState, useEffect } from 'react'
import { Star, AlertTriangle, CheckCircle, Loader2, ThumbsUp, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi, getErrorMessage } from '@/lib/api'
import { badgeColor, formatDate, cn } from '@/lib/utils'
import type { Review, ReviewCategory } from '@/types'

const CATEGORIES: { value: ReviewCategory | 'all'; label: string }[] = [
  { value: 'all',       label: 'All Reviews' },
  { value: 'good',      label: '✅ Good' },
  { value: 'moderate',  label: '⚠️ Moderate' },
  { value: 'high_risk', label: '🚨 High Risk' },
]

export default function ReviewsPage() {
  const [reviews, setReviews]   = useState<Review[]>([])
  const [category, setCategory] = useState<ReviewCategory | 'all'>('all')
  const [loading, setLoading]   = useState(true)
  const [approving, setApproving] = useState<number | null>(null)
  const [syncing, setSyncing]     = useState(false)

  const fetchReviews = async (cat: ReviewCategory | 'all') => {
    setLoading(true)
    try {
      const { data } = await adminApi.reviews(cat === 'all' ? undefined : cat, 50)
      setReviews(data.reviews || [])
    } catch {
      setReviews([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReviews(category) }, [category])

  const syncGoogle = async () => {
    setSyncing(true)
    try {
      const { data } = await adminApi.syncGoogleReviews()
      toast.success(data.message || 'Reviews synced!')
      fetchReviews(category)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setSyncing(false) }
  }

  const approveReply = async (id: number) => {
    setApproving(id)
    try {
      await adminApi.approveReply(id)
      toast.success('Reply approved!')
      setReviews((prev) => prev.map((r) => r.id === id ? { ...r, reply_approved: true } : r))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setApproving(null)
    }
  }

  const renderStars = (rating: number) => (
    <span className="flex gap-0.5">
      {Array(5).fill(0).map((_, i) => (
        <Star key={i} className={cn('w-3.5 h-3.5', i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200')} />
      ))}
    </span>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reputation Management</h1>
          <p className="text-gray-400 text-sm mt-0.5">Monitor reviews, approve AI replies, manage hospital reputation</p>
        </div>
        <button
          onClick={syncGoogle}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {syncing ? 'Syncing…' : 'Sync Google Reviews'}
        </button>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        {CATEGORIES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setCategory(value)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium transition-all',
              category === value
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-blue-400'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#FF8CA0]" /></div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Star className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No reviews in this category</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className={cn(
              'medical-card',
              review.category === 'high_risk' && 'border-l-4 border-l-red-500',
              review.category === 'moderate'  && 'border-l-4 border-l-yellow-500',
            )}>
              {/* Header */}
              <div className="flex flex-wrap items-start gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">{review.reviewer_name}</span>
                    {renderStars(review.rating)}
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badgeColor(review.category))}>
                      {review.category.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(review.review_date)}</span>
                  </div>
                  {review.flagged_keywords && review.flagged_keywords.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      <div className="flex gap-1">
                        {review.flagged_keywords.map((kw: string) => (
                          <span key={kw} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Review Text */}
              <p className="text-gray-600 text-sm leading-relaxed mb-3 p-3 bg-gray-100 rounded-xl">
                "{review.review_text}"
              </p>

              {/* AI Reply */}
              {review.ai_reply && (
                <div className="border border-blue-800 bg-blue-950/40 rounded-xl p-3 mb-3">
                  <p className="text-xs font-semibold text-blue-400 mb-1 flex items-center gap-1">
                    🤖 AI-Generated Reply
                    {review.reply_approved && <CheckCircle className="w-3 h-3 text-green-500" />}
                  </p>
                  <p className="text-sm text-gray-600">{review.ai_reply}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {review.ai_reply && !review.reply_approved && (
                  <button
                    onClick={() => approveReply(review.id)}
                    disabled={approving === review.id}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
                  >
                    {approving === review.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <ThumbsUp className="w-3.5 h-3.5" />
                    }
                    Approve Reply
                  </button>
                )}
                {review.reply_approved && !review.reply_posted && (
                  <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 text-gray-400 rounded-lg">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" /> Approved — awaiting post
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
