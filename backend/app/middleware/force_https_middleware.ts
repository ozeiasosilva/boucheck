import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * ForceHttps middleware.
 *
 * Ensures all requests to admin routes are over HTTPS.
 * Inspects `X-Forwarded-Proto` header (trusted proxy) or request protocol.
 *
 * For API clients (Accept: application/json): returns 403
 * For browser requests: redirects to HTTPS equivalent (301)
 *
 * Validates: Requirement 11.1
 */
export default class ForceHttpsMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    // Skip HTTPS enforcement in development
    if (process.env.NODE_ENV !== 'production') {
      return next()
    }

    const proto = ctx.request.header('x-forwarded-proto') || ctx.request.protocol
    const isSecure = proto === 'https'

    if (isSecure) {
      return next()
    }

    // Non-HTTPS request to an admin route
    const acceptHeader = ctx.request.header('accept') || ''
    const isApiClient = acceptHeader.includes('application/json')

    if (isApiClient) {
      return ctx.response.forbidden({
        error: 'HTTPS required for admin routes',
      })
    }

    // Browser redirect to HTTPS equivalent
    const url = ctx.request.completeUrl(true)
    const httpsUrl = url.replace(/^http:/, 'https:')
    return ctx.response.redirect(httpsUrl, false, 301)
  }
}
