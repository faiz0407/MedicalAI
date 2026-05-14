import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatTime(dateStr?: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  })
}

export function truncate(str: string, maxLen = 120): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen).trimEnd() + '…'
}

export function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ')
}

export function badgeColor(status: string): string {
  const map: Record<string, string> = {
    good:         'bg-green-100 text-green-700',
    moderate:     'bg-yellow-100 text-yellow-700',
    high_risk:    'bg-red-100 text-red-700',
    pending:      'bg-yellow-100 text-yellow-700',
    confirmed:    'bg-blue-100 text-blue-700',
    completed:    'bg-green-100 text-green-700',
    cancelled:    'bg-red-100 text-red-700',
    no_show:      'bg-gray-100 text-gray-600',
    paid:         'bg-green-100 text-green-700',
    failed:       'bg-red-100 text-red-700',
    draft:        'bg-gray-100 text-gray-600',
    published:    'bg-green-100 text-green-700',
    approved:     'bg-blue-100 text-blue-700',
    rejected:     'bg-red-100 text-red-700',
    sent:         'bg-green-100 text-green-700',
    admin:        'bg-purple-100 text-purple-700',
    doctor:       'bg-teal-100 text-teal-700',
    patient:      'bg-blue-100 text-blue-700',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}
