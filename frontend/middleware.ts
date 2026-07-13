import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware — protects all /admin/* routes except /admin/login.
 *
 * Token lives in localStorage (client-side SPA), so the middleware
 * can't read it directly. Instead we use a short-lived cookie
 * 'boucheck_admin_session' that the login page sets after a
 * successful auth. The cookie is HttpOnly-false so client JS can
 * also clear it on logout.
 *
 * Flow:
 *   1. Any request to /admin/* (except /admin/login) without the cookie
 *      → redirect to /admin/login?next=<original-path>
 *   2. Request to /admin/login WITH the cookie
 *      → redirect to /admin/dashboard (already logged in)
 */

const COOKIE_NAME = 'boucheck_admin_session'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isLoginPage = pathname === '/admin/login'
  const isAdminRoute = pathname.startsWith('/admin')

  if (!isAdminRoute) return NextResponse.next()

  const sessionCookie = request.cookies.get(COOKIE_NAME)
  const hasSession = !!sessionCookie?.value

  if (isLoginPage && hasSession) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  if (!isLoginPage && !hasSession) {
    const loginUrl = new URL('/admin/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
