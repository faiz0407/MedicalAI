// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = 'patient' | 'doctor' | 'admin'

export interface User {
  id: number
  username: string
  email: string
  full_name?: string
  age?: number
  gender?: string
  phone?: string
  role: UserRole
  is_active?: boolean
  created_at?: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  _hasHydrated: boolean
  setAuth: (token: string, user: User) => void
  logout: () => void
  updateUser: (updates: Partial<User>) => void
  setHasHydrated: (val: boolean) => void
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export interface RagChunk {
  text: string
  citation: string
  score: number
  cross_score: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agent?: string
  timestamp: Date
  isEmergency?: boolean
  rag_sources?: RagChunk[]
}

export interface SessionSummary {
  session_id: string
  title: string
  last_active: string
  message_count: number
  created_at: string
}

export interface ChatSession {
  session_id: string
  messages: ChatMessage[]
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export interface Appointment {
  id: number
  patient_id?: number
  doctor_id?: number
  department: string
  appointment_time?: string   // returned by admin + detail endpoints
  time?: string               // returned by /my endpoint
  symptoms_summary?: string
  status: AppointmentStatus
  payment_status: PaymentStatus
  payment_reference?: string
  feedback?: string
  feedback_given?: boolean
  feedback_rating?: number
  created_at?: string
  // joined fields
  patient_name?: string
  doctor_name?: string
}

// ─── Blog / News ──────────────────────────────────────────────────────────────

export type ContentStatus =
  | 'draft' | 'pending' | 'approved' | 'rejected' | 'published'

export interface BlogPost {
  id: number
  title: string
  content?: string
  preview?: string
  post_type: string
  platform: string
  status: ContentStatus
  tags: string[]
  created_at: string
  published_at?: string
}

export interface NewsArticle {
  title: string
  description: string
  url: string
  image?: string
  source: string
  published_at: string
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export type ReviewCategory = 'good' | 'moderate' | 'high_risk'

export interface Review {
  id: number
  platform: string
  reviewer_name: string
  rating: number
  review_text: string
  review_date: string
  category: ReviewCategory
  ai_reply?: string
  reply_approved: boolean
  reply_posted: boolean
  flagged_keywords?: string[]
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface NotificationCampaign {
  id: number
  disease_name: string
  treatment_title: string
  treatment_details: string
  email_template?: string
  status: 'pending' | 'approved' | 'sent' | 'failed'
  sent_count: number
  created_at: string
  approved_at?: string
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  total_patients: number
  total_doctors: number
  total_appointments: number
  appointments_today: number
  booking_conversion: number
  high_risk_reviews_total: number
  pending_content_items: number
}

export interface SymptomTrend {
  symptom: string
  count: number
}

// ─── Doctor ──────────────────────────────────────────────────────────────────

export interface Doctor {
  id: number
  name: string
  username: string
  specialization: string
  available: boolean
}

export interface TimeSlot {
  time: string
  datetime: string
  available: boolean
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string
}

export interface PaginatedResponse<T> {
  total: number
  page: number
  per_page: number
  items: T[]
}
