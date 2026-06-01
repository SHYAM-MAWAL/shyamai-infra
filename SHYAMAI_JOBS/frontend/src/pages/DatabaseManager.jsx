import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DatabaseIcon, TableIcon, PlayIcon, RefreshCwIcon,
  PencilIcon, Trash2Icon, XIcon, CheckIcon, ChevronLeftIcon,
  ChevronRightIcon, CopyIcon, AlertTriangleIcon, TerminalIcon,
  UsersIcon, BookmarkIcon, ShieldIcon, ShieldOffIcon
} from 'lucide-react'
import { dbAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v) => {
  if (v === null || v === undefined) return <span className="text-gray-300 italic text-xs">null</span>
  if (typeof v === 'boolean') return <span className={v ? 'text-emerald-600' : 'text-red-400'}>{String(v)}</span>
  const s = String(v)
  if (s.length > 80) return <span title={s} className="cursor-help">{s.slice(0, 80)}…</span>
  return s
}

const fmtBytes = (b) => {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}


// ─── Edit Row Modal ───────────────────────────────────────────────────────────

function EditModal({ row, columns, pk, onSave, onClose }) {
  const [form, setForm] = useState({ ...row })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <PencilIcon className="w-4 h-4 text-brand-600" />
            Edit Row — <span className="font-mono text-sm text-gray-500">{String(row[pk]).slice(0, 24)}</span>
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><XIcon className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3 flex-1">
          {columns.map(col => (
            <div key={col.name}>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                {col.name}
                <span className="ml-1 font-normal text-gray-400">({col.type})</span>
                {col.name === pk && <span className="ml-1 text-brand-500">PK</span>}
              </label>
              <input
                className="input font-mono text-sm"
                disabled={col.name === pk}
                value={form[col.name] === null ? '' : String(form[col.name] ?? '')}
                onChange={e => setForm(f => ({ ...f, [col.name]: e.target.value || null }))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="btn-outline">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-1.5">
            <CheckIcon className="w-4 h-4" />{saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Table View ───────────────────────────────────────────────────────────────

function TableView({ tableName, onBack }) {
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [editRow, setEditRow] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const load = async (p = page) => {
    setLoading(true)
    try {
      const { data: d } = await dbAPI.tableData(tableName, p, 50)
      setData(d)
    } catch (e) {
      toast.error('Failed to load table')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(1); setPage(1) }, [tableName])

  const handlePageChange = (p) => { setPage(p); load(p) }

  const handleSave = async (form) => {
    await dbAPI.updateRow(tableName, form[data.primary_key], form)
    toast.success('Row updated')
    load(page)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this row?')) return
    setDeletingId(id)
    try {
      await dbAPI.deleteRow(tableName, id)
      toast.success('Row deleted')
      load(page)
    } catch {
      toast.error('Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading && !data) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <RefreshCwIcon className="w-5 h-5 animate-spin mr-2" />Loading…
    </div>
  )

  if (!data) return null

  const { columns, rows, total, total_pages, primary_key: pk } = data

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-semibold text-gray-900 font-mono">{tableName}</h2>
            <p className="text-xs text-gray-500">{total.toLocaleString()} rows · {columns.length} columns</p>
          </div>
        </div>
        <button onClick={() => load(page)} className="p-2 hover:bg-gray-100 rounded-lg">
          <RefreshCwIcon className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 border-b w-16">Actions</th>
              {columns.map(col => (
                <th key={col.name}
                  className="px-3 py-2 text-left font-semibold text-gray-600 border-b whitespace-nowrap">
                  {col.name}
                  {col.name === pk && <span className="ml-1 text-brand-400 text-[10px]">PK</span>}
                  <div className="font-normal text-gray-400 text-[10px]">{col.type}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-blue-50 border-b border-gray-50 group">
                <td className="px-2 py-1.5">
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditRow(row)}
                      className="p-1 hover:bg-brand-100 rounded text-brand-600">
                      <PencilIcon className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDelete(row[pk])}
                      disabled={deletingId === row[pk]}
                      className="p-1 hover:bg-red-100 rounded text-red-500">
                      <Trash2Icon className="w-3 h-3" />
                    </button>
                  </div>
                </td>
                {columns.map(col => (
                  <td key={col.name} className="px-3 py-1.5 font-mono max-w-xs truncate">
                    {fmt(row[col.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">No rows</div>
        )}
      </div>

      {/* Pagination */}
      {total_pages > 1 && (
        <div className="flex items-center justify-between mt-3 flex-shrink-0">
          <span className="text-xs text-gray-500">
            Page {page} of {total_pages} ({total.toLocaleString()} total)
          </span>
          <div className="flex gap-1">
            <button onClick={() => handlePageChange(page - 1)} disabled={page === 1}
              className="px-2 py-1 rounded border text-xs disabled:opacity-40 hover:bg-gray-100">
              ←
            </button>
            {[...Array(Math.min(5, total_pages))].map((_, i) => {
              const p = Math.max(1, page - 2) + i
              if (p > total_pages) return null
              return (
                <button key={p} onClick={() => handlePageChange(p)}
                  className={`px-2 py-1 rounded border text-xs ${p === page ? 'bg-brand-600 text-white border-brand-600' : 'hover:bg-gray-100'}`}>
                  {p}
                </button>
              )
            })}
            <button onClick={() => handlePageChange(page + 1)} disabled={page === total_pages}
              className="px-2 py-1 rounded border text-xs disabled:opacity-40 hover:bg-gray-100">
              →
            </button>
          </div>
        </div>
      )}

      {editRow && (
        <EditModal row={editRow} columns={columns} pk={pk}
          onSave={handleSave} onClose={() => setEditRow(null)} />
      )}
    </div>
  )
}


// ─── SQL Query Runner ─────────────────────────────────────────────────────────

function QueryRunner() {
  const [sql, setSql] = useState('SELECT source, COUNT(*) as total FROM jobs GROUP BY source ORDER BY total DESC;')
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const textareaRef = useRef(null)

  const QUICK = [
    { label: 'All tables', sql: "SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::text)) as size FROM pg_tables WHERE schemaname='public';" },
    { label: 'Jobs by source', sql: 'SELECT source, COUNT(*) as total FROM jobs GROUP BY source ORDER BY total DESC;' },
    { label: 'Jobs by city', sql: "SELECT city, COUNT(*) as total FROM jobs WHERE city IS NOT NULL GROUP BY city ORDER BY total DESC LIMIT 10;" },
    { label: 'Recent jobs', sql: "SELECT title, company_name, source, city, created_at FROM jobs ORDER BY created_at DESC LIMIT 20;" },
    { label: 'Stale jobs', sql: "SELECT id, title, source, posted_date, created_at FROM jobs WHERE COALESCE(posted_date, created_at) < NOW() - INTERVAL '30 days' LIMIT 20;" },
    { label: 'Users', sql: 'SELECT id, email, role, is_active, created_at FROM users ORDER BY created_at DESC;' },
    { label: 'Apify runs', sql: 'SELECT source, status, jobs_new, jobs_duplicate, started_at FROM apify_runs ORDER BY started_at DESC LIMIT 30;' },
  ]

  const run = async () => {
    if (!sql.trim()) return
    setRunning(true)
    setResult(null)
    try {
      const { data } = await dbAPI.query(sql)
      setResult(data)
    } catch (e) {
      setResult({ type: 'error', message: e.response?.data?.detail || e.message })
    } finally {
      setRunning(false)
    }
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run()
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      const start = ta.selectionStart
      const end = ta.selectionEnd
      setSql(sql.slice(0, start) + '  ' + sql.slice(end))
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2 }, 0)
    }
  }

  const copyResult = () => {
    if (!result?.rows) return
    const header = result.columns.join('\t')
    const body = result.rows.map(r => result.columns.map(c => r[c] ?? '').join('\t')).join('\n')
    navigator.clipboard.writeText(header + '\n' + body)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Quick queries */}
      <div className="flex flex-wrap gap-1.5 flex-shrink-0">
        {QUICK.map(q => (
          <button key={q.label} onClick={() => setSql(q.sql)}
            className="px-2.5 py-1 text-xs rounded-full bg-gray-100 hover:bg-brand-100 hover:text-brand-700 text-gray-600 transition-colors font-medium">
            {q.label}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="relative flex-shrink-0">
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={5}
          className="w-full font-mono text-sm border border-gray-300 rounded-lg p-3 pr-24 resize-y focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50"
          placeholder="Enter SQL query…"
          spellCheck={false}
        />
        <button onClick={run} disabled={running}
          className="absolute right-3 bottom-3 btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3">
          <PlayIcon className="w-3.5 h-3.5" />
          {running ? 'Running…' : 'Run'}
          <span className="opacity-60 text-[10px]">Ctrl+↵</span>
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="flex-1 overflow-auto border border-gray-200 rounded-lg min-h-0">
          {result.type === 'error' && (
            <div className="flex items-start gap-2 p-4 text-red-600 bg-red-50">
              <AlertTriangleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <pre className="text-xs whitespace-pre-wrap">{result.message}</pre>
            </div>
          )}

          {result.type === 'modify' && (
            <div className="flex items-center gap-2 p-4 text-emerald-700 bg-emerald-50">
              <CheckIcon className="w-4 h-4" />
              <span className="text-sm font-medium">{result.message}</span>
            </div>
          )}

          {result.type === 'select' && (
            <>
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b sticky top-0">
                <span className="text-xs text-gray-500 font-medium">
                  {result.count} row{result.count !== 1 ? 's' : ''} returned
                  {result.count === 500 && <span className="text-amber-600 ml-1">(capped at 500)</span>}
                </span>
                <button onClick={copyResult} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                  <CopyIcon className="w-3 h-3" />Copy TSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {result.columns.map(c => (
                        <th key={c} className="px-3 py-2 text-left font-semibold text-gray-600 border-b whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-blue-50">
                        {result.columns.map(c => (
                          <td key={c} className="px-3 py-1.5 font-mono max-w-xs truncate">
                            {fmt(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.rows.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">No results</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}


// ─── Users Panel ─────────────────────────────────────────────────────────────

function UsersPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  const load = () => {
    setLoading(true)
    dbAPI.users().then(r => setUsers(r.data)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const toggleActive = async (u) => {
    await dbAPI.updateUser(u.id, { is_active: !u.is_active })
    toast.success(u.is_active ? 'User deactivated' : 'User activated')
    load()
  }

  const changeRole = async (u, role) => {
    await dbAPI.updateUser(u.id, { role })
    toast.success(`Role changed to ${role}`)
    load()
  }

  const handleDelete = async (u) => {
    if (!confirm(`Delete user ${u.email}? This will also delete their saved jobs.`)) return
    await dbAPI.deleteUser(u.id)
    toast.success('User deleted')
    load()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <UsersIcon className="w-4 h-4 text-brand-600" />Users
          <span className="badge bg-gray-100 text-gray-600">{users.length}</span>
        </h2>
        <button onClick={load} className="p-2 hover:bg-gray-100 rounded-lg">
          <RefreshCwIcon className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              {['Email','Name','Role','Status','Saved Jobs','Joined','Actions'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase border-b">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3">
                  <div className="h-4 bg-gray-100 rounded animate-pulse" />
                </td></tr>
              ))
            ) : users.map(u => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.email}</td>
                <td className="px-4 py-3 text-gray-600">{u.full_name || <span className="text-gray-300 italic text-xs">—</span>}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={e => changeRole(u, e.target.value)}
                    className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-center">{u.saved_count}</td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {u.created_at ? formatDistanceToNow(new Date(u.created_at), { addSuffix: true }) : '—'}
                </td>
                <td className="px-4 py-3">
                  {u.email.toLowerCase() === 'admin@shyamai.in' ? (
                    <span className="badge bg-brand-100 text-brand-700 text-xs px-2 py-1">
                      🔒 Protected
                    </span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleActive(u)} title={u.is_active ? 'Deactivate' : 'Activate'}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700">
                        {u.is_active ? <ShieldOffIcon className="w-3.5 h-3.5" /> : <ShieldIcon className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => handleDelete(u)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600">
                        <Trash2Icon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">No users</div>
        )}
      </div>
    </div>
  )
}


// ─── Saved Jobs Panel ─────────────────────────────────────────────────────────

function SavedJobsPanel() {
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = (p = page) => {
    setLoading(true)
    dbAPI.savedJobs(p).then(r => setData(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => load(1), [])

  const handleDelete = async (id) => {
    if (!confirm('Remove this saved job?')) return
    await dbAPI.deleteSavedJob(id)
    toast.success('Removed')
    load(page)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <BookmarkIcon className="w-4 h-4 text-brand-600" />Saved Jobs
          {data && <span className="badge bg-gray-100 text-gray-600">{data.total} total</span>}
        </h2>
        <button onClick={() => load(page)} className="p-2 hover:bg-gray-100 rounded-lg">
          <RefreshCwIcon className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              {['User','Job Title','Company','City','Source','Saved'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase border-b">{h}</th>
              ))}
              <th className="px-4 py-2.5 border-b w-12" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array(5).fill(0).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3">
                  <div className="h-4 bg-gray-100 rounded animate-pulse" />
                </td></tr>
              ))
            ) : data?.rows?.map(row => (
              <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">{row.email}</div>
                  <div className="text-xs text-gray-400">{row.full_name || ''}</div>
                </td>
                <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{row.job_title}</td>
                <td className="px-4 py-3 text-gray-600">{row.company_name}</td>
                <td className="px-4 py-3 text-gray-600">{row.city || '—'}</td>
                <td className="px-4 py-3">
                  <span className="badge bg-blue-100 text-blue-700 capitalize">{row.source}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {row.saved_at ? formatDistanceToNow(new Date(row.saved_at), { addSuffix: true }) : '—'}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(row.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600">
                    <Trash2Icon className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data?.rows?.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">No saved jobs yet</div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-between mt-3 flex-shrink-0">
          <span className="text-xs text-gray-500">Page {page} of {data.total_pages}</span>
          <div className="flex gap-1">
            <button onClick={() => { setPage(p => p-1); load(page-1) }} disabled={page === 1}
              className="px-2 py-1 rounded border text-xs disabled:opacity-40 hover:bg-gray-100">←</button>
            <button onClick={() => { setPage(p => p+1); load(page+1) }} disabled={page === data.total_pages}
              className="px-2 py-1 rounded border text-xs disabled:opacity-40 hover:bg-gray-100">→</button>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DatabaseManager() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTable, setActiveTable] = useState(null)
  const [tab, setTab] = useState('browse')   // 'browse' | 'query' | 'users' | 'saved'

  useEffect(() => {
    if (!user || user.role !== 'admin') { navigate('/'); return }
    dbAPI.tables()
      .then(r => setTables(r.data))
      .catch(() => toast.error('Failed to load tables'))
      .finally(() => setLoading(false))
  }, [user])

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="w-5 h-5 text-brand-600" />
          <h1 className="text-xl font-bold text-gray-900">Database Manager</h1>
          <span className="badge bg-emerald-100 text-emerald-700 text-xs">shyamai_jobs</span>
        </div>
        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {[
            { id: 'browse', icon: <TableIcon className="w-3.5 h-3.5" />,   label: 'Browse' },
            { id: 'users',  icon: <UsersIcon className="w-3.5 h-3.5" />,   label: 'Users' },
            { id: 'saved',  icon: <BookmarkIcon className="w-3.5 h-3.5" />, label: 'Saved Jobs' },
            { id: 'query',  icon: <TerminalIcon className="w-3.5 h-3.5" />, label: 'SQL' },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setActiveTable(null) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Tables sidebar */}
        <aside className="w-52 flex-shrink-0 flex flex-col">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Tables</p>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {loading ? (
              Array(5).fill(0).map((_, i) => (
                <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse mb-1" />
              ))
            ) : tables.map(t => (
              <button
                key={t.name}
                onClick={() => { setActiveTable(t.name); setTab('browse') }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors group ${
                  activeTable === t.name && tab === 'browse'
                    ? 'bg-brand-600 text-white'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <div className="font-medium truncate">{t.name}</div>
                <div className={`text-xs ${activeTable === t.name && tab === 'browse' ? 'text-brand-200' : 'text-gray-400'}`}>
                  {t.rows.toLocaleString()} rows · {fmtBytes(t.size_bytes)}
                </div>
              </button>
            ))}
          </div>
          {/* Connection info */}
          <div className="mt-3 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Connection</p>
            <p className="text-[10px] font-mono text-gray-600 break-all leading-relaxed">
              172.20.0.3:5432<br />
              <span className="text-brand-600">shyamai_jobs</span>
            </p>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {tab === 'users' ? (
            <UsersPanel />
          ) : tab === 'saved' ? (
            <SavedJobsPanel />
          ) : tab === 'query' ? (
            <div className="h-full flex flex-col">
              <p className="text-sm text-gray-500 mb-3 flex-shrink-0">
                Run any SQL query. <kbd className="bg-gray-100 px-1 rounded text-xs">Ctrl+Enter</kbd> to execute.
              </p>
              <QueryRunner />
            </div>
          ) : activeTable ? (
            <TableView tableName={activeTable} onBack={() => setActiveTable(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
              <DatabaseIcon className="w-16 h-16 text-gray-200 mb-4" />
              <p className="font-medium text-gray-600 mb-1">Select a table to browse</p>
              <p className="text-sm">or switch to SQL Query tab to run custom queries</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
