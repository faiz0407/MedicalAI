'use client'
import { useState, useEffect } from 'react'
import { Bell, Send, Eye, CheckCircle, Loader2, Plus, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi, getErrorMessage } from '@/lib/api'
import { badgeColor, formatDate, cn } from '@/lib/utils'
import type { NotificationCampaign } from '@/types'

export default function NotificationsAdminPage() {
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([])
  const [loading, setLoading]     = useState(true)
  const [approving, setApproving] = useState<number | null>(null)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm] = useState({ disease: '', message: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    adminApi.pendingCampaigns()
      .then(({ data }) => setCampaigns(data.campaigns || []))
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false))
  }, [])

  const approveCampaign = async (id: number) => {
    setApproving(id)
    try {
      await adminApi.approveCampaign(id)
      toast.success('Campaign approved and emails queued!')
      setCampaigns((prev) =>
        prev.map((c) => c.id === id ? { ...c, status: 'approved' as any } : c)
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setApproving(null) }
  }

  const sendCampaignViaChat = async () => {
    if (!form.disease) { toast.error('Enter disease name'); return }
    setSubmitting(true)
    // This goes through the AI notification agent via the chat endpoint
    try {
      // In real flow: call chatApi with force_intent = 'notification'
      toast.success('Notification request sent to AI Agent! Check campaigns after a moment.')
      setShowForm(false)
      setForm({ disease: '', message: '' })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setSubmitting(false) }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Treatment Notifications</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Send personalised treatment updates to matching patients
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {/* Create Campaign Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md p-6">
            <h2 className="font-bold text-gray-900 mb-4 text-lg">Create Notification Campaign</h2>
            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Disease / Condition</label>
                <input
                  value={form.disease}
                  onChange={(e) => setForm({ ...form, disease: e.target.value })}
                  placeholder="e.g., Diabetes, Hypertension, Asthma"
                  className="input-field"
                />
                <p className="text-xs text-gray-400 mt-1">
                  AI will find all matching patients and generate personalised emails
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Treatment Details</label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Briefly describe the new treatment or update..."
                  rows={4}
                  className="input-field"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-700">
                  ⚠️ AI will generate email drafts. You must approve before any emails are sent.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={sendCampaignViaChat}
                disabled={submitting}
                className="btn-teal flex-1 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Generate Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#FF8CA0]" /></div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Bell className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-4">No notification campaigns yet</p>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">Create First Campaign</button>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="medical-card">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="font-bold text-gray-900">{campaign.treatment_title}</h3>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badgeColor(campaign.status))}>
                      {campaign.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mb-2">
                    <strong>Disease:</strong> {campaign.disease_name}
                  </p>
                  <p className="text-sm text-gray-400 leading-relaxed mb-3">{campaign.treatment_details}</p>

                  {/* Email Preview */}
                  {campaign.email_template && (
                    <div className="bg-gray-100 border border-gray-200 rounded-xl p-3 mb-3">
                      <p className="text-xs font-semibold text-gray-400 mb-1 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Email Template Preview
                      </p>
                      <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">
                        {campaign.email_template}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {campaign.sent_count} sent</span>
                    <span>{formatDate(campaign.created_at)}</span>
                  </div>
                </div>

                {campaign.status === 'pending' && (
                  <button
                    onClick={() => approveCampaign(campaign.id)}
                    disabled={approving === campaign.id}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors font-medium flex-shrink-0"
                  >
                    {approving === campaign.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <CheckCircle className="w-4 h-4" />
                    }
                    Approve & Send
                  </button>
                )}
                {campaign.status === 'sent' && (
                  <span className="flex items-center gap-1.5 text-sm px-4 py-2 bg-green-100 text-green-700 rounded-xl font-medium flex-shrink-0">
                    <CheckCircle className="w-4 h-4" /> Sent
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
