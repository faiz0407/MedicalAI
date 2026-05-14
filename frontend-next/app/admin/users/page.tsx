'use client'
import { useState, useEffect } from 'react'
import { Users, Search, Loader2, Shield, User, Stethoscope, AlertCircle } from 'lucide-react'
import { adminApi } from '@/lib/api'
import { badgeColor, formatDate, cn } from '@/lib/utils'
import type { User as UserType } from '@/types'

const ROLES = ['all', 'patient', 'doctor', 'admin']

export default function UsersPage() {
  const [users, setUsers]     = useState<UserType[]>([])
  const [role, setRole]       = useState('all')
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    adminApi.users(role === 'all' ? undefined : role)
      .then(({ data }) => setUsers(data.users || []))
      .catch((err) => {
        const msg = err?.response?.data?.detail || 'Failed to load users'
        setError(msg)
        setUsers([])
      })
      .finally(() => setLoading(false))
  }, [role])

  const filtered = users.filter(u =>
    search === '' ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const RoleIcon = ({ role }: { role: string }) => {
    if (role === 'admin')  return <Shield className="w-4 h-4 text-purple-500" />
    if (role === 'doctor') return <Stethoscope className="w-4 h-4 text-teal-500" />
    return <User className="w-4 h-4 text-[#FF8CA0]" />
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-500 text-sm mt-0.5">Patients, doctors, and administrators — live from PostgreSQL</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by username, name, or email"
            className="input-field pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {ROLES.map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize',
                role === r
                  ? 'bg-[#FF8CA0] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-[#FF8CA0]'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-[#FF8CA0]" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 text-xs text-gray-400">
            {filtered.length} user{filtered.length !== 1 ? 's' : ''} found
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['User', 'Email', 'Age / Gender', 'Role', 'Joined'].map(h => (
                    <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      No users found
                    </td>
                  </tr>
                ) : filtered.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0',
                          u.role === 'admin'  ? 'bg-purple-500' :
                          u.role === 'doctor' ? 'bg-teal-500'   : 'bg-[#FF8CA0]'
                        )}>
                          {(u.full_name || u.username)[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{u.full_name || u.username}</p>
                          <p className="text-xs text-gray-400">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{u.email}</td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {u.age ? `${u.age} yrs` : '—'}
                      {u.gender ? ` · ${u.gender}` : ''}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium',
                        badgeColor(u.role)
                      )}>
                        <RoleIcon role={u.role} />
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {u.created_at ? formatDate(u.created_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
