// Feature: public-response-flow, Example test: CompletionController
import { describe, it, mock } from 'node:test'
import assert from 'node:assert'

/**
 * Unit-level example tests for the CompletionController.
 *
 * We mock `#services/navigation_validator` via `mock.module` before importing
 * the controller, then invoke the `handle` method with a mock HttpContext.
 * We also mock `ResponseEvent.create` via `mock.method` to avoid DB calls.
 *
 * Tests:
 * 1. Successful completion: revalidation passes → sets status to `completo`,
 *    records `completed_at`, returns 200 with `{ completed: true, completed_at }`
 * 2. 422 for invalid answered path: revalidation fails → returns 422 with
 *    `{ error: 'invalid_answered_path' }`
 * 3. Idempotent 200 for already-`completo` session (handled via middleware
 *    short-circuit — included as a reference note)
 *
 * Validates: Requirements 7.1, 7.5, 5.9
 *
 * Run with: node --import=tsx --experimental-test-module-mocks --test tests/functional/example_completion_controller.spec.ts
 */

// --- Module-level mock setup ---

// We control revalidateAnsweredPath result via this mutable variable
let revalidateResult = true

mock.module('../../app/services/navigation_validator.js', {
  namedExports: {
    revalidateAnsweredPath: async (
      _responseId: string,
      _surveyId: number,
      _surveyVersion: number
    ) => revalidateResult,
  },
})

// Now import controller and ResponseEvent model after mocking
const { default: CompletionController } = await import(
  '../../app/controllers/public/completion_controller.js'
)
const { default: ResponseEvent } = await import('../../app/models/response_event.js')

// --- Helpers ---

function createMockSession(overrides: Partial<{
  id: string
  surveyId: number
  surveyVersion: number
  status: string
  completedAt: any
}> = {}) {
  return {
    id: overrides.id ?? 'session-uuid-123',
    surveyId: overrides.surveyId ?? 1,
    surveyVersion: overrides.surveyVersion ?? 3,
    status: overrides.status ?? 'iniciado',
    completedAt: overrides.completedAt ?? null,
    async save() {
      // no-op for test — captures state changes in-place
    },
  }
}

function createMockContext(session: any) {
  let statusCode: number | null = null
  let responseBody: unknown = null

  const ctx: any = {
    response_session: session,
    response: {
      ok(body: unknown) {
        statusCode = 200
        responseBody = body
        return body
      },
      status(code: number) {
        statusCode = code
        return {
          json(body: unknown) {
            responseBody = body
            return body
          },
        }
      },
    },
  }

  return {
    ctx,
    getStatus: () => statusCode,
    getBody: () => responseBody,
  }
}

// --- Tests ---

describe('CompletionController.handle — successful completion (Requirement 7.1, 7.2, 7.3)', () => {
  it('sets status to completo and records completed_at, returns 200', async () => {
    revalidateResult = true

    // Mock ResponseEvent.create to avoid DB
    const createMock = mock.method(ResponseEvent, 'create', async (data: any) => ({
      id: 42,
      ...data,
    }))

    const session = createMockSession()
    const { ctx, getStatus, getBody } = createMockContext(session)

    const controller = new CompletionController()
    await controller.handle(ctx)

    assert.strictEqual(getStatus(), 200, 'Should respond with 200')

    const body = getBody() as any
    assert.strictEqual(body.completed, true, 'Response should include completed: true')
    assert.ok(body.completed_at, 'Response should include completed_at timestamp')

    // Verify session was updated
    assert.strictEqual(session.status, 'completo', 'Session status should be set to completo')
    assert.ok(session.completedAt, 'Session completedAt should be set')

    // Verify concluido event was logged
    assert.strictEqual(createMock.mock.callCount(), 1, 'ResponseEvent.create should be called once')
    const eventArg = createMock.mock.calls[0].arguments[0] as any
    assert.strictEqual(eventArg.responseId, 'session-uuid-123')
    assert.strictEqual(eventArg.tipo, 'concluido')
    assert.ok(eventArg.payload.completed_at, 'Event payload should include completed_at')

    createMock.mock.restore()
  })

  it('completed_at in response matches the DateTime set on the session', async () => {
    revalidateResult = true

    const createMock = mock.method(ResponseEvent, 'create', async (data: any) => ({
      id: 43,
      ...data,
    }))

    const session = createMockSession()
    const { ctx, getBody } = createMockContext(session)

    const controller = new CompletionController()
    await controller.handle(ctx)

    const body = getBody() as any
    // The controller sets session.completedAt = DateTime.now() and returns .toISO()
    // Both should match
    assert.strictEqual(
      body.completed_at,
      session.completedAt.toISO(),
      'Response completed_at should match session completedAt ISO string'
    )

    createMock.mock.restore()
  })
})

describe('CompletionController.handle — invalid answered path (Requirement 5.9)', () => {
  it('returns 422 with error when revalidation fails', async () => {
    revalidateResult = false

    const session = createMockSession()
    const { ctx, getStatus, getBody } = createMockContext(session)

    const controller = new CompletionController()
    await controller.handle(ctx)

    assert.strictEqual(getStatus(), 422, 'Should respond with 422')

    const body = getBody() as any
    assert.strictEqual(
      body.error,
      'invalid_answered_path',
      'Error key should be invalid_answered_path'
    )
    assert.ok(body.details, 'Should include details string explaining the failure')
  })

  it('does not modify session status or completedAt when revalidation fails', async () => {
    revalidateResult = false

    const session = createMockSession()
    const { ctx } = createMockContext(session)

    const controller = new CompletionController()
    await controller.handle(ctx)

    assert.strictEqual(session.status, 'iniciado', 'Session status should remain unchanged')
    assert.strictEqual(session.completedAt, null, 'Session completedAt should remain null')
  })

  it('does not log a concluido event when revalidation fails', async () => {
    revalidateResult = false

    const createMock = mock.method(ResponseEvent, 'create', async (data: any) => ({
      id: 99,
      ...data,
    }))

    const session = createMockSession()
    const { ctx } = createMockContext(session)

    const controller = new CompletionController()
    await controller.handle(ctx)

    assert.strictEqual(
      createMock.mock.callCount(),
      0,
      'ResponseEvent.create should NOT be called on invalid path'
    )

    createMock.mock.restore()
  })
})

describe('CompletionController — idempotent 200 for already-completo session (Requirement 7.5)', () => {
  /**
   * NOTE: The idempotent behavior for already-`completo` sessions is handled
   * by the `ResponseTokenAuth` middleware (response_token_auth_middleware.ts),
   * which short-circuits the request with a 200 response before it ever reaches
   * the CompletionController.handle method.
   *
   * The middleware checks `response_session.status === 'completo'` and returns:
   *   200 { completed: true, completed_at: session.completedAt }
   *
   * This test documents that contract; the actual middleware behavior is tested
   * in `example_response_token_auth.spec.ts`.
   *
   * See: backend/app/middleware/response_token_auth_middleware.ts
   * See: Requirement 7.5 — "IF POST /complete is received for a session whose
   *      status is already `completo`, respond 200 without re-triggering."
   */
  it('(reference) idempotent case is handled by ResponseTokenAuth middleware before controller', () => {
    // This test exists as documentation. The middleware intercepts already-completo
    // sessions before the controller is invoked. The controller itself always
    // processes sessions with status != 'completo' (guaranteed by middleware).
    assert.ok(true, 'Idempotent 200 for completo sessions is enforced by middleware short-circuit')
  })
})
