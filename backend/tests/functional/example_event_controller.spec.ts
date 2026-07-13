// Feature: public-response-flow, Example test: EventController
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'

/**
 * Unit-level example tests for the EventController.
 *
 * We import the controller class directly and invoke its `handle` method
 * with mock HttpContext objects. We monkey-patch the ResponseEvent model's
 * `create` static so no real database connection is required.
 *
 * Tests:
 * 1. Accepted recognized event type → creates event, returns 201 with { event_id }
 * 2. 422 for unrecognized event type (validation rejection)
 * 3. 401 for invalid token (middleware handled — reference test)
 *
 * Validates: Requirements 8.1, 8.3, 9.1
 *
 * Run with: node --import=tsx --test tests/functional/example_event_controller.spec.ts
 */

import EventController from '../../app/controllers/public/event_controller.js'
import ResponseEvent from '../../app/models/response_event.js'

// Store original create method for cleanup
const originalCreate = ResponseEvent.create

afterEach(() => {
  ;(ResponseEvent as any).create = originalCreate
})

function createMockContext(options: {
  responseSession?: { id: string } | null
  validateResult?: unknown
  validateError?: Error | null
}) {
  let statusCode: number | null = null
  let responseBody: unknown = null

  const ctx: any = {
    response_session: options.responseSession ?? null,
    request: {
      async validateUsing(_validator: unknown) {
        if (options.validateError) {
          throw options.validateError
        }
        return options.validateResult
      },
    },
    response: {
      created(body: unknown) {
        statusCode = 201
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
          send(body: unknown) {
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

describe('EventController.handle (Requirement 8.1, 8.3)', () => {
  it('returns 201 with event_id for a recognized event type', async () => {
    const fakeEvent = { id: 42 }

    ;(ResponseEvent as any).create = async (_data: unknown) => fakeEvent

    const { ctx, getStatus, getBody } = createMockContext({
      responseSession: { id: 'session-uuid-123' },
      validateResult: { tipo: 'pagina_acessada', payload: { slug: 'maturidadeti' } },
    })

    const controller = new EventController()
    await controller.handle(ctx)

    assert.strictEqual(getStatus(), 201, 'Should respond with 201')
    const body = getBody() as any
    assert.strictEqual(body.event_id, 42, 'Should return the created event id')
  })

  it('passes correct data to ResponseEvent.create', async () => {
    let capturedData: any = null
    ;(ResponseEvent as any).create = async (data: unknown) => {
      capturedData = data
      return { id: 99 }
    }

    const { ctx } = createMockContext({
      responseSession: { id: 'response-abc' },
      validateResult: { tipo: 'pergunta_respondida', payload: { question_id: 10 } },
    })

    const controller = new EventController()
    await controller.handle(ctx)

    assert.strictEqual(capturedData.responseId, 'response-abc')
    assert.strictEqual(capturedData.tipo, 'pergunta_respondida')
    assert.deepStrictEqual(capturedData.payload, { question_id: 10 })
  })

  it('passes null payload when payload is not provided', async () => {
    let capturedData: any = null
    ;(ResponseEvent as any).create = async (data: unknown) => {
      capturedData = data
      return { id: 100 }
    }

    const { ctx } = createMockContext({
      responseSession: { id: 'response-xyz' },
      validateResult: { tipo: 'concluido', payload: undefined },
    })

    const controller = new EventController()
    await controller.handle(ctx)

    assert.strictEqual(capturedData.payload, null, 'payload should be null when not provided')
  })

  it('throws 422 for an unrecognized event type (Requirement 8.3)', async () => {
    // Simulate VineJS ValidationException for an invalid tipo
    const validationError = new Error('Validation failed')
    ;(validationError as any).status = 422
    ;(validationError as any).messages = [
      { field: 'tipo', message: 'The selected tipo is invalid' },
    ]

    const { ctx } = createMockContext({
      responseSession: { id: 'session-uuid-123' },
      validateError: validationError,
    })

    const controller = new EventController()

    await assert.rejects(
      async () => controller.handle(ctx),
      (err: any) => {
        assert.strictEqual(err.status, 422, 'Should have 422 status on the error')
        assert.ok(err.messages, 'Should have validation messages')
        return true
      }
    )
  })
})

describe('EventController authorization (Requirement 9.1)', () => {
  it('401 for invalid token is handled by response_token_auth middleware before controller', async () => {
    /**
     * The ResponseTokenAuth middleware intercepts requests with missing or
     * invalid tokens and responds 401 BEFORE the controller is reached.
     * Therefore the controller itself never receives a request without a
     * valid `response_session` on the context.
     *
     * This test documents this architectural decision: the 401 behavior
     * is tested at the middleware level (see response_token_auth middleware
     * tests). Here we verify that the controller correctly relies on the
     * `response_session` being present — if it were null, the code would
     * throw (accessing `.id` on null).
     */
    const { ctx } = createMockContext({
      responseSession: null,
      validateResult: { tipo: 'pagina_acessada', payload: {} },
    })

    const controller = new EventController()

    await assert.rejects(
      async () => controller.handle(ctx),
      (err: any) => {
        // Accessing .id on null/undefined throws a TypeError
        assert.ok(
          err instanceof TypeError,
          'Should throw TypeError when response_session is null (middleware not applied)'
        )
        return true
      }
    )
  })
})
