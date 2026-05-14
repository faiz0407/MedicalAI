'use client'
import { useState, useEffect } from 'react'
import {
  Calendar, Clock, CheckCircle, XCircle, Loader2, Plus,
  ChevronRight, IndianRupee, RefreshCw, X, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { appointmentsApi, doctorsApi, getErrorMessage } from '@/lib/api'
import { formatDateTime, badgeColor, cn } from '@/lib/utils'
import type { Appointment, Doctor, TimeSlot } from '@/types'

declare global {
  interface Window { Razorpay: any }
}

type Step = 'list' | 'department' | 'doctor' | 'slot' | 'confirm' | 'payment'

const DEPARTMENTS = [
  'General Practice','Cardiology','Neurology','Orthopedics',
  'Dermatology','Pediatrics','Gynecology','Psychiatry','Oncology',
]

const loadRazorpayScript = (): Promise<boolean> =>
  new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) { resolve(true); return }
    if (document.getElementById('rzp-script')) {
      const poll = setInterval(() => {
        if (window.Razorpay) { clearInterval(poll); resolve(true) }
      }, 100)
      return
    }
    const s = document.createElement('script')
    s.id = 'rzp-script'
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })

interface RescheduleForm {
  requested_department: string
  requested_time: string
  requested_symptoms_summary: string
  reason: string
}

