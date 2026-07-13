import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'

/**
 * Auth middleware.
 *
 * Authenticates the current HTTP request using the configured guard(s).
 * Resolves the bearer token to an AdminUser; throws E_UNAUTHORIZED_ACCESS
 * (HTTP 401) when the token is missing, expired, or unknown.
 *
 * Validates: Requirements 1.1, 1.2
 */
export default class AuthMiddleware {
  redirectTo = '/login'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: { guards?: (keyof Authenticators)[] } = {}
  ) {
    await ctx.auth.authenticateUsing(options.guards || ['api'])
    return next()
  }
}
