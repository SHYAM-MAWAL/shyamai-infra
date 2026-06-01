import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Header from './components/Header'
import Home from './pages/Home'
import JobDetail from './pages/JobDetail'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import AdminDashboard from './pages/AdminDashboard'
import SavedJobs from './pages/SavedJobs'
import DatabaseManager from './pages/DatabaseManager'

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/saved" element={<SavedJobs />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/db" element={<DatabaseManager />} />
          </Routes>
        </main>
        <footer className="text-center text-xs text-gray-400 py-4 border-t border-gray-100">
          © 2024 ShyamAI Jobs · IT Jobs in India · Powered by AI
        </footer>
      </div>
    </AuthProvider>
  )
}
