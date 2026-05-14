'use client'
import { useState, useEffect } from 'react'
import {
  ClipboardList, Calendar, Activity, AlertTriangle,
  Loader2, Download, MessageSquare, ChevronRight,
} from 'lucide-react'
import { chatApi, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'
import { formatDateTime, cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface Session {
  session_id: string
  title: string
  last_active: string
  created_at: string
  message_count: number
  agents_invoked: string[]
}

const AGENT_LABELS: Record<string, string> = {
  medical:      'Medical',
  appointment:  'Appointments',
  reputation:   'Reviews',
  content:      'Content',
  notification: 'Notifications',
  general:      'General',
}

function relativeTime(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function MedicalHistoryPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [summary, setSummary]   = useState<string>('')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [sessRes] = await Promise.allSettled([
          chatApi.sessions(),
        ])
        if (sessRes.status === 'fulfilled') {
          const raw = sessRes.value.data.sessions || []
          // sort newest first
          raw.sort((a: Session, b: Session) =>
            new Date(b.last_active || b.created_at).getTime() -
            new Date(a.last_active || a.created_at).getTime()
          )
          setSessions(raw)
        }

        if (user?.id) {
          const sumRes = await chatApi.summary(user.id).catch(() => null)
          if (sumRes) setSummary(sumRes.data.summary || '')
        }
      } catch { /* empty */ } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [user?.id])

  const openSession = (sessionId: string) => {
    router.push(`/dashboard/chat?session=${sessionId}`)
  }

  const downloadPDF = () => {
    toast('PDF export coming soon — backend integration pending.', { icon: '📄' })
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Medical History</h1>
            <p className="text-gray-500 text-sm mt-0.5">Your AI interaction history and health summaries</p>
          </div>
          <button onClick={downloadPDF} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Export PDF
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-[#FF8CA0]" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* AI Summary */}
            {summary && (
              <div className="medical-card border-l-4 border-l-[#FF8CA0]">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-5 h-5 text-[#FF8CA0]" />
                  <h2 className="font-bold text-gray-900">5-Day Health Summary</h2>
                  <span className="text-xs bg-[#FF8CA0]/10 text-[#c0566d] px-2 py-0.5 rounded-full">AI Generated</span>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{summary}</p>
              </div>
            )}

            {/* Sessions */}
            <div>
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-gray-400" />
                Conversations
                {sessions.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-normal">
                    {sessions.length}
                  </span>
                )}
              </h2>

              {sessions.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                  <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">
                    No conversations yet. Start chatting with the AI assistant.
                  </p>
                  <button
                    onClick={() => router.push('/dashboard/chat')}
                    className="btn-primary text-sm"
                  >
                    Start a Conversation
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((sess) => (
                    <button
                      key={sess.session_id}
                      onClick={() => openSession(sess.session_id)}
                      className="w-full medical-card flex items-center gap-4 text-left hover:border-[#FF8CA0]/40 hover:bg-[#FF8CA0]/5 transition-all group cursor-pointer"
                    >
                      <div className="w-10 h-10 bg-[#FF8CA0]/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-[#FF8CA0]/20 transition-colors">
                        <MessageSquare className="w-5 h-5 text-[#FF8CA0]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Session title — set from first user message */}
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {sess.title && sess.title !== 'New Chat'
                            ? sess.title
                            : 'New Conversation'}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {relativeTime(sess.last_active || sess.created_at)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {sess.message_count} message{sess.message_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {sess.agents_invoked && sess.agents_invoked.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {Array.from(new Set(sess.agents_invoked)).slice(0, 4).map((a: string) => (
                              <span key={a} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                {AGENT_LABELS[a] || a}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#FF8CA0] transition-colors flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Emergency Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-700 text-sm">Medical History Disclaimer</p>
                <p className="text-amber-600 text-xs mt-0.5 leading-relaxed">
                  This history contains AI-generated health guidance for reference only.
                  It is not a substitute for professional medical records maintained by your healthcare provider.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
