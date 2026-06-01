import { createContext, useContext, useState } from 'react'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })

  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password })
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }

  // Register no longer auto-logs in — returns { message, email }
  const register = async (email, password, full_name) => {
    const { data } = await authAPI.register({ email, password, full_name })
    return data
  }

  // Called from VerifyEmail page after clicking the link
  const verifyEmail = async (token) => {
    const { data } = await authAPI.verifyEmail(token)
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }

  const resendVerification = async (email) => {
    const { data } = await authAPI.resendVerification(email)
    return data
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, register, verifyEmail, resendVerification, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
