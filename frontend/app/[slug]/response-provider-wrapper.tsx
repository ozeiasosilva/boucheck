'use client'

import { ResponseProvider } from '@/lib/api/response-context'
import { SurveyThemeProvider } from '@/lib/api/survey-theme-context'

/**
 * Client-component wrapper for the ResponseProvider and SurveyThemeProvider.
 *
 * This is needed because the layout.tsx is a server component (it uses
 * `await params`), and the providers are client components.
 */
export function ResponseProviderWrapper({
  slug,
  children,
}: {
  slug: string
  children: React.ReactNode
}) {
  return (
    <SurveyThemeProvider slug={slug}>
      <ResponseProvider slug={slug}>{children}</ResponseProvider>
    </SurveyThemeProvider>
  )
}
