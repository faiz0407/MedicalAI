'use client'
import { useState, useEffect } from 'react'
import {
  FileText, Plus, Check, Trash2, Loader2,
  Eye, Globe, Clock, Sparkles, Share2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { blogApi, getErrorMessage } from '@/lib/api'
import { badgeColor, formatDate, truncate, cn } from '@/lib/utils'
import type { BlogPost, ContentStatus } from '@/types'

const STATUSES = ['all', 'draft', 'pending', 'approved', 'published', 'rejected']

const POST_TYPES = [
  { id: 'blog',        label: '📝 Blog Post',       platform: 'website' },
  { id: 'social_media', label: '📱 Social Media',   platform: 'twitter' },
]

export default function BlogAdminPage() {
  const [posts, setPosts]         = useState<BlogPost[]>([])
  const [status, setStatus]       = useState('all')
  const [loading, setLoading]     = useState(true)
  const [approving, setApproving] = useState<number | null>(null)
  const [creating, setCreating]   = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [enhancing, setEnhancing]         = useState(false)
  const [publishing, setPublishing]       = useState<number | null>(null)
  const [postingToFb, setPostingToFb]     = useState(false)

  const [newPost, setNewPost] = useState({
    title: '', content: '', post_type: 'blog', platform: 'website',
    tags: '', seo_description: '',
  })

  const fetchPosts = async () => {
    setLoading(true)
    try {
      const { data } = await blogApi.adminAll({ status: status === 'all' ? undefined : status })
      setPosts(data.posts || [])
    } catch {
      setPosts([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchPosts() }, [status])

  const approvePost = async (id: number) => {
    setApproving(id)
    try {
      await blogApi.adminApprove(id)
      toast.success('Post published!')
      fetchPosts()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setApproving(null) }
  }

  const deletePost = async (id: number) => {
    if (!confirm('Delete this post?')) return
    try {
      await blogApi.adminDelete(id)
      toast.success('Post deleted')
      setPosts((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const enhanceWithAI = async () => {
    if (!newPost.title && !newPost.content) {
      toast.error('Enter a title or content first')
      return
    }
    setEnhancing(true)
    try {
      const { data } = await blogApi.enhance(
        newPost.title || undefined,
        newPost.content || undefined,
        newPost.post_type,
        newPost.platform,
      )
      setNewPost((prev) => ({
        ...prev,
        title:   data.title   || prev.title,
        content: data.content || prev.content,
      }))
      toast.success('Enhanced with AI!')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setEnhancing(false) }
  }

  const publishToFacebook = async (id: number) => {
    if (!confirm('Post this to your Facebook Page now?')) return
    setPublishing(id)
    try {
      await blogApi.publishToFacebook(id)
      toast.success('Published to Facebook!')
      fetchPosts()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setPublishing(null) }
  }

  const createAndPostToFacebook = async () => {
    if (!newPost.title || !newPost.content) {
      toast.error('Title and content are required')
      return
    }
    setPostingToFb(true)
    try {
      const { data: created } = await blogApi.adminCreate({
        title: newPost.title,
        content: newPost.content,
        post_type: newPost.post_type,
        platform: newPost.platform,
        tags: newPost.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      const postId = created.post_id
      await blogApi.adminApprove(postId)
      await blogApi.publishToFacebook(postId)
      toast.success('Posted to Facebook!')
      setShowForm(false)
      setNewPost({ title: '', content: '', post_type: 'blog', platform: 'website', tags: '', seo_description: '' })
      fetchPosts()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setPostingToFb(false) }
  }

  const createPost = async () => {
    if (!newPost.title || !newPost.content) {
      toast.error('Title and content are required')
      return
    }
    setCreating(true)
    try {
      await blogApi.adminCreate({
        title: newPost.title,
        content: newPost.content,
        post_type: newPost.post_type,
        platform: newPost.platform,
        tags: newPost.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      toast.success('Post created as draft')
      setShowForm(false)
      setNewPost({ title: '', content: '', post_type: 'blog', platform: 'website', tags: '', seo_description: '' })
      fetchPosts()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setCreating(false) }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Blog & Content</h1>
          <p className="text-gray-400 text-sm mt-0.5">Manage AI-generated and manual blog posts</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> Create Post
        </button>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900 text-lg">Create New Post</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-200">✕</button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {POST_TYPES.map((pt) => (
                  <button
                    key={pt.id}
                    onClick={() => setNewPost({ ...newPost, post_type: pt.id, platform: pt.platform })}
                    className={cn(
                      'p-3 rounded-xl border-2 text-sm font-medium transition-all',
                      newPost.post_type === pt.id ? 'border-blue-600 bg-[#FF8CA0]/10 text-[#c0566d]' : 'border-gray-200 text-gray-600'
                    )}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  value={newPost.title}
                  onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                  placeholder="Post title"
                  className="input-field pr-36"
                />
              </div>
              <div className="relative">
                <textarea
                  value={newPost.content}
                  onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                  placeholder="Post content (markdown supported)"
                  rows={8}
                  className="input-field"
                />
              </div>
              <button
                type="button"
                onClick={enhanceWithAI}
                disabled={enhancing}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border-2 border-dashed border-purple-300 text-purple-600 hover:bg-purple-50 hover:border-purple-400 transition-all text-sm font-medium disabled:opacity-60"
              >
                {enhancing
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Sparkles className="w-4 h-4" />
                }
                {enhancing ? 'Enhancing with AI…' : '✨ Enhance with AI (title + content)'}
              </button>
              <input
                value={newPost.tags}
                onChange={(e) => setNewPost({ ...newPost, tags: e.target.value })}
                placeholder="Tags (comma-separated): health, ai-healthcare, research"
                className="input-field"
              />
              <input
                value={newPost.seo_description}
                onChange={(e) => setNewPost({ ...newPost, seo_description: e.target.value })}
                placeholder="SEO meta description (optional)"
                className="input-field"
              />
              <div className="flex gap-3 flex-wrap">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={createPost}
                  disabled={creating || postingToFb}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Save Draft
                </button>
                <button
                  onClick={createAndPostToFacebook}
                  disabled={creating || postingToFb}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {postingToFb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                  Post to Facebook
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-all capitalize',
              status === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:border-blue-400'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#FF8CA0]" /></div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <FileText className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No posts found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post.id} className="medical-card">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900 text-sm">{post.title}</h3>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badgeColor(post.status))}>
                      {post.status}
                    </span>
                    {post.post_type === 'blog' ? (
                      <span className="flex items-center gap-1 text-xs text-gray-400"><Globe className="w-3 h-3" /> Blog</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400"><Eye className="w-3 h-3" /> Social</span>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs mb-2">{truncate(post.preview || '', 150)}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    {post.tags?.map((tag) => (
                      <span key={tag} className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">#{tag}</span>
                    ))}
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />{formatDate(post.created_at)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                  {post.status === 'pending' && (
                    <button
                      onClick={() => approvePost(post.id)}
                      disabled={approving === post.id}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      {approving === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Approve
                    </button>
                  )}
                  {post.post_type === 'social_media' && ['approved', 'published'].includes(post.status) && (
                    <button
                      onClick={() => publishToFacebook(post.id)}
                      disabled={publishing === post.id}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition-colors"
                    >
                      {publishing === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                      Post to Facebook
                    </button>
                  )}
                  <button
                    onClick={() => deletePost(post.id)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-400 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
