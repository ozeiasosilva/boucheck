import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * EnsureAdminActive middleware.
 *
 * Runs AFTER the auth guard. Checks that the authenticated admin user's
 * `ativo` flag is `true`. If the user has been deactivated (ativo === false),
 * the request is rejected with HTTP 401, even if their token is still technically valid.
 *
 * This handles the race condition where a token was issued before deactivation
 * and the explicit token deletion hasn't propagated yet.
 *
 * Validates: Requirement 1.3
 */
export default class EnsureAdminActiveMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user

    if (!user || user.ativo !== true) {
      return ctx.response.status(401).json({
        error: 'Unauthorized',
      })
    }

    return next()
  }
}
