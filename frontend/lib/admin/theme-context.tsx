'use client'

/**
 * AdminThemeContext — provides dark/light mode across the admin area.
 *
 * Theme preference is stored per-user on the server (via /api/admin/me/tema).
 * Locally, it's cached in localStorage so the initial render doesn't flash.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { meApi, getToken } from './api'

export type AdminTheme = 'claro' | 'escuro'

interface ThemeContextValue {
  theme: AdminTheme
  setTheme: (tema: AdminTheme) => void
  isLoading: boolean
}

const STORAGE_KEY = 'boucheck_admin_theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function getStoredTheme(): AdminTheme {
  if (typeof window === 'undefined') return 'claro'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'escuro') return 'escuro'
  return 'claro'
}

export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AdminTheme>(getStoredTheme)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch user's theme preference from the server on mount
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setIsLoading(false)
      return
    }

    meApi.getProfile()
      .then((profile) => {
        const serverTheme = profile.tema_preferido === 'escuro' ? 'escuro' : 'claro'
        setThemeState(serverTheme)
        localStorage.setItem(STORAGE_KEY, serverTheme)
      })
      .catch(() => {
        // Use local cache if server request fails
      })
      .finally(() => setIsLoading(false))
  }, [])

  // Apply the dark class to the admin root
  useEffect(() => {
    const adminRoot = document.getElementById('admin-root')
    if (adminRoot) {
      if (theme === 'escuro') {
        adminRoot.classList.add('dark')
      } else {
        adminRoot.classList.remove('dark')
      }
    }
  }, [theme])

  const setTheme = useCallback((newTheme: AdminTheme) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)

    // Persist to server (fire and forget)
    meApi.setTheme(newTheme).catch(() => {})
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useAdminTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useAdminTheme must be used within AdminThemeProvider')
  return ctx
}
