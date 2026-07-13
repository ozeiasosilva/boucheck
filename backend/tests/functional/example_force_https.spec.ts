// Feature: admin-auth-users, Example test: ForceHttps middleware rejects non-HTTPS
import { describe, it } from 'node:test'
import assert from 'node:assert'

/**
 * Unit-level example tests for the ForceHttps middleware.
 *
 * Since we cannot make actual HTTP requests to the server in these functional tests,
 * we import the middleware class directly and invoke its `handle` method with mock
 * HttpContext objects that simulate different request scenarios.
 *
 * Tests:
 * 1. A request with x-forwarded-proto: https passes through (next() is called).
 * 2. A request with x-forwarded-proto: http and accept: application/json gets 403.
 * 3. A request with x-forwarded-proto: http for a browser gets redirected (301).
 *
 * Validates: Requirement 11.1
 *
 * Run with: node --import=tsx --test tests/functional/example_force_https.spec.ts
 */

import ForceHttpsMiddleware from '../../app/middleware/force_https_middleware.js'

/**
 * Creates a minimal mock HttpContext for testing the middleware.
 */
function createMockContext(options: {
  forwardedProto?: string
  protocol?: string
  accept?: string
  url?: string
}) {
  const headers: Record<string, string> = {}
  if (options.forwardedProto) {
    headers['x-forwarded-proto'] = options.forwardedProto
  }
  if (options.accept) {
    headers['accept'] = options.accept
  }

  let redirectCalledWith: { url: string; isPermanent: boolean; statusCode: number } | null = null
  let forbiddenCalledWith: unknown = null

  const ctx = {
    request: {
      header(name: string) {
        return headers[name.toLowerCase()] || ''
      },
      protocol: options.protocol || 'http',
      completeUrl(_includeQuery?: boolean) {
        return options.url || 'http://boucheck.beonup.com.br/api/admin/auth/login'
      },
    },
    response: {
      forbidden(body: unknown) {
        forbiddenCalledWith = body
        return body
      },
      redirect(url: string, isPermanent: boolean, statusCode: number) {
        redirectCalledWith = { url, isPermanent, statusCode }
        return undefined
      },
    },
  }

  return {
    ctx,
    getRedirectCall: () => redirectCalledWith,
    getForbiddenCall: () => forbiddenCalledWith,
  }
}

describe('ForceHttps middleware (Requirement 11.1)', () => {
  it('passes through when x-forwarded-proto is https', async () => {
    const { ctx } = createMockContext({
      forwardedProto: 'https',
      accept: 'application/json',
    })

    const middleware = new ForceHttpsMiddleware()
    let nextCalled = false

    await middleware.handle(ctx as any, async () => {
      nextCalled = true
    })

    assert.strictEqual(nextCalled, true, 'next() should be called for HTTPS requests')
  })

  it('returns 403 for non-HTTPS API request (accept: application/json)', async () => {
    const { ctx, getForbiddenCall } = createMockContext({
      forwardedProto: 'http',
      accept: 'application/json',
      url: 'http://boucheck.beonup.com.br/api/admin/admin-users',
    })

    const middleware = new ForceHttpsMiddleware()
    let nextCalled = false

    await middleware.handle(ctx as any, async () => {
      nextCalled = true
    })

    assert.strictEqual(nextCalled, false, 'next() should NOT be called for non-HTTPS API requests')
    const forbidden = getForbiddenCall() as { error: string }
    assert.ok(forbidden, 'response.forbidden() should have been called')
    assert.strictEqual(
      forbidden.error,
      'HTTPS required for admin routes',
      'Should return the correct error message'
    )
  })

  it('redirects browser requests to HTTPS equivalent (301)', async () => {
    const { ctx, getRedirectCall } = createMockContext({
      forwardedProto: 'http',
      accept: 'text/html',
      url: 'http://boucheck.beonup.com.br/api/admin/admin-users',
    })

    const middleware = new ForceHttpsMiddleware()
    let nextCalled = false

    await middleware.handle(ctx as any, async () => {
      nextCalled = true
    })

    assert.strictEqual(nextCalled, false, 'next() should NOT be called for non-HTTPS browser requests')
    const redirect = getRedirectCall()
    assert.ok(redirect, 'response.redirect() should have been called')
    assert.strictEqual(redirect.statusCode, 301, 'Should redirect with 301 status')
    assert.strictEqual(
      redirect.url,
      'https://boucheck.beonup.com.br/api/admin/admin-users',
      'Should redirect to the HTTPS equivalent URL'
    )
    assert.strictEqual(redirect.isPermanent, false, 'isPermanent should be false (status code is explicit)')
  })
})
