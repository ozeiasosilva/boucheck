'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { getToken, setToken as storeToken, clearToken as removeToken } from './token'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ResponseContextValue {
  /** The current Response_Token for this survey slug, or null if not authenticated */
  token: string | null
  /** Store a token after successful identification */
  setResponseToken: (token: string) => void
  /** Clear the stored token */
  clearResponseToken: () => void
  /** The survey slug this context is bound to */
  slug: string
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ResponseContext = createContext<ResponseContextValue | null>(null)

// ─── Provider ────────────────────────────────────────────────────────────────

interface ResponseProviderProps {
  slug: string
  children: ReactNode
}

/**
 * Provides the Response_Token to all client pages within the respondent flow.
 *
 * Wraps sessionStorage-based persistence with a React context so that all
 * child pages (perguntas, checklist, concluido) reactively share the token
 * without prop drilling.
 *
 * The token is initialized from sessionStorage on mount — if no token exists,
 * pages should redirect to identification.
 */
export function ResponseProvider({ slug, children }: ResponseProviderProps) {
  const [token, setTokenState] = useState<string | null>(null)

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    const stored = getToken(slug)
    setTokenState(stored)
  }, [slug])

  const setResponseToken = useCallback(
    (newToken: string) => {
      storeToken(slug, newToken)
      setTokenState(newToken)
    },
    [slug]
  )

  const clearResponseToken = useCallback(() => {
    removeToken(slug)
    setTokenState(null)
  }, [slug])

  return (
    <ResponseContext.Provider
      value={{ token, setResponseToken, clearResponseToken, slug }}
    >
      {children}
    </ResponseContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Access the Response_Token context.
 * Must be used within a <ResponseProvider>.
 */
export function useResponseToken(): ResponseContextValue {
  const ctx = useContext(ResponseContext)
  if (!ctx) {
    throw new Error('useResponseToken must be used within a ResponseProvider')
  }
  return ctx
}
