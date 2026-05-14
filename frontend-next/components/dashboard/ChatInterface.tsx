'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Bot, User as UserIcon, Loader2, AlertTriangle,
  RotateCcw, Sparkles, Plus, MessageSquare, Trash2,
  ChevronDown, ChevronRight, BookOpen, PanelLeftClose, PanelLeft,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import toast from 'react-hot-toast'
import { chatApi, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'
import { generateSessionId, cn } from '@/lib/utils'
import type { ChatMessage, SessionSummary, RagChunk } from '@/types'

const QUICK_PROMPTS = [
  'I have a headache and fever',
  'Book me an appointment',
  'What are symptoms of diabetes?',
  'Suggest home remedies for cold',
]

// ─── Relative-time helper ────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

// ─── Sources panel ───────────────────────────────────────────────────────────

function RagSourcesPanel({ sources }: { sources: RagChunk[] }) {
  const [open, setOpen] = useState(false)
  if (!sources || sources.length === 0) return null
  return (
    <div className="mt-2 border border-blue-100 rounded-xl overflow-hidden text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full px-3 py-2 bg-blue-50 hover:bg-blue-100 transition-colors text-blue-700 font-medium"
      >
        <BookOpen className="w-3.5 h-3.5" />
        <span>Sources ({sources.length} PubMed chunks)</span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 ml-auto" />
          : <ChevronRight className="w-3.5 h-3.5 ml-auto" />
        }
      </button>
      {open && (
        <div className="divide-y divide-blue-50">
          {sources.map((chunk, i) => (
            <div key={i} className="px-3 py-2 bg-white">
              <div className="flex items-center gap-2 mb-1 text-gray-500">
                <span className="font-semibold text-blue-600">#{i + 1}</span>
                <span className="truncate">{chunk.citation}</span>
                <span className="ml-auto shrink-0 text-gray-400">
                  score {chunk.score.toFixed(3)} · cross {chunk.cross_score.toFixed(3)}
                </span>
              </div>
              <p className="text-gray-700 leading-relaxed line-clamp-4">{chunk.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ChatInterface() {
  const { user } = useAuthStore()

  // Sessions state
  const [sessions, setSessions]             = useState<SessionSummary[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [activeSessionId, setActiveSessionId] = useState<string>(() => generateSessionId())
  const [sidebarOpen, setSidebarOpen]       = useState(true)

  // Chat state
  const [messages, setMessages]             = useState<ChatMessage[]>([])
  const [input, setInput]                   = useState('')
  const [loading, setLoading]               = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [forcedIntent, setForcedIntent]     = useState<string | undefined>()

  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  // ── Welcome message ────────────────────────────────────────────────────────

  const showWelcome = useCallback(() => {
    setMessages([{
      id:        'welcome',
      role:      'assistant',
      content:   `Hello ${user?.full_name || user?.username || 'there'}! 👋\n\nI'm **HealthAI**, your unified healthcare assistant. I can help you with:\n\n- 🩺 **Medical Guidance** — symptom analysis, home remedies\n- 📅 **Appointments** — book, reschedule, or inquire\n- 💊 **Health Information** — evidence-based guidance\n\n⚕️ *I provide educational information only — not medical advice. For emergencies, call 911.*\n\nHow can I help you today?`,
      timestamp: new Date(),
      agent:     'master_general',
    }])
  }, [user])

  // ── Load session list ──────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const { data } = await chatApi.sessions()
      const list: SessionSummary[] = data.sessions || []
      setSessions(list)
      // Auto-select most recent session if one exists
      if (list.length > 0 && list[0].session_id) {
        setActiveSessionId(list[0].session_id)
      }
    } catch {
      // ignore — no sessions yet
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  // ── Load messages when active session changes ──────────────────────────────

  useEffect(() => {
    let cancelled = false
    setHistoryLoading(true)
    setMessages([])

    const load = async () => {
      try {
        const { data } = await chatApi.history(activeSessionId)
        if (cancelled) return
        if (data.messages && data.messages.length > 0) {
          setMessages(
            data.messages.map((m: {
              role: string; content: string; agent?: string
              timestamp: string; rag_sources?: RagChunk[]
            }, i: number) => ({
              id:          `hist_${i}`,
              role:        m.role as 'user' | 'assistant',
              content:     m.content,
              timestamp:   new Date(m.timestamp),
              agent:       m.agent,
              rag_sources: m.rag_sources ?? undefined,
            }))
          )
        } else {
          if (!cancelled) showWelcome()
        }
      } catch {
        if (!cancelled) showWelcome()
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [activeSessionId, showWelcome])

  // ── Auto-scroll ─────────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Send message ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg = text.trim()
    setInput('')

    setMessages(prev => [...prev, {
      id:        `u_${Date.now()}`,
      role:      'user',
      content:   userMsg,
      timestamp: new Date(),
    }])

    setLoading(true)
    const intentToSend = forcedIntent
    setForcedIntent(undefined)

    try {
      const { data } = await chatApi.send({
        message:       userMsg,
        session_id:    activeSessionId,
        force_intent:  intentToSend,
      })

      setMessages(prev => [...prev, {
        id:          `a_${Date.now()}`,
        role:        'assistant',
        content:     data.response || "I apologise, I couldn't generate a response.",
        timestamp:   new Date(),
        agent:       data.agent_used,
        isEmergency: data.is_emergency,
        rag_sources: data.rag_sources ?? undefined,
      }])

      if (data.suggest_booking) setForcedIntent('appointment')

      // Refresh session list so new title / last_active shows up
      await loadSessions()

    } catch (err) {
      toast.error(getErrorMessage(err))
      setMessages(prev => [...prev, {
        id:        `err_${Date.now()}`,
        role:      'assistant',
        content:   '⚠️ Something went wrong. Please try again.',
        timestamp: new Date(),
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [loading, activeSessionId, forcedIntent, loadSessions])

  // ── Start new session ───────────────────────────────────────────────────────

  const newChat = () => {
    const id = generateSessionId()
    setActiveSessionId(id)
    setForcedIntent(undefined)
    inputRef.current?.focus()
  }

  // ── Delete session ──────────────────────────────────────────────────────────

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await chatApi.deleteSession(sessionId)
      const updated = sessions.filter(s => s.session_id !== sessionId)
      setSessions(updated)
      if (activeSessionId === sessionId) {
        if (updated.length > 0) {
          setActiveSessionId(updated[0].session_id)
        } else {
          newChat()
        }
      }
    } catch {
      toast.error('Could not delete session')
    }
  }

  // ── Keyboard handler ────────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-white overflow-hidden">

      {/* ── Sessions Sidebar ─────────────────────────────────────────────── */}
      <div className={cn(
        'flex-shrink-0 border-r border-gray-100 flex flex-col transition-all duration-200 bg-gray-50',
        sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
      )}>
        {/* Sidebar header */}
        <div className="px-3 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Conversations</span>
        </div>

        {/* New chat button */}
        <div className="px-3 py-2">
          <button
            onClick={newChat}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {sessionsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6 px-3">
              No conversations yet.{'\n'}Send a message to start one.
            </p>
          ) : (
            sessions.map(s => (
              <button
                key={s.session_id}
                onClick={() => setActiveSessionId(s.session_id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors group flex items-start gap-2',
                  s.session_id === activeSessionId
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <MessageSquare className={cn(
                  'w-4 h-4 mt-0.5 flex-shrink-0',
                  s.session_id === activeSessionId ? 'text-blue-500' : 'text-gray-400'
                )} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-xs leading-tight">
                    {s.title || 'New Chat'}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                    <span>{relativeTime(s.last_active)}</span>
                    {s.message_count > 0 && (
                      <span>· {s.message_count} msgs</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={(e) => deleteSession(s.session_id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 hover:text-red-500 transition-all flex-shrink-0"
                  title="Delete session"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat Area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title={sidebarOpen ? 'Hide sessions' : 'Show sessions'}
          >
            {sidebarOpen
              ? <PanelLeftClose className="w-4 h-4" />
              : <PanelLeft className="w-4 h-4" />
            }
          </button>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-teal-500 rounded-xl flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900 text-sm">AI Health Assistant</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-gray-500">Online · 5 agents active</span>
            </div>
          </div>
          <button
            onClick={newChat}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            title="New chat"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
          {historyLoading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3 animate-fade-in',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className={cn(
                    'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
                    msg.isEmergency
                      ? 'bg-red-500'
                      : 'bg-gradient-to-br from-blue-500 to-teal-500'
                  )}>
                    {msg.isEmergency
                      ? <AlertTriangle className="w-4 h-4 text-white" />
                      : <Bot className="w-4 h-4 text-white" />
                    }
                  </div>
                )}

                <div className={cn(
                  'max-w-[80%]',
                  msg.role === 'user' ? '' : 'w-full max-w-[80%]'
                )}>
                  <div className={cn(
                    'rounded-2xl px-4 py-3 shadow-sm',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : msg.isEmergency
                        ? 'bg-red-50 border-2 border-red-200 text-gray-900 rounded-bl-sm'
                        : 'bg-white border border-gray-100 text-gray-900 rounded-bl-sm'
                  )}>
                    {msg.isEmergency && (
                      <div className="flex items-center gap-1.5 mb-2 text-red-600 font-bold text-sm">
                        <AlertTriangle className="w-4 h-4" /> EMERGENCY ADVISORY
                      </div>
                    )}
                    {msg.role === 'user' ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    ) : (
                      <div className="prose prose-sm max-w-none text-inherit">
                        <ReactMarkdown
                          components={{
                            p:      ({ children }) => <p className="mb-2 last:mb-0 text-sm leading-relaxed">{children}</p>,
                            ul:     ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                            ol:     ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                            li:     ({ children }) => <li className="text-sm">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            h2:     ({ children }) => <h2 className="font-bold text-base mt-3 mb-1">{children}</h2>,
                            h3:     ({ children }) => <h3 className="font-semibold text-sm mt-2 mb-1">{children}</h3>,
                            hr:     () => <hr className="my-3 border-gray-200" />,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    <p className={cn(
                      'text-xs mt-1.5',
                      msg.role === 'user' ? 'text-blue-200 text-right' : 'text-gray-400'
                    )}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.agent && msg.agent !== 'master_general' && (
                        <span className="ml-2 opacity-60">· {msg.agent}</span>
                      )}
                    </p>
                  </div>

                  {/* RAG Sources panel — only for assistant messages with sources */}
                  {msg.role === 'assistant' && msg.rag_sources && msg.rag_sources.length > 0 && (
                    <RagSourcesPanel sources={msg.rag_sources} />
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <UserIcon className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="flex gap-3 justify-start animate-fade-in">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  <span className="text-xs text-gray-500">AI is thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Quick prompts */}
        {!historyLoading && messages.length <= 1 && (
          <div className="px-4 sm:px-6 pb-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs text-gray-500 font-medium">Quick prompts</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="text-xs px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-full hover:border-[#FF8CA0] hover:bg-[#FF8CA0]/5 hover:text-[#c0566d] transition-colors text-gray-500"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="bg-gray-50 border-t border-gray-100 px-4 sm:px-6 py-4">
          <div className="flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your health question… (Enter to send, Shift+Enter for new line)"
              rows={2}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-[#FF8CA0] focus:ring-2 focus:ring-[#FF8CA0]/20 outline-none transition-all text-gray-900 placeholder-gray-400 bg-gray-50"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="flex-shrink-0 w-11 h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />
              }
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            ⚕️ Educational guidance only · Not a substitute for professional medical advice
          </p>
        </div>
      </div>
    </div>
  )
}
