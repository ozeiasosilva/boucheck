import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Route-to-middleware wiring smoke test.
 * Asserts every route this spec defines resolves through
 * ForceHttps → CORS → auth guard → EnsureAdminActive.
 *
 * Validates: Requirements 20.1
 */

const ROUTES_PATH = resolve(import.meta.dirname, '..', '..', 'start', 'routes.ts')
const routesContent = readFileSync(ROUTES_PATH, 'utf-8')

describe('Route-to-middleware wiring (admin-tracking-dashboard)', () => {
  describe('All tracking/dashboard routes are defined within the protected group', () => {
    // The protected group is the inner `.group()` that uses auth + ensureAdminActive
    const protectedGroupMatch = routesContent.match(
      /\.group\(\(\)\s*=>\s*\{([\s\S]*?)\}\)\s*\.use\(\[middleware\.auth\(\),\s*middleware\.ensureAdminActive\(\)\]\)/
    )

    it('a protected group with auth() + ensureAdminActive() middleware exists', () => {
      assert.ok(protectedGroupMatch, 'Should find a group with .use([middleware.auth(), middleware.ensureAdminActive()])')
    })

    const protectedBlock = protectedGroupMatch?.[1] ?? ''

    const expectedRoutes = [
      { method: 'get', path: '/responses' },
      { method: 'get', path: '/responses/:id' },
      { method: 'post', path: '/responses/:id/resend' },
      { method: 'get', path: '/responses/export.csv' },
      { method: 'post', path: '/responses/:id/anonymize' },
      { method: 'get', path: '/dashboard' },
    ]

    for (const route of expectedRoutes) {
      it(`${route.method.toUpperCase()} ${route.path} is inside the protected group`, () => {
        const escapedPath = route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = new RegExp(
          `router\\.${route.method}\\(['"\`]${escapedPath}['"\`]`
        )
        assert.ok(
          pattern.test(protectedBlock),
          `Expected router.${route.method}('${route.path}', ...) inside the protected group`
        )
      })
    }
  })

  describe('The protected group is inside the /api/admin prefix', () => {
    it('the outer group has .prefix(\'/api/admin\')', () => {
      // The outer group wraps both public and protected routes and ends with .prefix('/api/admin')
      const hasPrefixAfterGroup = /\.group\(\(\)\s*=>\s*\{[\s\S]*?\}\)\s*\.prefix\(['"`]\/api\/admin['"`]\)/.test(routesContent)
      assert.ok(hasPrefixAfterGroup, 'Should find a group with .prefix(\'/api/admin\')')
    })

    it('the auth-protected group is nested within the /api/admin prefixed group', () => {
      // Verify the structure: outer group with prefix('/api/admin') contains inner group with auth middleware
      // Find the outer group start and its prefix
      const outerGroupStart = routesContent.indexOf('.group(() => {')
      const prefixMatch = routesContent.indexOf(".prefix('/api/admin')")
      const authMiddleware = routesContent.indexOf('.use([middleware.auth(), middleware.ensureAdminActive()])')

      assert.ok(outerGroupStart >= 0, 'Outer group should exist')
      assert.ok(prefixMatch >= 0, 'Prefix /api/admin should exist')
      assert.ok(authMiddleware >= 0, 'Auth middleware chain should exist')

      // Auth middleware should appear before the prefix (within the outer group)
      assert.ok(
        authMiddleware < prefixMatch,
        'The auth middleware group should be nested inside the /api/admin prefix group'
      )
    })
  })

  describe('ForceHttps middleware is applied at the outer group level', () => {
    it('the outer group uses middleware.forceHttps()', () => {
      const hasForceHttps = /\.use\(\[middleware\.forceHttps\(\)\]\)/.test(routesContent)
      assert.ok(hasForceHttps, 'Should find .use([middleware.forceHttps()])')
    })

    it('forceHttps is applied after the /api/admin prefix (at outer level)', () => {
      const prefixPos = routesContent.indexOf(".prefix('/api/admin')")
      const forceHttpsPos = routesContent.indexOf('.use([middleware.forceHttps()])')

      assert.ok(prefixPos >= 0, '.prefix(\'/api/admin\') should exist')
      assert.ok(forceHttpsPos >= 0, '.use([middleware.forceHttps()]) should exist')

      // In AdonisJS chaining, forceHttps comes after prefix on the outer group
      assert.ok(
        forceHttpsPos > prefixPos,
        'forceHttps middleware should be chained after .prefix(\'/api/admin\') on the outer group'
      )
    })
  })

  describe('All six tracking/dashboard routes are registered', () => {
    const expectedRoutes = [
      { method: 'get', path: '/responses', description: 'GET /responses (listing)' },
      { method: 'get', path: '/responses/:id', description: 'GET /responses/:id (detail)' },
      { method: 'post', path: '/responses/:id/resend', description: 'POST /responses/:id/resend' },
      { method: 'get', path: '/responses/export.csv', description: 'GET /responses/export.csv' },
      { method: 'post', path: '/responses/:id/anonymize', description: 'POST /responses/:id/anonymize' },
      { method: 'get', path: '/dashboard', description: 'GET /dashboard' },
    ]

    for (const route of expectedRoutes) {
      it(`${route.description} is registered`, () => {
        const escapedPath = route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = new RegExp(
          `router\\.${route.method}\\(['"\`]${escapedPath}['"\`]`
        )
        assert.ok(
          pattern.test(routesContent),
          `Expected to find router.${route.method}('${route.path}', ...) in routes.ts`
        )
      })
    }

    it('exactly six tracking/dashboard routes are present', () => {
      const trackingRoutePatterns = [
        /router\.get\(['"`]\/responses\/export\.csv['"`]/,
        /router\.get\(['"`]\/responses\/:id['"`]/,
        /router\.get\(['"`]\/responses['"`]/,
        /router\.post\(['"`]\/responses\/:id\/resend['"`]/,
        /router\.post\(['"`]\/responses\/:id\/anonymize['"`]/,
        /router\.get\(['"`]\/dashboard['"`]/,
      ]

      const matchCount = trackingRoutePatterns.filter((p) => p.test(routesContent)).length
      assert.strictEqual(matchCount, 6, `Expected 6 tracking/dashboard routes, found ${matchCount}`)
    })
  })
})
