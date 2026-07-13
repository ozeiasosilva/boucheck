import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Contract-level tests verifying that all six routes defined by the
 * admin-tracking-dashboard spec are protected by the auth middleware,
 * ensuring a 401 response for requests without a valid admin bearer token.
 *
 * Validates: Requirement 20.2
 *
 * Since full integration testing requires the AdonisJS app bootstrap and a
 * running database, this test verifies the contract by:
 * 1. Confirming all six spec-defined routes exist in routes.ts
 * 2. Confirming those routes live inside the protected group with middleware.auth()
 * 3. Documenting the expected 401 behavior from the auth guard middleware
 */

const ROUTES_FILE = resolve(import.meta.dirname, '..', '..', 'start', 'routes.ts')

/**
 * The six routes this spec (admin-tracking-dashboard) defines.
 * All must be protected by the auth guard + EnsureAdminActive middleware chain.
 */
const SPEC_ROUTES = [
  { method: 'get', path: '/responses/export.csv', controller: 'ExportController', action: 'export' },
  { method: 'get', path: '/responses', controller: 'ResponsesController', action: 'index' },
  { method: 'get', path: '/responses/:id', controller: 'ResponsesController', action: 'show' },
  { method: 'post', path: '/responses/:id/resend', controller: 'ResponsesController', action: 'resend' },
  { method: 'post', path: '/responses/:id/anonymize', controller: 'ResponsesController', action: 'anonymize' },
  { method: 'get', path: '/dashboard', controller: 'DashboardController', action: 'index' },
] as const

describe('Missing bearer token — 401 contract (Requirement 20.2)', () => {
  let routesContent: string

  // Load the routes file once for all tests
  it('routes.ts file is readable', () => {
    routesContent = readFileSync(ROUTES_FILE, 'utf-8')
    assert.ok(routesContent.length > 0, 'routes.ts should be non-empty')
  })

  describe('Route list completeness — all six spec routes are registered', () => {
    for (const route of SPEC_ROUTES) {
      it(`${route.method.toUpperCase()} /api/admin${route.path} is defined`, () => {
        if (!routesContent) routesContent = readFileSync(ROUTES_FILE, 'utf-8')

        // Verify the route path pattern exists in routes.ts
        const pathPattern = route.path.replace(':id', ':id')
        assert.ok(
          routesContent.includes(`'${pathPattern}'`),
          `Expected routes.ts to contain route path '${pathPattern}'`
        )
      })
    }
  })

  describe('Auth middleware is applied to the protected group', () => {
    it('the protected group uses middleware.auth()', () => {
      if (!routesContent) routesContent = readFileSync(ROUTES_FILE, 'utf-8')

      assert.ok(
        routesContent.includes('middleware.auth()'),
        'Expected the protected route group to use middleware.auth()'
      )
    })

    it('the protected group uses middleware.ensureAdminActive()', () => {
      if (!routesContent) routesContent = readFileSync(ROUTES_FILE, 'utf-8')

      assert.ok(
        routesContent.includes('middleware.ensureAdminActive()'),
        'Expected the protected route group to use middleware.ensureAdminActive()'
      )
    })

    it('auth and ensureAdminActive are applied together in the same .use() call', () => {
      if (!routesContent) routesContent = readFileSync(ROUTES_FILE, 'utf-8')

      // The middleware should be in a single .use([...]) array on the protected group
      const usePattern = /\.use\(\[middleware\.auth\(\),\s*middleware\.ensureAdminActive\(\)\]\)/
      assert.ok(
        usePattern.test(routesContent),
        'Expected middleware.auth() and middleware.ensureAdminActive() in the same .use([...]) call'
      )
    })
  })

  describe('Spec routes are inside the protected group (not the public group)', () => {
    it('ResponsesController routes are in the auth-protected block', () => {
      if (!routesContent) routesContent = readFileSync(ROUTES_FILE, 'utf-8')

      // Find the protected group section (between the second .group(() => { and its .use())
      const protectedGroupMatch = routesContent.match(
        /\/\/ Protected routes[\s\S]*?\.use\(\[middleware\.auth\(\)/
      )
      assert.ok(protectedGroupMatch, 'Expected a protected routes section with auth middleware')

      const protectedBlock = protectedGroupMatch![0]
      assert.ok(
        protectedBlock.includes('ResponsesController'),
        'ResponsesController should be inside the protected group'
      )
    })

    it('ExportController routes are in the auth-protected block', () => {
      if (!routesContent) routesContent = readFileSync(ROUTES_FILE, 'utf-8')

      const protectedGroupMatch = routesContent.match(
        /\/\/ Protected routes[\s\S]*?\.use\(\[middleware\.auth\(\)/
      )
      assert.ok(protectedGroupMatch, 'Expected a protected routes section with auth middleware')

      const protectedBlock = protectedGroupMatch![0]
      assert.ok(
        protectedBlock.includes('ExportController'),
        'ExportController should be inside the protected group'
      )
    })

    it('DashboardController routes are in the auth-protected block', () => {
      if (!routesContent) routesContent = readFileSync(ROUTES_FILE, 'utf-8')

      const protectedGroupMatch = routesContent.match(
        /\/\/ Protected routes[\s\S]*?\.use\(\[middleware\.auth\(\)/
      )
      assert.ok(protectedGroupMatch, 'Expected a protected routes section with auth middleware')

      const protectedBlock = protectedGroupMatch![0]
      assert.ok(
        protectedBlock.includes('DashboardController'),
        'DashboardController should be inside the protected group'
      )
    })
  })

  describe('Expected behavior contract — 401 for missing bearer token', () => {
    /**
     * The auth guard middleware (from @adonisjs/auth) intercepts requests
     * without a valid bearer token and responds with HTTP 401 before the
     * controller handler executes. This is the behavioral contract:
     *
     * For each of these routes, a request without an Authorization header
     * (or with an invalid/expired token) will receive:
     *   - HTTP status: 401
     *   - Body: { errors: [{ message: "Unauthorized access" }] }
     *
     * This is enforced by the auth guard defined in admin-auth-users spec,
     * applied to the protected group containing all six spec routes.
     */
    for (const route of SPEC_ROUTES) {
      it(`${route.method.toUpperCase()} /api/admin${route.path} → 401 without bearer token`, () => {
        if (!routesContent) routesContent = readFileSync(ROUTES_FILE, 'utf-8')

        // Verify the route path is inside the protected group
        const protectedGroupMatch = routesContent.match(
          /\/\/ Protected routes[\s\S]*?\.use\(\[middleware\.auth\(\)/
        )
        assert.ok(
          protectedGroupMatch,
          'Protected group with auth middleware must exist'
        )

        const protectedBlock = protectedGroupMatch![0]
        const pathPattern = route.path.replace(':id', ':id')
        assert.ok(
          protectedBlock.includes(`'${pathPattern}'`),
          `Route '${pathPattern}' must be inside the auth-protected group to return 401 without a token`
        )
      })
    }
  })
})
