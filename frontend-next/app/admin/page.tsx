'use client'
import { useState, useEffect } from 'react'
import {
  Users, Calendar, Star, FileText, Bell,
  TrendingUp, AlertTriangle, Loader2, Activity, Stethoscope,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts'
import { analyticsApi } from '@/lib/api'
import type { DashboardMetrics } from '@/types'
import { cn } from '@/lib/utils'

export default function AdminOverviewPage() {
  const [metrics, setMetrics]       = useState<DashboardMetrics | null>(null)
  const [activity, setActivity]     = useState<any[]>([])
  const [symptoms, setSymptoms]     = useState<any[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      const [metricsRes, activityRes, symptomsRes] = await Promise.allSettled([
        analyticsApi.dashboard(),
        analyticsApi.activityTrend(7),
        analyticsApi.symptomTrends(30),
      ])

      if (metricsRes.status === 'fulfilled') {
        setMetrics(metricsRes.value.data)
      } else {
        // Only show zeros on failure — no fake numbers
        setMetrics({
          total_patients: 0, total_doctors: 0, total_appointments: 0,
          appointments_today: 0, booking_conversion: 0,
          high_risk_reviews_total: 0, pending_content_items: 0,
        })
      }

      if (activityRes.status === 'fulfilled') {
        setActivity(activityRes.value.data.activity || [])
      }

      if (symptomsRes.status === 'fulfilled') {
        setSymptoms(symptomsRes.value.data.top_symptoms || [])
      }

      setLoading(false)
    }
    loadAll()
  }, [])

  const STAT_CARDS = [
    { icon: Users,         label: 'Total Patients',       value: metrics?.total_patients,                                      color: 'text-blue-600 bg-blue-50'     },
    { icon: Stethoscope,   label: 'Total Doctors',        value: metrics?.total_doctors,                                       color: 'text-teal-600 bg-teal-50'     },
    { icon: Calendar,      label: 'Total Appointments',   value: metrics?.total_appointments,                                  color: 'text-indigo-600 bg-indigo-50' },
    { icon: Calendar,      label: "Today's Appointments", value: metrics?.appointments_today,                                  color: 'text-sky-600 bg-sky-50'       },
    { icon: TrendingUp,    label: 'Booking Conversion',   value: `${((metrics?.booking_conversion || 0) * 100).toFixed(0)}%`, color: 'text-green-600 bg-green-50'   },
    { icon: AlertTriangle, label: 'High-Risk Reviews',    value: metrics?.high_risk_reviews_total,                             color: 'text-red-600 bg-red-50'       },
    { icon: FileText,      label: 'Pending Content',      value: metrics?.pending_content_items,                               color: 'text-purple-600 bg-purple-50' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Overview</h1>
        <p className="text-gray-500 text-sm mt-0.5">Platform analytics and management dashboard</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-[#FF8CA0]" />
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-8">
            {STAT_CARDS.map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="medical-card">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mb-0.5">
                  {value ?? '—'}
                </p>
                <p className="text-xs text-gray-400 leading-snug">{label}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

            {/* Appointments + Registrations trend */}
            <div className="medical-card">
              <div className="flex items-center gap-2 mb-6">
                <Activity className="w-5 h-5 text-[#FF8CA0]" />
                <h2 className="font-bold text-gray-900">Activity (7 days)</h2>
              </div>
              {activity.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                  No activity data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={activity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="appointments"  stroke="#0d9488" fill="#0d9488" fillOpacity={0.15} name="Appointments" />
                    <Area type="monotone" dataKey="registrations" stroke="#FF8CA0" fill="#FF8CA0" fillOpacity={0.15} name="New users" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Top Symptoms from DB */}
            <div className="medical-card">
              <div className="flex items-center gap-2 mb-6">
                <Bell className="w-5 h-5 text-teal-500" />
                <h2 className="font-bold text-gray-900">Top Symptoms (30 days)</h2>
              </div>
              {symptoms.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                  No symptom reports yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={symptoms} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="symptom" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#FF8CA0" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="medical-card">
            <h2 className="font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { href: '/admin/reviews',      icon: Star,     label: 'Manage Reviews',     color: 'hover:bg-yellow-50 hover:border-yellow-300' },
                { href: '/admin/blog',          icon: FileText, label: 'Approve Content',    color: 'hover:bg-[#FF8CA0]/5 hover:border-[#FF8CA0]/40' },
                { href: '/admin/notifications', icon: Bell,     label: 'Send Notifications', color: 'hover:bg-teal-50 hover:border-teal-300' },
                { href: '/admin/users',         icon: Users,    label: 'Manage Users',       color: 'hover:bg-purple-50 hover:border-purple-300' },
              ].map(({ href, icon: Icon, label, color }) => (
                <a
                  key={href}
                  href={href}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 transition-all text-center hover:shadow-sm',
                    color,
                  )}
                >
                  <Icon className="w-6 h-6 text-gray-400" />
                  <span className="text-sm font-medium text-gray-600">{label}</span>
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
