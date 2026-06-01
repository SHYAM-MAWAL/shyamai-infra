import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  const pages = []
  const delta = 2
  for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
    pages.push(i)
  }

  return (
    <div className="flex items-center justify-center gap-1 py-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeftIcon className="w-4 h-4" />
      </button>

      {pages[0] > 1 && (
        <>
          <PageBtn n={1} current={page} onClick={onPageChange} />
          {pages[0] > 2 && <span className="px-1 text-gray-400">…</span>}
        </>
      )}

      {pages.map(n => <PageBtn key={n} n={n} current={page} onClick={onPageChange} />)}

      {pages[pages.length - 1] < totalPages && (
        <>
          {pages[pages.length - 1] < totalPages - 1 && <span className="px-1 text-gray-400">…</span>}
          <PageBtn n={totalPages} current={page} onClick={onPageChange} />
        </>
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRightIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

function PageBtn({ n, current, onClick }) {
  return (
    <button
      onClick={() => onClick(n)}
      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
        n === current
          ? 'bg-brand-600 text-white'
          : 'border border-gray-200 hover:bg-gray-100 text-gray-700'
      }`}
    >
      {n}
    </button>
  )
}
