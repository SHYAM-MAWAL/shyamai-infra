import { useState } from 'react'
import { XIcon, SlidersHorizontalIcon } from 'lucide-react'

const CITIES = ['Pune', 'Mumbai', 'Hyderabad', 'Bangalore', 'Delhi', 'Noida', 'Gurgaon', 'Chennai']
const CATEGORIES = [
  'Software Engineer', 'Java Developer', 'Python Developer', 'Full Stack Developer',
  'Backend Developer', 'Frontend Developer', 'DevOps Engineer', 'Cloud Engineer',
  'Data Engineer', 'Data Analyst', 'AI/ML Engineer', 'Database Administrator',
  'System Administrator', 'QA Engineer',
]
const SOURCES = ['linkedin', 'indeed', 'naukri', 'foundit']
const WORK_TYPES = ['on-site', 'hybrid', 'remote']
const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship']

export default function FilterPanel({ filters, onChange, onReset }) {
  const [open, setOpen] = useState(false)

  const set = (key, val) => onChange({ ...filters, [key]: val, page: 1 })

  const hasFilters = Object.entries(filters).some(
    ([k, v]) => !['page', 'per_page', 'keyword'].includes(k) && v
  )

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden flex items-center gap-2 btn-outline"
      >
        <SlidersHorizontalIcon className="w-4 h-4" />
        Filters{hasFilters && <span className="bg-brand-600 text-white text-xs rounded-full px-1.5">!</span>}
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Panel */}
      <aside className={`
        fixed md:sticky md:top-20 z-50 md:z-auto
        inset-y-0 left-0 w-72 md:w-64 lg:w-72
        bg-white md:bg-transparent
        overflow-y-auto md:overflow-visible
        p-4 md:p-0
        transform transition-transform duration-200
        ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="md:card md:p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <SlidersHorizontalIcon className="w-4 h-4" />Filters
            </h3>
            <div className="flex items-center gap-2">
              {hasFilters && (
                <button onClick={onReset} className="text-xs text-brand-600 hover:underline">
                  Reset
                </button>
              )}
              <button onClick={() => setOpen(false)} className="md:hidden p-1 hover:bg-gray-100 rounded">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <FilterSection title="Location">
            <select className="input text-sm" value={filters.location || ''} onChange={e => set('location', e.target.value)}>
              <option value="">All Cities</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FilterSection>

          <FilterSection title="Category">
            <select className="input text-sm" value={filters.category || ''} onChange={e => set('category', e.target.value)}>
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FilterSection>

          <FilterSection title="Work Type">
            <div className="flex flex-wrap gap-2">
              {WORK_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => set('work_type', filters.work_type === t ? '' : t)}
                  className={`badge cursor-pointer transition-colors ${
                    filters.work_type === t ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Job Type">
            <div className="flex flex-wrap gap-2">
              {JOB_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => set('job_type', filters.job_type === t ? '' : t)}
                  className={`badge cursor-pointer transition-colors ${
                    filters.job_type === t ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Experience (Years)">
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="20" placeholder="Min"
                className="input text-sm w-20"
                value={filters.experience_min || ''}
                onChange={e => set('experience_min', e.target.value || undefined)} />
              <span className="text-gray-400">–</span>
              <input type="number" min="0" max="30" placeholder="Max"
                className="input text-sm w-20"
                value={filters.experience_max || ''}
                onChange={e => set('experience_max', e.target.value || undefined)} />
            </div>
          </FilterSection>

          <FilterSection title="Salary (LPA)">
            <div className="flex items-center gap-2">
              <input type="number" min="0" placeholder="Min"
                className="input text-sm w-20"
                value={filters.salary_min || ''}
                onChange={e => set('salary_min', e.target.value || undefined)} />
              <span className="text-gray-400">–</span>
              <input type="number" min="0" placeholder="Max"
                className="input text-sm w-20"
                value={filters.salary_max || ''}
                onChange={e => set('salary_max', e.target.value || undefined)} />
            </div>
          </FilterSection>

          <FilterSection title="Source">
            <div className="flex flex-wrap gap-2">
              {SOURCES.map(s => (
                <button
                  key={s}
                  onClick={() => set('source', filters.source === s ? '' : s)}
                  className={`badge capitalize cursor-pointer transition-colors ${
                    filters.source === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </FilterSection>
        </div>
      </aside>
    </>
  )
}

function FilterSection({ title, children }) {
  return (
    <div className="mb-4 pb-4 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</label>
      {children}
    </div>
  )
}
