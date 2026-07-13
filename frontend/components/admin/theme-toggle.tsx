'use client'

import { useAdminTheme, type AdminTheme } from '@/lib/admin/theme-context'

/**
 * Theme toggle component for admin area.
 * Allows admins to switch between light (claro) and dark (escuro) modes.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useAdminTheme()

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setTheme(theme === 'claro' ? 'escuro' : 'claro')}
        className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 dark:focus:ring-offset-gray-800"
        style={{ backgroundColor: theme === 'escuro' ? '#1c57e5' : '#d1d5db' }}
        role="switch"
        aria-checked={theme === 'escuro'}
        aria-label="Alternar tema escuro"
      >
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: theme === 'escuro' ? 'translateX(1.375rem)' : 'translateX(0.25rem)' }}
        >
          {theme === 'escuro' ? (
            <svg className="h-3 w-3 text-brand-blue" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          ) : (
            <svg className="h-3 w-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zM4.222 4.222a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414zM15.657 4.222a1 1 0 010 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 0zM10 7a3 3 0 100 6 3 3 0 000-6zm-8 3a1 1 0 011-1h1a1 1 0 110 2H3a1 1 0 01-1-1zm14 0a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM4.222 15.657a1 1 0 011.414-1.414l.707.707a1 1 0 01-1.414 1.414l-.707-.707zM14.95 14.95a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414zM10 15a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          )}
        </span>
      </button>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {theme === 'escuro' ? 'Escuro' : 'Claro'}
      </span>
    </div>
  )
}

/**
 * Larger theme selector with radio buttons for use in settings pages.
 */
export function ThemeSelector() {
  const { theme, setTheme } = useAdminTheme()

  const options: Array<{ value: AdminTheme; label: string; icon: React.ReactNode; description: string }> = [
    {
      value: 'claro',
      label: 'Claro',
      description: 'Fundo claro com texto escuro',
      icon: (
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zM4.222 4.222a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414zM15.657 4.222a1 1 0 010 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 0zM10 7a3 3 0 100 6 3 3 0 000-6zm-8 3a1 1 0 011-1h1a1 1 0 110 2H3a1 1 0 01-1-1zm14 0a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM4.222 15.657a1 1 0 011.414-1.414l.707.707a1 1 0 01-1.414 1.414l-.707-.707zM14.95 14.95a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414zM10 15a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      value: 'escuro',
      label: 'Escuro',
      description: 'Fundo escuro com texto claro',
      icon: (
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          className={[
            'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
            theme === opt.value
              ? 'border-brand-blue bg-primary-light dark:bg-brand-blue/20 text-brand-blue'
              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-600 dark:text-gray-300',
          ].join(' ')}
        >
          {opt.icon}
          <span className="text-sm font-medium">{opt.label}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{opt.description}</span>
        </button>
      ))}
    </div>
  )
}
