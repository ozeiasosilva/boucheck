'use client'

/**
 * AdminAuthContext — provides the current admin session across the app.
 *
 * On mount, reads the token from localStorage and validates it by
 * checking for expiry. If expired or missing, clears it and the
 * middleware will redirect to /admin/login.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getToken, setToken, clearToken, type AdminUser } from './api'

interface AuthState {
  token: string | null
  user: AdminUser | null
  isLoading: boolean
}

interface AuthContextValue extends AuthState {
  login: (token: string, user?: AdminUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    isLoading: true,
  })

  useEffect(() => {
    const token = getToken()
    setState({ token, user: null, isLoading: false })
  }, [])

  const login = useCallback((token: string, user?: AdminUser) => {
    setToken(token)
    setState({ token, user: user ?? null, isLoading: false })
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setState({ token: null, user: null, isLoading: false })
    window.location.href = '/admin/login'
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAdminAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
