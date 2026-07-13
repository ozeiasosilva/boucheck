'use client'

/**
 * SurveyThemeContext — provides the survey's theme (claro/escuro) across public pages.
 *
 * IMPORTANT: To avoid hydration mismatches, we always start with 'claro' on both
 * server and client, then update to 'escuro' after mount if applicable.
 * The `mounted` flag ensures the first render always matches the server output.
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type SurveyTheme = 'claro' | 'escuro'

interface SurveyThemeValue {
  theme: SurveyTheme
  mounted: boolean
}

const SurveyThemeContext = createContext<SurveyThemeValue>({ theme: 'claro', mounted: false })

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333'

export function SurveyThemeProvider({ slug, children }: { slug: string; children: ReactNode }) {
  // ALWAYS start with 'claro' to match server render (no hydration mismatch)
  const [theme, setTheme] = useState<SurveyTheme>('claro')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Fetch fresh from API after mount
    fetch(`${API_URL}/api/public/surveys/${slug}`)
      .then((res) => res.json())
      .then((data) => {
        const t = data?.config_visual?.tema === 'escuro' ? 'escuro' : 'claro'
        setTheme(t)
      })
      .catch(() => {})
      .finally(() => setMounted(true))
  }, [slug])

  return (
    <SurveyThemeContext.Provider value={{ theme, mounted }}>
      {children}
    </SurveyThemeContext.Provider>
  )
}

export function useSurveyTheme(): SurveyThemeValue {
  return useContext(SurveyThemeContext)
}
