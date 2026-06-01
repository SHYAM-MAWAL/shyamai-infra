import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BriefcaseIcon, MailIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function Register() {
  const { register } = useAuth()
  const [form, setForm] = useState({ email: '', password: '', full_name: '' })
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password.length < 6) { toast.error('Password must be at least 6 chars'); return }
    setLoading(true)
    try {
      const result = await register(form.email, form.password, form.full_name)
      setSentTo(result.email)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  if (sentTo) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="w-full max-w-md text-center">
          <div className="card p-10">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <MailIcon className="w-8 h-8 text-brand-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your inbox</h2>
            <p className="text-gray-500 mb-4">
              We sent a verification link to <strong className="text-gray-700">{sentTo}</strong>.
              Click it to activate your account.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Didn't get it? Check spam, or{' '}
              <Link to={`/login?resend=${encodeURIComponent(sentTo)}`} className="text-brand-600 hover:underline font-medium">
                resend the link
              </Link>.
            </p>
            <Link to="/login" className="btn-primary inline-block px-8 py-2.5">Go to Login</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <BriefcaseIcon className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-gray-500 mt-1">Start finding IT jobs in India</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" className="input" placeholder="Shyam Mawalai"
                value={form.full_name} onChange={e => set('full_name', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" required className="input" placeholder="you@example.com"
                value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required className="input" placeholder="Min 6 characters"
                value={form.password} onChange={e => set('password', e.target.value)} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Creating…' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
