import { useState, useEffect } from 'react'
import { BookmarkIcon } from 'lucide-react'
import { jobsAPI } from '../services/api'
import JobCard from '../components/JobCard'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'

export default function SavedJobs() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    jobsAPI.savedList()
      .then(r => setJobs(r.data))
      .finally(() => setLoading(false))
  }, [user])

  const handleRemove = (jobId) => {
    setJobs(j => j.filter(x => x.id !== jobId))
  }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <BookmarkIcon className="w-16 h-16 text-gray-200 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Sign in to see saved jobs</h2>
        <Link to="/login" className="btn-primary mt-4 inline-block">Sign In</Link>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <BookmarkIcon className="w-6 h-6 text-brand-600" />Saved Jobs
        {jobs.length > 0 && <span className="badge bg-brand-100 text-brand-700">{jobs.length}</span>}
      </h1>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="card p-5 animate-pulse h-40" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20">
          <BookmarkIcon className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No saved jobs yet</h3>
          <p className="text-gray-500 text-sm mb-4">Save jobs while browsing to find them here</p>
          <Link to="/" className="btn-primary">Browse Jobs</Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onSaveToggle={(id, saved) => !saved && handleRemove(id)} />
          ))}
        </div>
      )}
    </div>
  )
}
