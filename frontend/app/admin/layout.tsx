import type { ReactNode } from 'react'
import { AdminAuthProvider } from '@/lib/admin/auth-context'
import { AdminThemeProvider } from '@/lib/admin/theme-context'
import { ToastProvider } from '@/components/admin/ui/toast'
import { AdminShell } from '@/components/admin/admin-shell'

export const metadata = {
  title: 'BouCheck Admin',
  description: 'Painel administrativo BouCheck',
}

/**
 * Root layout for all /admin/* pages.
 *
 * - Wraps with AdminAuthProvider (token + logout)
 * - Wraps with AdminThemeProvider (dark/light mode)
 * - Wraps with ToastProvider (global toasts)
 * - AdminShell conditionally renders the sidebar (hidden on login page)
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminThemeProvider>
        <ToastProvider>
          <AdminShell>
            {children}
          </AdminShell>
        </ToastProvider>
      </AdminThemeProvider>
    </AdminAuthProvider>
  )
}
