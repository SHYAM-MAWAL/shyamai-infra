import { useState, useEffect, useCallback } from 'react'
import { SearchIcon, BriefcaseIcon, MapPinIcon, TrendingUpIcon, RefreshCwIcon } from 'lucide-react'
import { jobsAPI } from '../services/api'
import JobCard from '../components/JobCard'
import FilterPanel from '../components/FilterPanel'
import Pagination from '../components/Pagination'

const STATS = [
  { label: 'Jobs in Pune', icon: '🏙️' },
  { label: 'Jobs in Mumbai', icon: '🌆' },
  { label: 'IT Companies', icon: '💼' },
  { label: 'Updated Every 6hrs', icon: '🔄' },
]

export default function Home() {
  const [jobs, setJobs] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ page: 1, per_page: 20 })
  const [search, setSearch] = useState('')

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const params = { ...filters }
      if (search) params.keyword = search
      const { data } = await jobsAPI.list(params)
      setJobs(data.jobs)
      setTotal(data.total)
      setTotalPages(data.total_pages)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filters, search])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const handleSearch = (e) => {
    e.preventDefault()
    setFilters(f => ({ ...f, page: 1 }))
  }

  const handleReset = () => {
    setFilters({ page: 1, per_page: 20 })
    setSearch('')
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm mb-4">
            <TrendingUpIcon className="w-3.5 h-3.5" />
            AI-Powered Job Search for India
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold mb-3 leading-tight">
            Find Your Next IT Job
            <span className="block text-brand-200 mt-1">in Pune, Mumbai & Beyond</span>
          </h1>
          <p className="text-brand-100 mb-8 text-lg max-w-2xl mx-auto">
            Real jobs from LinkedIn, Indeed, Naukri — updated automatically every 6 hours
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex gap-2 max-w-2xl mx-auto">
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Job title, skill, or company..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border-0 text-gray-900 placeholder-gray-400 shadow-lg focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
              />
            </div>
            <button type="submit" className="bg-white text-brand-700 font-semibold px-6 py-3 rounded-xl hover:bg-brand-50 transition-colors shadow-lg text-sm whitespace-nowrap">
              Search
            </button>
          </form>

          {/* Quick filters */}
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {['Pune', 'Mumbai', 'Remote', 'Hyderabad', 'Bangalore'].map(loc => (
              <button
                key={loc}
                onClick={() => setFilters(f => ({ ...f, location: f.location === loc ? '' : loc, page: 1 }))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filters.location === loc
                    ? 'bg-white text-brand-700'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                <MapPinIcon className="w-3 h-3 inline mr-1" />{loc}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Filters sidebar */}
          <FilterPanel filters={filters} onChange={setFilters} onReset={handleReset} />

          {/* Jobs list */}
          <div className="flex-1 min-w-0">
            {/* Results header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-900 font-semibold">
                  {loading ? 'Loading...' : `${total.toLocaleString()} Jobs Found`}
                </p>
                {(search || Object.values(filters).some((v, i) => !['page', 'per_page'].includes(Object.keys(filters)[i]) && v)) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {search && `"${search}"`}
                    {filters.location && ` · ${filters.location}`}
                    {filters.category && ` · ${filters.category}`}
                  </p>
                )}
              </div>
              <button onClick={fetchJobs} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
                <RefreshCwIcon className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Jobs grid */}
            {loading ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {Array(8).fill(0).map((_, i) => (
                  <div key={i} className="card p-5 animate-pulse">
                    <div className="flex gap-3">
                      <div className="w-11 h-11 bg-gray-200 rounded-lg" />
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <div className="h-5 bg-gray-200 rounded-full w-16" />
                      <div className="h-5 bg-gray-200 rounded-full w-14" />
                    </div>
                    <div className="h-3 bg-gray-200 rounded w-full mt-3" />
                  </div>
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-20">
                <BriefcaseIcon className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No jobs found</h3>
                <p className="text-gray-500 text-sm mb-4">Try different keywords or reset filters</p>
                <button onClick={handleReset} className="btn-primary">Reset Filters</button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {jobs.map(job => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            )}

            <Pagination
              page={filters.page}
              totalPages={totalPages}
              onPageChange={p => setFilters(f => ({ ...f, page: p }))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
