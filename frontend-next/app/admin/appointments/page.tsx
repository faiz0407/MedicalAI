'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Calendar, Edit2, Trash2, CheckCircle, XCircle,
  Loader2, RefreshCw, ChevronDown, AlertCircle, X, Filter,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi, getErrorMessage } from '@/lib/api'
import { formatDateTime, badgeColor, cn } from '@/lib/utils'

interface Appt {
  id: number
  patient_id: number
  department: string
  time: string
  status: string
  payment_status: string
  symptoms_summary: string | null
  feedback_rating: number | null
  payment_reference: string | null
}

interface RescheduleReq {
  id: number
  appointment_id: number
  patient_id: number
  requested_department: string | null
  requested_time: string | null
  requested_symptoms_summary: string | null
  reason: string | null
  status: string
  admin_notes: string | null
  created_at: string
}

const STATUS_OPTIONS = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show']
const DEPARTMENTS = [
  'General Practice','Cardiology','Neurology','Orthopedics',
  'Dermatology','Pediatrics','Gynecology','Psychiatry','Oncology',
  'ENT','Ophthalmology','Pulmonology','Gastroenterology',
]

type Tab = 'appointments' | 'reschedule'

export default function AdminAppointmentsPage() {
  const [tab, setTab] = useState<Tab>('appointments')

  // ── Appointments ──
  const [appointments, setAppointments] = useState<Appt[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading]           = useState(false)

  // Edit modal
  const [editTarget, setEditTarget] = useState<Appt | null>(null)
  const [editForm, setEditForm]     = useState({
    department: '', appointment_time: '', symptoms_summary: '', status: '',
  })
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Appt | null>(null)
  const [deleting, setDeleting]         = useState(false)

  // ── Reschedule requests ──
  const [reschedules, setReschedules]       = useState<RescheduleReq[]>([])
  const [rescheduleLoading, setRescheduleLoading] = useState(false)
  const [actionTarget, setActionTarget]     = useState<{ req: RescheduleReq; action: 'approve' | 'reject' } | null>(null)
  const [adminNotes, setAdminNotes]         = useState('')
  const [actionSaving, setActionSaving]     = useState(false)

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminApi.appointments({ status: filterStatus || undefined, limit: 100 })
      setAppointments(data.appointments || [])
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setLoading(false) }
  }, [filterStatus])

  const fetchReschedules = useCallback(async () => {
    setRescheduleLoading(true)
    try {
      const { data } = await adminApi.rescheduleRequests('pending')
      setReschedules(data.requests || [])
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setRescheduleLoading(false) }
  }, [])

  useEffect(() => { fetchAppointments() }, [fetchAppointments])
  useEffect(() => { if (tab === 'reschedule') fetchReschedules() }, [tab, fetchReschedules])

  const openEdit = (appt: Appt) => {
    setEditTarget(appt)
    // Convert ISO time to datetime-local format
    let localTime = ''
    if (appt.time) {
      try { localTime = new Date(appt.time).toISOString().slice(0, 16) } catch { /* empty */ }
    }
    setEditForm({
      department:         appt.department || '',
      appointment_time:   localTime,
      symptoms_summary:   appt.symptoms_summary || '',
      status:             appt.status || '',
    })
  }

  const handleSave = async () => {
    if (!editTarget) return
    setSaving(true)
    try {
      const payload: Record<string, string> = {}
      if (editForm.department !== editTarget.department)
        payload.department = editForm.department
      if (editForm.status !== editTarget.status)
        payload.status = editForm.status
      if (editForm.symptoms_summary !== (editTarget.symptoms_summary || ''))
        payload.symptoms_summary = editForm.symptoms_summary
      if (editForm.appointment_time) {
        const orig = editTarget.time ? new Date(editTarget.time).toISOString().slice(0, 16) : ''
        if (editForm.appointment_time !== orig)
          payload.appointment_time = new Date(editForm.appointment_time).toISOString()
      }

      if (Object.keys(payload).length === 0) {
        toast('No changes to save.')
        setSaving(false)
        return
      }

      await adminApi.editAppointment(editTarget.id, payload)
      toast.success('Appointment updated.')
      setEditTarget(null)
      fetchAppointments()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await adminApi.deleteAppointment(deleteTarget.id)
      toast.success('Appointment deleted.')
      setDeleteTarget(null)
      fetchAppointments()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setDeleting(false) }
  }

  const handleRescheduleAction = async () => {
    if (!actionTarget) return
    setActionSaving(true)
    try {
      if (actionTarget.action === 'approve') {
        await adminApi.approveReschedule(actionTarget.req.id, adminNotes || undefined)
        toast.success('Reschedule approved and appointment updated.')
      } else {
        await adminApi.rejectReschedule(actionTarget.req.id, adminNotes || undefined)
        toast.success('Reschedule request rejected.')
      }
      setActionTarget(null)
      setAdminNotes('')
      fetchReschedules()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setActionSaving(false) }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="text-gray-500 text-sm mt-0.5">View, edit, and manage all patient appointments</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
          {(['appointments', 'reschedule'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors capitalize',
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t === 'reschedule' ? 'Reschedule Requests' : 'All Appointments'}
              {t === 'reschedule' && reschedules.length > 0 && (
                <span className="ml-1.5 bg-amber-400 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {reschedules.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Appointments Tab ── */}
        {tab === 'appointments' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                >
                  <option value="">All statuses</option>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button
                onClick={fetchAppointments}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 px-3 py-1.5 border border-gray-200 rounded-lg bg-white transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
              <span className="text-xs text-gray-400">{appointments.length} records</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-purple-400" /></div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">No appointments found</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Patient</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Department</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {appointments.map((appt) => (
                      <tr key={appt.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{appt.id}</td>
                        <td className="px-4 py-3 text-gray-600">P-{appt.patient_id}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{appt.department}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(appt.time)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badgeColor(appt.status))}>
                            {appt.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badgeColor(appt.payment_status))}>
                            {appt.payment_status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => openEdit(appt)}
                              className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(appt)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Reschedule Requests Tab ── */}
        {tab === 'reschedule' && (
          rescheduleLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-purple-400" /></div>
          ) : reschedules.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No pending reschedule requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reschedules.map((req) => (
                <div key={req.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="font-semibold text-gray-900">Request #{req.id}</span>
                        <span className="text-xs text-gray-400">→ Appointment #{req.appointment_id}</span>
                        <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-medium">
                          {req.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                        {req.requested_department && (
                          <p>New dept: <span className="font-medium text-gray-900">{req.requested_department}</span></p>
                        )}
                        {req.requested_time && (
                          <p>New time: <span className="font-medium text-gray-900">{formatDateTime(req.requested_time)}</span></p>
                        )}
                        {req.reason && (
                          <p className="sm:col-span-2">Reason: <span className="text-gray-700">{req.reason}</span></p>
                        )}
                        <p className="text-xs text-gray-400">
                          Submitted: {new Date(req.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setActionTarget({ req, action: 'approve' }); setAdminNotes('') }}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100 transition-colors font-medium"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => { setActionTarget({ req, action: 'reject' }); setAdminNotes('') }}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100 transition-colors font-medium"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Edit Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">Edit Appointment #{editTarget.id}</h3>
              <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Department</label>
                <select
                  value={editForm.department}
                  onChange={(e) => setEditForm(f => ({ ...f, department: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                >
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Date & Time</label>
                <input
                  type="datetime-local"
                  value={editForm.appointment_time}
                  onChange={(e) => setEditForm(f => ({ ...f, appointment_time: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                >
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Symptoms Summary</label>
                <textarea
                  value={editForm.symptoms_summary}
                  onChange={(e) => setEditForm(f => ({ ...f, symptoms_summary: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditTarget(null)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="font-bold text-gray-900">Delete Appointment #{deleteTarget.id}?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              {deleteTarget.department} — {formatDateTime(deleteTarget.time)}. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
                Keep
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reschedule Approve/Reject Modal ── */}
      {actionTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center',
                actionTarget.action === 'approve' ? 'bg-green-100' : 'bg-red-100'
              )}>
                {actionTarget.action === 'approve'
                  ? <CheckCircle className="w-5 h-5 text-green-600" />
                  : <XCircle className="w-5 h-5 text-red-500" />
                }
              </div>
              <div>
                <h3 className="font-bold text-gray-900">
                  {actionTarget.action === 'approve' ? 'Approve' : 'Reject'} Reschedule?
                </h3>
                <p className="text-xs text-gray-400">Request #{actionTarget.req.id}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Admin notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Leave a note for the patient..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setActionTarget(null)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleRescheduleAction}
                disabled={actionSaving}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50',
                  actionTarget.action === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-500 hover:bg-red-600'
                )}
              >
                {actionSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {actionTarget.action === 'approve' ? 'Approve & Apply' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
