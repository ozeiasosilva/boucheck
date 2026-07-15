'use client'

/**
 * AdminAuthContext — provides the current admin session across the app.
 *
 * On mount, reads the token from localStorage and validates it against
 * the backend via GET /api/admin/me. If invalid or missing, clears
 * localStorage, session cookie, and sets unauthenticated state.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getToken, setToken, clearToken, clearSessionCookie, authApi, meApi, type AdminUser } from './api'

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

    if (!token) {
      clearSessionCookie()
      setState({ token: null, user: null, isLoading: false })
      return
    }

    // Validate token on backend
    meApi.getProfile()
      .then((profile) => {
        setState({ token, user: profile as unknown as AdminUser, isLoading: false })
      })
      .catch(() => {
        // Token invalid — clear everything
        clearToken()
        clearSessionCookie()
        setState({ token: null, user: null, isLoading: false })
      })
  }, [])

  const login = useCallback((token: string, user?: AdminUser) => {
    setToken(token)
    setState({ token, user: user ?? null, isLoading: false })
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore error — clean up locally regardless
    } finally {
      clearToken()
      clearSessionCookie()
      setState({ token: null, user: null, isLoading: false })
      window.location.href = '/admin/login'
    }
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
