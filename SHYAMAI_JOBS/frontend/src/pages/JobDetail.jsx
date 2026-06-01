import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  MapPinIcon, BriefcaseIcon, ClockIcon, IndianRupeeIcon,
  ExternalLinkIcon, ArrowLeftIcon, BookmarkIcon, BuildingIcon,
  CalendarIcon, ShareIcon
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { jobsAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const SOURCE_LOGO = {
  linkedin: '🔗',
  indeed: '📋',
  naukri: '🎯',
  foundit: '🔍',
}

export default function JobDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    jobsAPI.get(id).then(r => setJob(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const handleSave = async () => {
    if (!user) { toast.error('Login to save jobs'); return }
    setSaving(true)
    try {
      const { data } = await jobsAPI.save(job.id)
      toast.success(data.saved ? 'Job saved!' : 'Job removed')
    } finally { setSaving(false) }
  }

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Link copied!')
  }

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="card p-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-2/3 mb-4" />
        <div className="h-5 bg-gray-200 rounded w-1/3 mb-6" />
        <div className="space-y-3">
          {Array(6).fill(0).map((_, i) => <div key={i} className="h-4 bg-gray-200 rounded" />)}
        </div>
      </div>
    </div>
  )

  if (!job) return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Job not found</h2>
      <Link to="/" className="btn-primary mt-4 inline-block">Browse Jobs</Link>
    </div>
  )

  const salary = job.salary_text || (job.salary_min && `${job.salary_min}${job.salary_max ? `–${job.salary_max}` : '+'} LPA`)

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors">
        <ArrowLeftIcon className="w-4 h-4" />Back to Jobs
      </Link>

      <div className="card p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center flex-shrink-0 text-2xl">
              {SOURCE_LOGO[job.source] || '💼'}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
              <p className="text-lg text-gray-600 font-medium mt-1 flex items-center gap-1.5">
                <BuildingIcon className="w-4 h-4" />{job.company_name}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={handleShare} className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
              <ShareIcon className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={handleSave} disabled={saving} className="p-2.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
              <BookmarkIcon className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Key info pills */}
        <div className="flex flex-wrap gap-2 mt-5">
          {job.city && (
            <InfoPill icon={<MapPinIcon className="w-3.5 h-3.5" />} label={job.location || job.city} />
          )}
          {job.work_type && (
            <InfoPill icon={<BriefcaseIcon className="w-3.5 h-3.5" />} label={job.work_type} />
          )}
          {job.job_type && (
            <InfoPill icon={<ClockIcon className="w-3.5 h-3.5" />} label={job.job_type} />
          )}
          {salary && (
            <InfoPill icon={<IndianRupeeIcon className="w-3.5 h-3.5" />} label={salary} />
          )}
          {(job.experience_min != null || job.experience_max != null) && (
            <InfoPill
              icon={<span className="text-xs font-bold">EXP</span>}
              label={`${job.experience_min ?? 0}${job.experience_max ? `–${job.experience_max}` : '+'} yrs`}
            />
          )}
          {job.posted_date && (
            <InfoPill
              icon={<CalendarIcon className="w-3.5 h-3.5" />}
              label={`Posted ${formatDistanceToNow(new Date(job.posted_date), { addSuffix: true })}`}
            />
          )}
        </div>

        {/* Skills */}
        {job.skills?.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Skills Required</h3>
            <div className="flex flex-wrap gap-2">
              {job.skills.map(s => (
                <span key={s} className="badge bg-blue-50 text-blue-700 text-sm px-3 py-1">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Apply button */}
        {job.source_url && (
          <div className="mt-6">
            <a
              href={job.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2 text-base px-6 py-3"
            >
              Apply on {job.source ? job.source.charAt(0).toUpperCase() + job.source.slice(1) : 'Job Site'}
              <ExternalLinkIcon className="w-4 h-4" />
            </a>
          </div>
        )}

        <hr className="my-6 border-gray-100" />

        {/* Description */}
        {job.description && (
          <div className="prose prose-sm max-w-none">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Job Description</h2>
            <div
              className="text-gray-700 leading-relaxed whitespace-pre-wrap text-sm"
              dangerouslySetInnerHTML={{ __html: job.description.replace(/\n/g, '<br/>') }}
            />
          </div>
        )}

        {/* Requirements */}
        {job.requirements && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Requirements</h2>
            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">
              {job.requirements}
            </div>
          </div>
        )}

        {/* Source footer */}
        <div className="mt-8 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>Source: <span className="capitalize font-medium text-gray-500">{job.source || 'unknown'}</span></span>
          <span>Last updated: {format(new Date(job.updated_at || job.created_at), 'dd MMM yyyy')}</span>
        </div>
      </div>
    </div>
  )
}

function InfoPill({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-sm font-medium">
      {icon}{label}
    </span>
  )
}
