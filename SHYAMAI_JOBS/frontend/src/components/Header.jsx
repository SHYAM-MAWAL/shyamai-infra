import { Link, useNavigate, useLocation } from 'react-router-dom'
import { BriefcaseIcon, UserIcon, LogOutIcon, LayoutDashboardIcon, BookmarkIcon, DatabaseIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center group-hover:bg-brand-700 transition-colors">
              <BriefcaseIcon className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-gray-900 text-lg">ShyamAI</span>
              <span className="font-bold text-brand-600 text-lg"> Jobs</span>
            </div>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            <Link
              to="/"
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/' ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Jobs
            </Link>

            {user ? (
              <>
                <Link
                  to="/saved"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  <BookmarkIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Saved</span>
                </Link>

                {user.role === 'admin' && (
                  <>
                    <Link
                      to="/admin"
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        location.pathname === '/admin'
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <LayoutDashboardIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Admin</span>
                    </Link>
                    <Link
                      to="/admin/db"
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        location.pathname === '/admin/db'
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <DatabaseIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">DB</span>
                    </Link>
                  </>
                )}

                <div className="flex items-center gap-2 ml-2">
                  <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100">
                    <UserIcon className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-xs text-gray-600 font-medium">
                      {user.full_name || user.email.split('@')[0]}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOutIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 ml-2">
                <Link to="/login" className="btn-outline text-sm">Login</Link>
                <Link to="/register" className="btn-primary text-sm">Sign Up</Link>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}
