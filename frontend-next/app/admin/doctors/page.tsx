'use client'
import { useState, useEffect } from 'react'
import { UserPlus, Loader2, Plus, ToggleLeft, ToggleRight, Stethoscope } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi, getErrorMessage } from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'

interface Doctor {
  id: number
  username: string
  email: string
  full_name: string
  specialization: string
  phone?: string
  is_active: boolean
  created_at: string
}

const SPECIALIZATIONS = [
  'General Practice', 'Cardiology', 'Neurology', 'Orthopedics',
  'Dermatology', 'Pediatrics', 'Gynecology', 'ENT', 'Ophthalmology',
  'Psychiatry', 'Pulmonology', 'Gastroenterology', 'Oncology', 'Radiology',
]

export default function AdminDoctorsPage() {
  const [doctors, setDoctors]     = useState<Doctor[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [creating, setCreating]   = useState(false)
  const [toggling, setToggling]   = useState<number | null>(null)

  const [form, setForm] = useState({
    username: '', email: '', full_name: '', specialization: 'General Practice',
    phone: '', password: 'Doctor@123',
  })

  const fetchDoctors = async () => {
    setLoading(true)
    try {
      const { data } = await adminApi.getDoctors()
      setDoctors(data.doctors || [])
    } catch { setDoctors([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchDoctors() }, [])

  const createDoctor = async () => {
    if (!form.username || !form.email || !form.full_name) {
      toast.error('Username, email, and full name are required')
      return
    }
    setCreating(true)
    try {
      await adminApi.createDoctor({
        username:       form.username,
        email:          form.email,
        full_name:      form.full_name,
        specialization: form.specialization,
        phone:          form.phone || undefined,
        password:       form.password || 'Doctor@123',
      })
      toast.success('Doctor account created')
      setShowForm(false)
      setForm({ username: '', email: '', full_name: '', specialization: 'General Practice', phone: '', password: 'Doctor@123' })
      fetchDoctors()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setCreating(false) }
  }

  const toggleStatus = async (id: number) => {
    setToggling(id)
    try {
      const { data } = await adminApi.toggleDoctorStatus(id)
      setDoctors((prev) => prev.map((d) => d.id === id ? { ...d, is_active: data.is_active } : d))
      toast.success(data.is_active ? 'Doctor activated' : 'Doctor deactivated')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setToggling(null) }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Doctor Management</h1>
          <p className="text-gray-400 text-sm mt-0.5">Add and manage doctor accounts in the system</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> Add Doctor
        </button>
      </div>

      {/* Add Doctor Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-600" />
                <h2 className="font-bold text-gray-900 text-lg">Add New Doctor</h2>
              </div>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="space-y-3">
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Full name *"
                className="input-field"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="Username *"
                  className="input-field"
                />
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Email *"
                  type="email"
                  className="input-field"
                />
              </div>
              <select
                value={form.specialization}
                onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                className="input-field"
              >
                {SPECIALIZATIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Phone (optional)"
                  className="input-field"
                />
                <input
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Initial password"
                  type="password"
                  className="input-field"
                />
              </div>
              <p className="text-xs text-gray-400">Default password: Doctor@123 — doctor can change after first login</p>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={createDoctor}
                disabled={creating}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Create Account
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-[#FF8CA0]" />
        </div>
      ) : doctors.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Stethoscope className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 font-medium mb-1">No doctors yet</p>
          <p className="text-gray-300 text-sm">Click "Add Doctor" to create the first doctor account</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Doctor</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Specialization</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Contact</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Added</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {doctors.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                        {(doc.full_name || doc.username || 'D')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{doc.full_name || doc.username}</p>
                        <p className="text-xs text-gray-400">@{doc.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                      {doc.specialization || 'General Practice'}
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <p className="text-gray-600">{doc.email}</p>
                    {doc.phone && <p className="text-xs text-gray-400">{doc.phone}</p>}
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell text-gray-400 text-xs">
                    {doc.created_at ? formatDate(doc.created_at) : '—'}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => toggleStatus(doc.id)}
                      disabled={toggling === doc.id}
                      className={cn(
                        'flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        doc.is_active
                          ? 'bg-green-50 text-green-700 hover:bg-green-100'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      )}
                    >
                      {toggling === doc.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : doc.is_active
                          ? <ToggleRight className="w-3.5 h-3.5" />
                          : <ToggleLeft className="w-3.5 h-3.5" />
                      }
                      {doc.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
