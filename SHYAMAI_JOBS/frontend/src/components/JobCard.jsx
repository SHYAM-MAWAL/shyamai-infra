import { Link, useNavigate } from 'react-router-dom'
import {
  MapPinIcon, BriefcaseIcon, ClockIcon, IndianRupeeIcon,
  BookmarkIcon, ExternalLinkIcon, BuildingIcon, LockIcon
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { jobsAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const SOURCE_COLORS = {
  linkedin: 'bg-blue-100 text-blue-700',
  indeed: 'bg-orange-100 text-orange-700',
  naukri: 'bg-green-100 text-green-700',
  foundit: 'bg-purple-100 text-purple-700',
}

const WORK_TYPE_COLORS = {
  remote: 'bg-emerald-100 text-emerald-700',
  hybrid: 'bg-amber-100 text-amber-700',
  'on-site': 'bg-gray-100 text-gray-600',
}

export default function JobCard({ job, onSaveToggle }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  const handleApply = (e) => {
    e.preventDefault()
    if (!user) { navigate('/login'); return }
    if (job.source_url) window.open(job.source_url, '_blank', 'noopener,noreferrer')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!user) { toast.error('Login to save jobs'); return }
    setSaving(true)
    try {
      const { data } = await jobsAPI.save(job.id)
      toast.success(data.saved ? 'Job saved!' : 'Job removed')
      onSaveToggle?.(job.id, data.saved)
    } catch {
      toast.error('Failed to save job')
    } finally {
      setSaving(false)
    }
  }

  const salaryText = job.salary_text ||
    (job.salary_min && job.salary_max ? `${job.salary_min}–${job.salary_max} LPA` :
     job.salary_min ? `${job.salary_min}+ LPA` : null)

  const postedAgo = job.posted_date
    ? formatDistanceToNow(new Date(job.posted_date), { addSuffix: true })
    : formatDistanceToNow(new Date(job.created_at), { addSuffix: true })

  return (
    <Link to={`/jobs/${job.id}`} className="block">
      <div className="card p-5 group cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          {/* Company Logo placeholder */}
          <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center flex-shrink-0">
            <BuildingIcon className="w-5 h-5 text-brand-600" />
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-brand-600"
          >
            <BookmarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3">
          <h3 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors line-clamp-1">
            {job.title}
          </h3>
          <p className="text-sm text-gray-600 mt-0.5 font-medium">{job.company_name}</p>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {job.city && (
            <span className="badge bg-gray-100 text-gray-600 gap-1">
              <MapPinIcon className="w-3 h-3" />{job.city}
            </span>
          )}
          {job.work_type && (
            <span className={`badge ${WORK_TYPE_COLORS[job.work_type] || 'bg-gray-100 text-gray-600'}`}>
              {job.work_type}
            </span>
          )}
          {job.job_type && job.job_type !== 'full-time' && (
            <span className="badge bg-violet-100 text-violet-700">
              {job.job_type}
            </span>
          )}
          {job.source && (
            <span className={`badge ${SOURCE_COLORS[job.source] || 'bg-gray-100 text-gray-600'}`}>
              {job.source}
            </span>
          )}
        </div>

        {/* Skills */}
        {job.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {job.skills.slice(0, 4).map((skill) => (
              <span key={skill} className="badge bg-blue-50 text-blue-700">{skill}</span>
            ))}
            {job.skills.length > 4 && (
              <span className="badge bg-gray-100 text-gray-500">+{job.skills.length - 4}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {job.experience_min != null && (
              <span className="flex items-center gap-1">
                <BriefcaseIcon className="w-3 h-3" />
                {job.experience_min}{job.experience_max ? `–${job.experience_max}` : '+'} yrs
              </span>
            )}
            {salaryText && (
              <span className="flex items-center gap-1">
                <IndianRupeeIcon className="w-3 h-3" />{salaryText}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <ClockIcon className="w-3 h-3" />{postedAgo}
            </span>
            {job.source_url && (
              <button
                onClick={handleApply}
                title={user ? 'Apply for this job' : 'Sign in to apply'}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                  user
                    ? 'text-brand-600 bg-brand-50 hover:bg-brand-100'
                    : 'text-gray-400 bg-gray-100'
                }`}
              >
                {!user && <LockIcon className="w-3 h-3" />}
                Apply
                <ExternalLinkIcon className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
