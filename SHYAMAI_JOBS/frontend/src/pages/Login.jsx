import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BriefcaseIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function Login() {
  const { login, resendVerification } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [form, setForm] = useState({ email: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [unverifiedEmail, setUnverifiedEmail] = useState(null)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendDone, setResendDone] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Pre-fill email + trigger resend if coming from Register "resend" link
  useEffect(() => {
    const resendEmail = searchParams.get('resend')
    if (resendEmail) {
      setForm(f => ({ ...f, email: resendEmail }))
      setUnverifiedEmail(resendEmail)
    }
  }, [searchParams])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setUnverifiedEmail(null)
    try {
      await login(form.email, form.password)
      toast.success('Welcome back!')
      navigate('/')
    } catch (err) {
      const detail = err.response?.data?.detail || ''
      if (detail === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(form.email)
      } else {
        toast.error(detail || 'Invalid credentials')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!unverifiedEmail) return
    setResendLoading(true)
    try {
      await resendVerification(unverifiedEmail)
      setResendDone(true)
      toast.success('Verification email sent!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to resend. Try again.')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <BriefcaseIcon className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sign in to ShyamAI Jobs</h1>
          <p className="text-gray-500 mt-1">Find your next IT opportunity</p>
        </div>

        <div className="card p-8">
          {unverifiedEmail && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <p className="text-amber-800 font-medium mb-1">Email not verified</p>
              <p className="text-amber-700 mb-3">
                Please check your inbox for the verification link sent to <strong>{unverifiedEmail}</strong>.
              </p>
              {resendDone ? (
                <p className="text-green-700 font-medium">New link sent! Check your inbox.</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="text-brand-600 hover:underline font-medium disabled:opacity-60"
                >
                  {resendLoading ? 'Sending…' : 'Resend verification email'}
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email" required autoFocus
                className="input"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => set('email', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'} required
                  className="input pr-10"
                  placeholder="Your password"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            No account?{' '}
            <Link to="/register" className="text-brand-600 hover:underline font-medium">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
