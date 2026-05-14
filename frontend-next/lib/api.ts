/**
 * Centralized API client.
 * All requests go through this module — never call fetch/axios directly in components.
 */
import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
})

// ─── Auth Interceptor ─────────────────────────────────────────────────────────

apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// ─── Response error normaliser ────────────────────────────────────────────────

apiClient.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ detail?: string }>) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string })?.detail
    if (detail) return typeof detail === 'string' ? detail : JSON.stringify(detail)
    if (err.message) return err.message
  }
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred'
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: {
    username: string; email: string; password: string
    full_name?: string; age?: number; gender?: string; role?: string
  }) => apiClient.post('/api/auth/register', data),

  login: (username: string, password: string) => {
    const form = new URLSearchParams()
    form.append('username', username)
    form.append('password', password)
    return apiClient.post('/api/auth/token', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  },

  me: () => apiClient.get('/api/auth/me'),
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const chatApi = {
  send: (params: {
    message: string; session_id: string
    force_intent?: string; route_context?: Record<string, unknown>
  }) => apiClient.post('/api/chat/message', params),

  history:        (sessionId: string) => apiClient.get(`/api/chat/history/${sessionId}`),
  sessions:       ()                  => apiClient.get('/api/chat/sessions'),
  deleteSession:  (sessionId: string) => apiClient.delete(`/api/chat/sessions/${sessionId}`),
  summary:        (userId: number)    => apiClient.get(`/api/chat/summary/${userId}`),
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export const appointmentsApi = {
  availableSlots: (department: string, date: string) =>
    apiClient.get('/api/appointments/available-slots', { params: { department, date } }),

  book: (data: { department: string; appointment_time: string; symptoms_summary?: string }) =>
    apiClient.post('/api/appointments/book', data),

  razorpayCreateOrder: (appointment_id: number) =>
    apiClient.post('/api/appointments/razorpay/create-order', { appointment_id }),

  razorpayVerify: (data: { appointment_id: number; order_id: string; payment_id: string; signature: string }) =>
    apiClient.post('/api/appointments/razorpay/verify', data),

  list: () => apiClient.get('/api/appointments/my'),

  cancel: (id: number) =>
    apiClient.post(`/api/appointments/${id}/cancel`),

  reschedule: (id: number, data: {
    requested_department?: string
    requested_time?: string
    requested_symptoms_summary?: string
    reason?: string
  }) => apiClient.post(`/api/appointments/${id}/reschedule`, data),

  myRescheduleRequests: () =>
    apiClient.get('/api/appointments/my-reschedule-requests'),

  updateStatus: (id: number, status: string) =>
    apiClient.patch(`/api/appointments/${id}/status`, { status }),

  feedback: (id: number, feedback: string, rating: number) =>
    apiClient.post(`/api/appointments/${id}/feedback`, { feedback, rating }),
}

// ─── Doctors ──────────────────────────────────────────────────────────────────

export const doctorsApi = {
  list: (department?: string) =>
    apiClient.get('/api/doctors/list', { params: { department } }),

  departments: () => apiClient.get('/api/doctors/departments'),

  slots: (doctorId: number, date: string) =>
    apiClient.get(`/api/doctors/${doctorId}/slots`, { params: { date } }),

  myAppointments: (status?: string) =>
    apiClient.get('/api/doctors/me/appointments', { params: { status } }),

  updateAppointmentStatus: (apptId: number, status: string, notes?: string) =>
    apiClient.patch(`/api/doctors/me/appointments/${apptId}/status`, { status, notes }),
}

// ─── Blog & News ──────────────────────────────────────────────────────────────

export const blogApi = {
  posts: (params?: { category?: string; search?: string; page?: number; per_page?: number }) =>
    apiClient.get('/api/blog/posts', { params }),

  post: (id: number) => apiClient.get(`/api/blog/posts/${id}`),

  news: (category?: string, page_size?: number) =>
    apiClient.get('/api/blog/news', { params: { category, page_size } }),

  categories: () => apiClient.get('/api/blog/categories'),

  // Admin
  adminAll: (params?: { status?: string; page?: number }) =>
    apiClient.get('/api/blog/admin/all', { params }),

  adminCreate: (data: object) => apiClient.post('/api/blog/admin/create', data),

  enhance: (title?: string, content?: string, post_type = 'blog', platform = 'website') =>
    apiClient.post('/api/blog/enhance', { title, content, post_type, platform }),

  publishToFacebook: (id: number) =>
    apiClient.post(`/api/blog/admin/${id}/publish/facebook`),

  adminUpdate: (id: number, data: object) => apiClient.patch(`/api/blog/admin/${id}`, data),

  adminDelete: (id: number) => apiClient.delete(`/api/blog/admin/${id}`),

  adminApprove: (id: number) => apiClient.post(`/api/blog/admin/${id}/approve`),
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminApi = {
  reviews: (category?: string, limit?: number) =>
    apiClient.get('/api/admin/reviews', { params: { category, limit } }),

  approveReply: (reviewId: number) =>
    apiClient.post(`/api/admin/reviews/${reviewId}/approve-reply`),

  pendingContent: () => apiClient.get('/api/admin/content/pending'),

  approveContent: (id: number) => apiClient.post(`/api/admin/content/${id}/approve`),
  rejectContent:  (id: number) => apiClient.post(`/api/admin/content/${id}/reject`),

  users: (role?: string) => apiClient.get('/api/admin/users', { params: { role } }),

  auditLogs: (limit?: number) =>
    apiClient.get('/api/admin/audit-logs', { params: { limit } }),

  pendingCampaigns: () => apiClient.get('/api/admin/notifications/pending'),

  approveCampaign:  (id: number) =>
    apiClient.post(`/api/admin/notifications/${id}/approve`),

  // Appointments
  appointments: (params?: { status?: string; limit?: number; offset?: number }) =>
    apiClient.get('/api/admin/appointments', { params }),

  editAppointment: (id: number, data: {
    department?: string
    appointment_time?: string
    symptoms_summary?: string
    status?: string
  }) => apiClient.patch(`/api/admin/appointments/${id}`, data),

  deleteAppointment: (id: number) =>
    apiClient.delete(`/api/admin/appointments/${id}`),

  // Reschedule requests
  rescheduleRequests: (status?: string) =>
    apiClient.get('/api/admin/reschedule-requests', { params: { status } }),

  approveReschedule: (id: number, admin_notes?: string) =>
    apiClient.post(`/api/admin/reschedule-requests/${id}/approve`, { admin_notes }),

  rejectReschedule: (id: number, admin_notes?: string) =>
    apiClient.post(`/api/admin/reschedule-requests/${id}/reject`, { admin_notes }),

  // Doctors
  getDoctors: () =>
    apiClient.get('/api/admin/doctors'),

  createDoctor: (data: {
    username: string; email: string; full_name: string
    specialization: string; phone?: string; password?: string
  }) => apiClient.post('/api/admin/doctors', data),

  toggleDoctorStatus: (id: number) =>
    apiClient.patch(`/api/admin/doctors/${id}/toggle`),

  // Reviews
  syncGoogleReviews: () =>
    apiClient.post('/api/admin/reviews/sync-google'),
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export const analyticsApi = {
  dashboard:     ()           => apiClient.get('/api/analytics/dashboard'),
  activityTrend: (days = 7)  => apiClient.get('/api/analytics/activity', { params: { days } }),
  symptomTrends: (days = 30) => apiClient.get('/api/analytics/symptoms/trends', { params: { days } }),
  reviewSentiment: (days = 30) => apiClient.get('/api/analytics/reviews/sentiment', { params: { days } }),
}
