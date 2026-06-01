import { useState, useEffect } from 'react'
import {
  BriefcaseIcon, UsersIcon, TrendingUpIcon, PlayCircleIcon,
  RefreshCwIcon, CheckCircleIcon, XCircleIcon, ClockIcon, DatabaseIcon
} from 'lucide-react'
import { adminAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const SOURCES = [
  { id: 'free',  label: 'Free (Daily)',  emoji: '🆓', desc: 'Adzuna + RemoteOK + Remotive' },
  { id: 'apify', label: 'Apify',         emoji: '💳', desc: 'LinkedIn/Indeed/Naukri (uses credits)' },
]

export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [collecting, setCollecting] = useState(false)
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/'); return }
    fetchStats()
  }, [user])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const { data } = await adminAPI.stats()
      setStats(data)
    } catch {
      toast.error('Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  const triggerCollect = async (source) => {
    setCollecting(true)
    try {
      await adminAPI.collectJobs(source)
      toast.success(`Job collection started for: ${source}`)
      setTimeout(fetchStats, 3000)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to trigger collection')
    } finally {
      setCollecting(false)
    }
  }

  const expireOld = async () => {
    try {
      const { data } = await adminAPI.expireOld()
      toast.success(`${data.expired} jobs marked as expired`)
      fetchStats()
    } catch {
      toast.error('Failed')
    }
  }

  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => <div key={i} className="card p-6 h-24 bg-gray-200" />)}
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">ShyamAI Jobs Control Panel</p>
        </div>
        <button onClick={fetchStats} className="flex items-center gap-2 btn-outline text-sm">
          <RefreshCwIcon className="w-4 h-4" />Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<BriefcaseIcon className="w-5 h-5 text-brand-600" />}
          label="Total Jobs" value={stats?.total_jobs?.toLocaleString()} color="brand" />
        <StatCard icon={<CheckCircleIcon className="w-5 h-5 text-emerald-600" />}
          label="Active Jobs" value={stats?.active_jobs?.toLocaleString()} color="emerald" />
        <StatCard icon={<TrendingUpIcon className="w-5 h-5 text-violet-600" />}
          label="Added Today" value={stats?.jobs_today} color="violet" />
        <StatCard icon={<DatabaseIcon className="w-5 h-5 text-amber-600" />}
          label="This Week" value={stats?.jobs_this_week} color="amber" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit mb-6">
        {['overview', 'collect', 'runs'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && stats && (
        <div className="grid md:grid-cols-3 gap-4">
          <ChartCard title="By City" data={stats.by_city} color="bg-brand-500" />
          <ChartCard title="By Category" data={stats.by_category} color="bg-emerald-500" />
          <ChartCard title="By Source" data={stats.by_source} color="bg-violet-500" />
        </div>
      )}

      {/* Collect tab */}
      {tab === 'collect' && (
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Trigger Job Collection</h3>
          <p className="text-sm text-gray-500 mb-6">
            Runs are automatically scheduled every 6 hours. Manually trigger to collect now.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {SOURCES.map(src => (
              <button key={src.id} onClick={() => triggerCollect(src.id)} disabled={collecting}
                className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 transition-all text-left ${
                  src.id === 'free'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                } disabled:opacity-50`}>
                <span className="text-2xl">{src.emoji}</span>
                <span className="text-sm font-semibold">{src.label}</span>
                <span className="text-xs opacity-70">{src.desc}</span>
              </button>
            ))}
          </div>
          {collecting && (
            <div className="flex items-center gap-2 text-sm text-brand-600 bg-brand-50 px-4 py-3 rounded-lg">
              <RefreshCwIcon className="w-4 h-4 animate-spin" />
              Collection started — check Runs tab for progress
            </div>
          )}

          <hr className="my-6" />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Expire Old Jobs</p>
              <p className="text-xs text-gray-500">Mark jobs older than 60 days as expired</p>
            </div>
            <button onClick={expireOld} className="btn-outline text-sm text-red-600 border-red-200 hover:bg-red-50">
              Run Expiry
            </button>
          </div>
        </div>
      )}

      {/* Runs tab */}
      {tab === 'runs' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Query</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">New</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Dupes</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Started</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recent_runs?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-400">No runs yet</td>
                  </tr>
                )}
                {stats?.recent_runs?.map((run) => (
                  <tr key={run.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium capitalize">{run.source || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{run.search_query || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">{run.jobs_new}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{run.jobs_duplicate}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {format(new Date(run.started_at), 'dd MMM HH:mm')}
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

function StatCard({ icon, label, value, color }) {
  const colors = {
    brand: 'bg-brand-50',
    emerald: 'bg-emerald-50',
    violet: 'bg-violet-50',
    amber: 'bg-amber-50',
  }
  return (
    <div className={`card p-5 ${colors[color]}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 bg-white rounded-lg shadow-sm">{icon}</div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  )
}

function ChartCard({ title, data, color }) {
  const entries = Object.entries(data || {}).slice(0, 8)
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="space-y-2">
        {entries.map(([label, count]) => (
          <div key={label}>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span className="truncate pr-2">{label}</span>
              <span className="font-medium">{count}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${color} rounded-full`} style={{ width: `${(count / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {entries.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No data yet</p>}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const styles = {
    completed: 'bg-emerald-100 text-emerald-700',
    running: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
    started: 'bg-amber-100 text-amber-700',
  }
  const icons = {
    completed: <CheckCircleIcon className="w-3 h-3" />,
    running: <RefreshCwIcon className="w-3 h-3 animate-spin" />,
    failed: <XCircleIcon className="w-3 h-3" />,
    started: <ClockIcon className="w-3 h-3" />,
  }
  return (
    <span className={`inline-flex items-center gap-1 badge ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {icons[status]}{status}
    </span>
  )
}
