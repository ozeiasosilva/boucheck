'use client'

import { usePathname } from 'next/navigation'
import { AdminSidebar } from './sidebar'
import type { ReactNode } from 'react'

/**
 * Client component that conditionally renders the sidebar.
 * The login page gets a full-screen treatment (no sidebar).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/admin/login'

  if (isLoginPage) {
    return <>{children}</>
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
