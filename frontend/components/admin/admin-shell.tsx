'use client'

import { usePathname } from 'next/navigation'
import { AdminSidebar } from './sidebar'
import { useAdminAuth } from '@/lib/admin/auth-context'
import type { ReactNode } from 'react'

/**
 * Client component that conditionally renders the admin layout.
 *
 * Acts as an auth gate: while authentication is being verified, shows a
 * loading indicator. If no valid token is found after loading, renders
 * nothing (the AuthProvider handles the redirect). Only renders the full
 * layout (sidebar + content) when a valid token is confirmed.
 *
 * The login page bypasses all auth checks and renders children directly.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isLoading, token } = useAdminAuth()
  const isLoginPage = pathname === '/admin/login'

  if (isLoginPage) {
    return <>{children}</>
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-gray-300" />
          <span className="text-sm text-gray-400">Carregando...</span>
        </div>
      </div>
    )
  }

  if (!token) {
    return null
  }

  return (
    <div id="admin-root" className="flex min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
      <AdminSidebar />
      <main className="flex-1 overflow-auto dark:text-gray-100">
        {children}
      </main>
    </div>
  )
}
