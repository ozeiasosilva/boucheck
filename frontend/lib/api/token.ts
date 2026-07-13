/**
 * Shared token storage utility for the respondent flow.
 *
 * Standardizes how the Response_Token is stored and retrieved across all pages.
 * Uses sessionStorage with a consistent key pattern: `boucheck_token_{slug}`.
 */

const TOKEN_PREFIX = 'boucheck_token_'

/**
 * Get the stored Response_Token for a given survey slug.
 * Returns null if no token exists or if called server-side.
 */
export function getToken(slug: string): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(`${TOKEN_PREFIX}${slug}`)
}

/**
 * Store a Response_Token for a given survey slug.
 */
export function setToken(slug: string, token: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(`${TOKEN_PREFIX}${slug}`, token)
}

/**
 * Remove the stored Response_Token for a given survey slug.
 */
export function clearToken(slug: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(`${TOKEN_PREFIX}${slug}`)
}
