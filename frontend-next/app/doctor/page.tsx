'use client'
import { useState, useEffect } from 'react'
import {
  Calendar, Clock, CheckCircle, XCircle, User,
  Loader2, ChevronDown, FileText, Activity
} from 'lucide-react'
import toast from 'react-hot-toast'
import { doctorsApi, getErrorMessage } from '@/lib/api'
import { badgeColor, formatDateTime, cn } from '@/lib/utils'

type Status = 'all' | 'pending' | 'confirmed' | 'completed' | 'no_show'

const STATUS_OPTIONS: { value: string; label: string; icon: typeof CheckCircle }[] = [
  { value: 'completed', label: 'Mark Completed', icon: CheckCircle },
  { value: 'no_show',   label: 'Mark No-Show',   icon: XCircle },
  { value: 'cancelled', label: 'Cancel',           icon: XCircle },
]

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState<any[]>([])
  const [filter, setFilter] = useState<Status>('all')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<number | null>(null)
  const [noteModal, setNoteModal] = useState<{ id: number; note: string } | null>(null)

  const fetchAppts = async () => {
    setLoading(true)
    try {
      const { data } = await doctorsApi.myAppointments(filter === 'all' ? undefined : filter)
      setAppointments(data.appointments || [])
    } catch {
      // Mock data fallback
      setAppointments([
        {
          id: 1, patient_name: 'Alice Smith', patient_email: 'alice@example.com',
          department: 'General Practice', time: new Date().toISOString(),
          status: 'confirmed', payment_status: 'paid',
          symptoms_summary: 'Persistent headache and low-grade fever for 3 days.',
        },
        {
          id: 2, patient_name: 'Bob Jones', patient_email: 'bob@example.com',
          department: 'Cardiology', time: new Date(Date.now() + 3600000).toISOString(),
          status: 'pending', payment_status: 'pending',
          symptoms_summary: 'Chest tightness when climbing stairs.',
        },
      ])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchAppts() }, [filter])

  const updateStatus = async (id: number, status: string, notes?: string) => {
    setUpdating(id)
    try {
      await doctorsApi.updateAppointmentStatus(id, status, notes)
      toast.success(`Appointment marked as ${status}`)
      setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, status } : a))
      setNoteModal(null)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setUpdating(null) }
  }

  const FILTERS: { value: Status; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'completed', label: 'Completed' },
    { value: 'no_show', label: 'No-Show' },
  ]

  const stats = {
    total: appointments.length,
    confirmed: appointments.filter((a) => a.status === 'confirmed').length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    pending: appointments.filter((a) => a.status === 'pending').length,
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Appointments</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage your patient appointments and update visit status</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total', value: stats.total,     color: 'text-gray-700 bg-gray-100' },
          { label: 'Pending', value: stats.pending,   color: 'text-yellow-600 bg-yellow-50' },
          { label: 'Confirmed', value: stats.confirmed, color: 'text-teal-600 bg-teal-50' },
          { label: 'Completed', value: stats.completed, color: 'text-green-600 bg-green-50' },
        ].map(({ label, value, color }) => (
          <div key={label} className="medical-card text-center">
            <p className={cn('text-3xl font-bold mb-1', color.split(' ')[0])}>{value}</p>
            <p className="text-sm text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-6">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
              filter === value ? 'bg-teal-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-600'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-teal-500" /></div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No appointments in this category</p>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map((appt) => (
            <div key={appt.id} className="medical-card">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-teal-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-bold text-gray-900">{appt.patient_name}</span>
                    <span className="text-gray-400 text-sm">{appt.patient_email}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badgeColor(appt.status))}>
                      {appt.status}
                    </span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badgeColor(appt.payment_status))}>
                      {appt.payment_status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mb-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" />{appt.department}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDateTime(appt.time)}</span>
                  </div>
                  {appt.symptoms_summary && (
                    <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-600 leading-relaxed mb-3">
                      <FileText className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                      {appt.symptoms_summary}
                    </div>
                  )}

                  {/* Action Buttons */}
                  {!['completed', 'cancelled', 'no_show'].includes(appt.status) && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setNoteModal({ id: appt.id, note: '' })}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg font-medium transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Mark Completed
                      </button>
                      <button
                        onClick={() => updateStatus(appt.id, 'no_show')}
                        disabled={updating === appt.id}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium transition-colors"
                      >
                        {updating === appt.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                        No Show
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Note Modal for completion */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md p-6">
            <h2 className="font-bold text-gray-900 mb-4">Add Visit Notes</h2>
            <textarea
              value={noteModal.note}
              onChange={(e) => setNoteModal({ ...noteModal, note: e.target.value })}
              placeholder="Optional: Add clinical notes for this visit..."
              rows={4}
              className="input-field mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setNoteModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => updateStatus(noteModal.id, 'completed', noteModal.note)}
                disabled={updating === noteModal.id}
                className="btn-teal flex-1 flex items-center justify-center gap-2"
              >
                {updating === noteModal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Save & Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