export default function AppointmentsPage() {
  const [step, setStep] = useState<Step>('list')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  // Booking state
  const [selectedDept, setSelectedDept]     = useState('')
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [selectedDate, setSelectedDate]     = useState('')
  const [selectedSlot, setSelectedSlot]     = useState<TimeSlot | null>(null)
  const [symptoms, setSymptoms]             = useState('')
  const [bookedAppt, setBookedAppt]         = useState<{ id: number } | null>(null)

  // Cancel modal
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null)
  const [rescheduleForm, setRescheduleForm] = useState<RescheduleForm>({
    requested_department: '',
    requested_time: '',
    requested_symptoms_summary: '',
    reason: '',
  })

  useEffect(() => {
    if (step === 'list') fetchMyAppointments()
  }, [step])

  const fetchMyAppointments = async () => {
    setLoading(true)
    try {
      const { data } = await appointmentsApi.list()
      setAppointments(data.appointments || [])
    } catch { /* empty */ } finally { setLoading(false) }
  }

  const fetchDoctors = async (dept: string) => {
    setLoading(true)
    try {
      const { data } = await doctorsApi.list(dept)
      setDoctors(data.doctors || [])
    } catch { /* empty */ } finally { setLoading(false) }
  }

  const fetchSlots = async (doctorId: number, date: string) => {
    setLoading(true)
    try {
      const { data } = await doctorsApi.slots(doctorId, date)
      setSlots(data.slots || [])
    } catch { /* empty */ } finally { setLoading(false) }
  }

  const bookAppointment = async () => {
    if (!selectedDoctor || !selectedSlot) return
    setLoading(true)
    try {
      const { data } = await appointmentsApi.book({
        department: selectedDept,
        appointment_time: selectedSlot.datetime,
        symptoms_summary: symptoms || undefined,
      })
      setBookedAppt({ id: data.appointment_id })
      setStep('payment')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally { setLoading(false) }
  }

  const handleMockPayment = async () => {
    if (!bookedAppt) return
    setLoading(true)
    try {
      const { data: orderData } = await appointmentsApi.razorpayCreateOrder(bookedAppt.id)
      await appointmentsApi.razorpayVerify({
        appointment_id: bookedAppt.id,
        order_id: orderData.order_id,
        payment_id: `pay_DEMO_${Date.now()}`,
        signature: 'mock',
      })
      toast.success('Appointment confirmed!')
      setStep('list')
      resetFlow()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleRazorpayPayment = async () => {
    if (!bookedAppt) return
    setLoading(true)
    try {
      const { data: orderData } = await appointmentsApi.razorpayCreateOrder(bookedAppt.id)

      if (orderData.mock) {
        await appointmentsApi.razorpayVerify({
          appointment_id: bookedAppt.id,
          order_id: orderData.order_id,
          payment_id: `pay_MOCK_${Date.now()}`,
          signature: 'mock',
        })
        toast.success('Appointment confirmed! (dev mode)')
        setStep('list')
        resetFlow()
        return
      }

      const scriptLoaded = await loadRazorpayScript()
      if (!scriptLoaded) {
        toast.error('Failed to load Razorpay SDK.')
        setLoading(false)
        return
      }

      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'HealthcareAI',
        description: 'Consultation Fee — ₹1',
        order_id: orderData.order_id,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await appointmentsApi.razorpayVerify({
              appointment_id: bookedAppt.id,
              order_id: response.razorpay_order_id,
              payment_id: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            })
            toast.success('Payment successful! Appointment confirmed.')
            setStep('list')
            resetFlow()
          } catch (err) {
            toast.error(getErrorMessage(err))
          } finally {
            setLoading(false)
          }
        },
        theme: { color: '#FF8CA0' },
        modal: {
          ondismiss: () => { setLoading(false); toast('Payment cancelled.') },
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err) {
      toast.error(getErrorMessage(err))
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    setActionLoading(cancelTarget.id)
    try {
      await appointmentsApi.cancel(cancelTarget.id)
      toast.success('Appointment cancelled.')
      setCancelTarget(null)
      fetchMyAppointments()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  const handleReschedule = async () => {
    if (!rescheduleTarget) return
    const payload: Record<string, string> = {}
    if (rescheduleForm.requested_department) payload.requested_department = rescheduleForm.requested_department
    if (rescheduleForm.requested_time)       payload.requested_time = new Date(rescheduleForm.requested_time).toISOString()
    if (rescheduleForm.requested_symptoms_summary) payload.requested_symptoms_summary = rescheduleForm.requested_symptoms_summary
    if (rescheduleForm.reason)               payload.reason = rescheduleForm.reason

    if (!payload.requested_department && !payload.requested_time && !payload.requested_symptoms_summary) {
      toast.error('Please fill in at least one field to reschedule.')
      return
    }

    setActionLoading(rescheduleTarget.id)
    try {
      await appointmentsApi.reschedule(rescheduleTarget.id, payload)
      toast.success('Reschedule request submitted. Awaiting admin approval.')
      setRescheduleTarget(null)
      setRescheduleForm({ requested_department: '', requested_time: '', requested_symptoms_summary: '', reason: '' })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  const resetFlow = () => {
    setSelectedDept(''); setSelectedDoctor(null); setSelectedDate('')
    setSelectedSlot(null); setSymptoms(''); setBookedAppt(null)
  }

  const apptTime = (appt: Appointment) => appt.appointment_time || appt.time || ''

  const canActOn = (appt: Appointment) =>
    appt.status === 'pending' || appt.status === 'confirmed'

  const STEPS: { key: Step; label: string }[] = [
    { key: 'department', label: 'Department' },
    { key: 'doctor',     label: 'Doctor' },
    { key: 'slot',       label: 'Date & Time' },
    { key: 'confirm',    label: 'Confirm' },
    { key: 'payment',    label: 'Payment' },
  ]

  const stepIndex = STEPS.findIndex((s) => s.key === step)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
            <p className="text-gray-500 text-sm mt-0.5">Book and manage your medical appointments</p>
          </div>
          {step === 'list' && (
            <button onClick={() => setStep('department')} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Book New
            </button>
          )}
          {step !== 'list' && (
            <button onClick={() => { setStep('list'); resetFlow() }} className="btn-secondary text-sm">
              ← Back to list
            </button>
          )}
        </div>

        {/* Stepper */}
        {step !== 'list' && (
          <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
            {STEPS.map(({ key, label }, i) => (
              <div key={key} className="flex items-center gap-2">
                <div className={cn(
                  'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap',
                  i < stepIndex  ? 'bg-green-100 text-green-600' :
                  i === stepIndex ? 'bg-[#FF8CA0] text-white' :
                  'bg-gray-100 text-gray-400'
                )}>
                  {i < stepIndex && <CheckCircle className="w-3 h-3" />}
                  {label}
                </div>
                {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />}
              </div>
            ))}
          </div>
        )}

        {/* ── Step: List ── */}
        {step === 'list' && (
          loading ? <Spinner /> : appointments.length === 0 ? (
            <EmptyState
              message="No appointments yet"
              action={() => setStep('department')}
              actionLabel="Book your first appointment"
            />
          ) : (
            <div className="space-y-3">
              {appointments.map((appt) => (
                <div key={appt.id} className="medical-card flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="w-12 h-12 bg-[#FF8CA0]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-[#FF8CA0]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{appt.department}</span>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badgeColor(appt.status))}>
                        {appt.status}
                      </span>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badgeColor(appt.payment_status))}>
                        {appt.payment_status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDateTime(apptTime(appt))}
                    </p>
                    {appt.symptoms_summary && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{appt.symptoms_summary}</p>
                    )}
                    {canActOn(appt) && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => {
                            setRescheduleTarget(appt)
                            setRescheduleForm({
                              requested_department: appt.department || '',
                              requested_time: apptTime(appt) ? new Date(apptTime(appt)).toISOString().slice(0, 16) : '',
                              requested_symptoms_summary: appt.symptoms_summary || '',
                              reason: '',
                            })
                          }}
                          disabled={actionLoading === appt.id}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#FF8CA0] text-[#c0566d] hover:bg-[#FF8CA0]/10 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Reschedule
                        </button>
                        <button
                          onClick={() => setCancelTarget(appt)}
                          disabled={actionLoading === appt.id}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Step: Department ── */}
        {step === 'department' && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Select Department</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {DEPARTMENTS.map((dept) => (
                <button
                  key={dept}
                  onClick={() => { setSelectedDept(dept); fetchDoctors(dept); setStep('doctor') }}
                  className={cn(
                    'p-4 rounded-xl border-2 text-sm font-medium text-left transition-all hover:border-[#FF8CA0] hover:bg-[#FF8CA0]/5',
                    selectedDept === dept ? 'border-[#FF8CA0] bg-[#FF8CA0]/10 text-[#c0566d]' : 'border-gray-200 text-gray-700'
                  )}
                >
                  🏥 {dept}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step: Doctor ── */}
        {step === 'doctor' && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Choose a Doctor — {selectedDept}</h2>
            {loading ? <Spinner /> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {doctors.map((doc) => (
                  <button
                    key={doc.id}
                    disabled={!doc.available}
                    onClick={() => { setSelectedDoctor(doc); setStep('slot') }}
                    className={cn(
                      'medical-card text-left transition-all',
                      doc.available
                        ? 'hover:-translate-y-0.5 hover:border-[#FF8CA0]/30 cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-[#FF8CA0] to-[#c0566d] rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {doc.name[4] || 'D'}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{doc.name}</p>
                        <p className="text-xs text-gray-400">{doc.specialization}</p>
                      </div>
                    </div>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      doc.available ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    )}>
                      {doc.available ? '✓ Available' : 'Unavailable'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step: Slot ── */}
        {step === 'slot' && selectedDoctor && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Select Date & Time — Dr. {selectedDoctor.name}</h2>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
              <input
                type="date"
                value={selectedDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => { setSelectedDate(e.target.value); if (e.target.value) fetchSlots(selectedDoctor.id, e.target.value) }}
                className="input-field max-w-xs"
              />
            </div>
            {selectedDate && (
              loading ? <Spinner /> : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.time}
                      disabled={!slot.available}
                      onClick={() => { setSelectedSlot(slot); setStep('confirm') }}
                      className={cn(
                        'py-2.5 px-3 rounded-xl text-sm font-medium border-2 transition-all',
                        !slot.available ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400' :
                        selectedSlot?.time === slot.time ? 'border-[#FF8CA0] bg-[#FF8CA0] text-white' :
                        'border-gray-200 hover:border-[#FF8CA0] hover:bg-[#FF8CA0]/5 text-gray-700 cursor-pointer'
                      )}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* ── Step: Confirm ── */}
        {step === 'confirm' && selectedDoctor && selectedSlot && (
          <div className="max-w-md">
            <h2 className="font-semibold text-gray-900 mb-4">Confirm Appointment</h2>
            <div className="medical-card mb-4">
              <div className="space-y-3 text-sm">
                {[
                  ['Department', selectedDept],
                  ['Doctor', selectedDoctor.name],
                  ['Date & Time', `${selectedDate} at ${selectedSlot.time}`],
                  ['Consultation Fee', '₹1.00'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-900">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Brief symptom description (optional)
              </label>
              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="E.g., chest pain for 2 days, shortness of breath"
                rows={3}
                className="input-field"
              />
            </div>
            <button
              onClick={bookAppointment}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              Confirm & Proceed to Payment
            </button>
          </div>
        )}

        {/* ── Step: Payment ── */}
        {step === 'payment' && (
          <div className="max-w-md">
            <h2 className="font-semibold text-gray-900 mb-4">Payment</h2>
            <div className="medical-card mb-6">
              <div className="flex items-center justify-between mb-5">
                <span className="text-gray-500 text-sm">Consultation Fee</span>
                <span className="text-3xl font-bold text-gray-900 flex items-center gap-1">
                  <IndianRupee className="w-6 h-6" />1.00
                </span>
              </div>

              <div className="bg-[#FF8CA0]/10 rounded-xl p-4 mb-5 text-sm text-gray-600 space-y-1">
                <p className="font-semibold text-gray-800">📋 Booking Summary</p>
                <p>Department: <span className="font-medium">{selectedDept}</span></p>
                {selectedDoctor && <p>Doctor: <span className="font-medium">{selectedDoctor.name}</span></p>}
                {selectedSlot && <p>Time: <span className="font-medium">{selectedDate} at {selectedSlot.time}</span></p>}
              </div>

              <button
                onClick={handleRazorpayPayment}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 mb-3"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <IndianRupee className="w-4 h-4" />
                }
                Pay ₹1 via Razorpay
              </button>

              <div className="relative flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 whitespace-nowrap">or for testing</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <button
                onClick={handleMockPayment}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-all text-sm font-medium disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '🧪'}
                Confirm without payment (demo mode)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Cancel Confirmation Modal ── */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="font-bold text-gray-900">Cancel Appointment?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              <span className="font-medium">{cancelTarget.department}</span> on{' '}
              {formatDateTime(apptTime(cancelTarget))}
            </p>
            <p className="text-xs text-gray-400 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 btn-secondary text-sm"
              >
                Keep it
              </button>
              <button
                onClick={handleCancel}
                disabled={actionLoading === cancelTarget.id}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {actionLoading === cancelTarget.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <XCircle className="w-4 h-4" />
                }
                Cancel Appointment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reschedule Modal ── */}
      {rescheduleTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#FF8CA0]/10 rounded-full flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-[#FF8CA0]" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Request Reschedule</h3>
                  <p className="text-xs text-gray-400">Admin will review and apply changes</p>
                </div>
              </div>
              <button onClick={() => setRescheduleTarget(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  New Department <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select
                  value={rescheduleForm.requested_department}
                  onChange={(e) => setRescheduleForm(f => ({ ...f, requested_department: e.target.value }))}
                  className="input-field"
                >
                  <option value="">Keep current ({rescheduleTarget.department})</option>
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  New Date & Time <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={rescheduleForm.requested_time}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(e) => setRescheduleForm(f => ({ ...f, requested_time: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Updated Symptoms <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={rescheduleForm.requested_symptoms_summary}
                  onChange={(e) => setRescheduleForm(f => ({ ...f, requested_symptoms_summary: e.target.value }))}
                  placeholder="Describe any updated symptoms..."
                  rows={2}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Reason for reschedule
                </label>
                <textarea
                  value={rescheduleForm.reason}
                  onChange={(e) => setRescheduleForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="E.g., conflict with work schedule..."
                  rows={2}
                  className="input-field"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setRescheduleTarget(null)}
                className="flex-1 btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleReschedule}
                disabled={actionLoading === rescheduleTarget.id}
                className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
              >
                {actionLoading === rescheduleTarget.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <RefreshCw className="w-4 h-4" />
                }
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-7 h-7 animate-spin text-[#FF8CA0]" />
    </div>
  )
}

function EmptyState({ message, action, actionLabel }: {
  message: string; action: () => void; actionLabel: string
}) {
  return (
    <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
      <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <p className="text-gray-500 mb-4">{message}</p>
      <button onClick={action} className="btn-primary text-sm">{actionLabel}</button>
    </div>
  )
}
