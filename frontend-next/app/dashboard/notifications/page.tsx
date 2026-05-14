'use client'
import { Bell, Info, AlertTriangle, CheckCircle } from 'lucide-react'

// Patient receives notifications from admin campaigns
// In MVP these are fetched from the notification_logs table
// For now showing a placeholder UI

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    type: 'treatment',
    title: 'New Treatment Available for Diabetes',
    body: 'A new insulin therapy has shown excellent results for Type 2 Diabetes patients. Consult your doctor for details.',
    date: '2026-02-28',
    read: false,
  },
  {
    id: 2,
    type: 'reminder',
    title: 'Appointment Reminder',
    body: 'Your appointment with Dr. Sarah Johnson is scheduled for tomorrow at 10:00 AM.',
    date: '2026-02-27',
    read: true,
  },
  {
    id: 3,
    type: 'info',
    title: 'Health Tip: Preventive Screening',
    body: 'Annual health check-ups can catch conditions early. Book your screening today.',
    date: '2026-02-25',
    read: true,
  },
]

const typeConfig = {
  treatment: { icon: CheckCircle, color: 'text-teal-600 bg-teal-50', dot: 'bg-teal-500' },
  reminder:  { icon: Bell,        color: 'text-[#c0566d] bg-[#FF8CA0]/10', dot: 'bg-[#FF8CA0]' },
  info:      { icon: Info,        color: 'text-purple-600 bg-purple-50', dot: 'bg-purple-500' },
  alert:     { icon: AlertTriangle, color: 'text-red-600 bg-red-50', dot: 'bg-red-500' },
}

export default function NotificationsPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-500 text-sm mt-0.5">Health updates, reminders, and alerts</p>
        </div>

        <div className="space-y-3">
          {MOCK_NOTIFICATIONS.map((notif) => {
            const config = typeConfig[notif.type as keyof typeof typeConfig] || typeConfig.info
            const Icon = config.icon
            return (
              <div
                key={notif.id}
                className={`medical-card flex gap-4 ${!notif.read ? 'border-l-4 border-l-[#FF8CA0]' : ''}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className={`font-semibold text-sm ${!notif.read ? 'text-gray-900' : 'text-gray-600'}`}>
                      {notif.title}
                    </h3>
                    {!notif.read && (
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${config.dot}`} />
                    )}
                  </div>
                  <p className="text-gray-500 text-sm leading-relaxed">{notif.body}</p>
                  <p className="text-gray-400 text-xs mt-2">{notif.date}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
