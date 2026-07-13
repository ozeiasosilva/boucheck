/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
|
| The HTTP kernel file is used to register the middleware with the server
| or the router.
|
*/

import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

/**
 * Server-level middleware runs on every HTTP request.
 * - InitializeAuthMiddleware: sets up ctx.auth for all requests
 * - CORS middleware: restricts origins to the frontend for /api/admin/* routes (Req 11.2)
 */
server.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/auth/initialize_auth_middleware'),
  () => import('@adonisjs/cors/cors_middleware'),
])

/**
 * Router-level middleware (named middleware, route groups, etc.)
 */
router.use([])

/**
 * Named middleware collection.
 *
 * - forceHttps: rejects/redirects non-HTTPS admin requests (Req 11.1)
 * - auth: authenticates the bearer token; 401 on missing/expired/unknown (Req 1.1, 1.2)
 * - ensureAdminActive: asserts auth.user.ativo === true; 401 otherwise (Req 1.3)
 */
export const middleware = router.named({
  forceHttps: () => import('#middleware/force_https_middleware'),
  auth: () => import('#middleware/auth_middleware'),
  ensureAdminActive: () => import('#middleware/ensure_admin_active_middleware'),
  rateLimit: () => import('#middleware/rate_limit_middleware'),
  responseTokenAuth: () => import('#middleware/response_token_auth_middleware'),
})
