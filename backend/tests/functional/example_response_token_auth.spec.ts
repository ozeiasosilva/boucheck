// Feature: public-response-flow, Example test: ResponseTokenAuth middleware
import { describe, it } from 'node:test'
import assert from 'node:assert'

/**
 * Unit-level example tests for the ResponseTokenAuth middleware.
 *
 * We cannot make actual HTTP requests to the server in these functional tests,
 * so we import the middleware class directly and invoke its `handle` method
 * with mock HttpContext objects. We monkey-patch the Response model's `query`
 * static so no real database connection is required.
 *
 * Tests:
 * 1. A request with a token matching an existing Response_Session passes
 *    through and attaches the session to `ctx.response_session`.
 * 2. A request with a token that does not match any Response_Session gets 401
 *    and does not call next().
 * 3. A request missing the token param gets 401 and does not call next().
 *
 * Validates: Requirement 9.1
 *
 * Run with: node --import=tsx --test tests/functional/example_response_token_auth.spec.ts
 */

import ResponseTokenAuthMiddleware from '../../app/middleware/response_token_auth_middleware.js'
import Response from '../../app/models/response.js'

function createMockContext(
  params: Record<string, string | undefined>,
  url: string = '/api/public/responses/some-token/answers/1'
) {
  let statusCode: number | null = null
  let jsonBody: unknown = null

  const ctx: any = {
    params,
    request: {
      url: () => url,
    },
    response: {
      status(code: number) {
        statusCode = code
        return {
          json(body: unknown) {
            jsonBody = body
            return body
          },
        }
      },
    },
  }

  return {
    ctx,
    getStatus: () => statusCode,
    getJsonBody: () => jsonBody,
  }
}

describe('ResponseTokenAuth middleware (Requirement 9.1)', () => {
  it('attaches the found Response_Session to ctx.response_session and calls next()', async () => {
    const fakeSession = { id: 'resp-1', surveyId: 1, status: 'iniciado', token: 'valid-token' }
    const originalQuery = Response.query
    ;(Response as any).query = () => ({
      where: () => ({
        first: async () => fakeSession,
      }),
    })

    try {
      const { ctx } = createMockContext({ token: 'valid-token' })
      const middleware = new ResponseTokenAuthMiddleware()
      let nextCalled = false

      await middleware.handle(ctx, async () => {
        nextCalled = true
      })

      assert.strictEqual(nextCalled, true, 'next() should be called for a valid token')
      assert.strictEqual(
        ctx.response_session,
        fakeSession,
        'ctx.response_session should be set to the found Response_Session'
      )
    } finally {
      ;(Response as any).query = originalQuery
    }
  })

  it('returns 401 when the token does not match any Response_Session', async () => {
    const originalQuery = Response.query
    ;(Response as any).query = () => ({
      where: () => ({
        first: async () => null,
      }),
    })

    try {
      const { ctx, getStatus, getJsonBody } = createMockContext({ token: 'unknown-token' })
      const middleware = new ResponseTokenAuthMiddleware()
      let nextCalled = false

      await middleware.handle(ctx, async () => {
        nextCalled = true
      })

      assert.strictEqual(nextCalled, false, 'next() should NOT be called for an unknown token')
      assert.strictEqual(getStatus(), 401, 'Should respond with 401')
      assert.deepStrictEqual(getJsonBody(), { error: 'invalid_token' })
      assert.strictEqual(ctx.response_session, undefined, 'ctx.response_session should not be set')
    } finally {
      ;(Response as any).query = originalQuery
    }
  })

  it('returns 401 when the token param is missing', async () => {
    const { ctx, getStatus, getJsonBody } = createMockContext({})
    const middleware = new ResponseTokenAuthMiddleware()
    let nextCalled = false

    await middleware.handle(ctx, async () => {
      nextCalled = true
    })

    assert.strictEqual(nextCalled, false, 'next() should NOT be called when token param is missing')
    assert.strictEqual(getStatus(), 401, 'Should respond with 401')
    assert.deepStrictEqual(getJsonBody(), { error: 'invalid_token' })
  })

  it('short-circuits with 200 on /complete when status is already completo', async () => {
    const fakeSession = {
      id: 'resp-1',
      surveyId: 1,
      status: 'completo',
      token: 'valid-token',
      completedAt: { toISO: () => '2025-07-08T14:30:00.000-03:00' },
    }
    const originalQuery = Response.query
    ;(Response as any).query = () => ({
      where: () => ({
        first: async () => fakeSession,
      }),
    })

    try {
      const { ctx, getStatus, getJsonBody } = createMockContext(
        { token: 'valid-token' },
        '/api/public/responses/valid-token/complete'
      )
      const middleware = new ResponseTokenAuthMiddleware()
      let nextCalled = false

      await middleware.handle(ctx, async () => {
        nextCalled = true
      })

      assert.strictEqual(nextCalled, false, 'next() should NOT be called for idempotent /complete')
      assert.strictEqual(getStatus(), 200, 'Should respond with 200')
      assert.deepStrictEqual(getJsonBody(), {
        completed: true,
        completed_at: '2025-07-08T14:30:00.000-03:00',
      })
    } finally {
      ;(Response as any).query = originalQuery
    }
  })

  it('proceeds normally on /complete when status is NOT completo', async () => {
    const fakeSession = {
      id: 'resp-1',
      surveyId: 1,
      status: 'iniciado',
      token: 'valid-token',
      completedAt: null,
    }
    const originalQuery = Response.query
    ;(Response as any).query = () => ({
      where: () => ({
        first: async () => fakeSession,
      }),
    })

    try {
      const { ctx } = createMockContext(
        { token: 'valid-token' },
        '/api/public/responses/valid-token/complete'
      )
      const middleware = new ResponseTokenAuthMiddleware()
      let nextCalled = false

      await middleware.handle(ctx, async () => {
        nextCalled = true
      })

      assert.strictEqual(nextCalled, true, 'next() should be called when status is not completo')
      assert.strictEqual(ctx.response_session, fakeSession)
    } finally {
      ;(Response as any).query = originalQuery
    }
  })
})
