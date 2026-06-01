import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { BriefcaseIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const { verifyEmail } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState('verifying') // verifying | success | error
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setError('No verification token found in the link.')
      return
    }

    verifyEmail(token)
      .then(() => {
        setStatus('success')
        setTimeout(() => navigate('/'), 2500)
      })
      .catch(err => {
        setStatus('error')
        setError(err.response?.data?.detail || 'Verification failed. The link may be invalid or expired.')
      })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <BriefcaseIcon className="w-7 h-7 text-white" />
          </div>
        </div>

        <div className="card p-10 text-center">
          {status === 'verifying' && (
            <>
              <div className="w-12 h-12 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
              <h2 className="text-xl font-semibold text-gray-800">Verifying your email…</h2>
              <p className="text-gray-500 mt-2">Just a moment</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircleIcon className="w-14 h-14 text-green-500 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Email verified!</h2>
              <p className="text-gray-500 mb-6">Your account is now active. Redirecting you to the homepage…</p>
              <Link to="/" className="btn-primary inline-block px-8 py-2.5">Go now</Link>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircleIcon className="w-14 h-14 text-red-400 mx-auto mb-6" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification failed</h2>
              <p className="text-gray-500 mb-6">{error}</p>
              <div className="flex flex-col gap-3">
                <Link to="/login" className="btn-primary inline-block px-8 py-2.5">
                  Go to Login (Resend from there)
                </Link>
                <Link to="/register" className="text-sm text-brand-600 hover:underline">
                  Create a new account
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
