// Feature: public-response-flow, Example test: AnswerController
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'

/**
 * Unit-level example tests for the AnswerController.
 *
 * We import the controller class directly and invoke its `handle` method
 * with mock HttpContext objects. We monkey-patch the Question, ResponseAnswer,
 * and ResponseEvent models' `query` / `create` statics so no real database
 * connection is required.
 *
 * Tests:
 * 1. Successful answer save (returns 200 with `{ saved: true }`)
 * 2. 422 when `questionId` doesn't belong to the survey
 * 3. Deletion of invalidated answers when `invalidated_question_ids` is provided
 * 4. 401 for missing/invalid token (middleware integration)
 *
 * Validates: Requirements 4.9, 4.10, 9.1
 *
 * Run with: node --import=tsx --test tests/functional/example_answer_controller.spec.ts
 */

import AnswerController from '../../app/controllers/public/answer_controller.js'
import Question from '../../app/models/question.js'
import ResponseAnswer from '../../app/models/response_answer.js'
import ResponseEvent from '../../app/models/response_event.js'
import ResponseTokenAuthMiddleware from '../../app/middleware/response_token_auth_middleware.js'
import Response from '../../app/models/response.js'

// Store original statics for cleanup
const originalQuestionQuery = Question.query
const originalResponseAnswerQuery = ResponseAnswer.query
const originalResponseAnswerCreate = ResponseAnswer.create
const originalResponseEventCreate = ResponseEvent.create
const originalResponseQuery = Response.query

afterEach(() => {
  ;(Question as any).query = originalQuestionQuery
  ;(ResponseAnswer as any).query = originalResponseAnswerQuery
  ;(ResponseAnswer as any).create = originalResponseAnswerCreate
  ;(ResponseEvent as any).create = originalResponseEventCreate
  ;(Response as any).query = originalResponseQuery
})

/**
 * Creates a mock HttpContext suitable for AnswerController.handle.
 * The `response_session` property simulates what the middleware attaches.
 */
function createMockContext(opts: {
  params: Record<string, string>
  body: Record<string, unknown>
  responseSession?: { id: string; surveyId: number; status: string } | null
}) {
  let statusCode: number | null = null
  let responseBody: unknown = null

  const ctx: any = {
    params: opts.params,
    response_session: opts.responseSession ?? null,
    request: {
      validateUsing: async (_validator: unknown) => opts.body,
    },
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

describe('AnswerController.handle — successful save (Requirement 4.9)', () => {
  it('returns 200 with { saved: true } for a valid option answer', async () => {
    const createdAnswers: any[] = []
    let eventCreated: any = null
    let deletedWhere: any[] = []

    // Question belongs to the survey
    ;(Question as any).query = () => {
      const builder: any = {
        where() { return builder },
        first: async () => ({ id: 10, surveyId: 1 }),
      }
      return builder
    }

    // Upsert: delete old answers (returns mock builder with delete)
    ;(ResponseAnswer as any).query = () => {
      const builder: any = {
        where(col: string, val: unknown) {
          deletedWhere.push({ col, val })
          return builder
        },
        whereIn() { return builder },
        delete: async () => 0,
      }
      return builder
    }

    // Create new answer rows
    ;(ResponseAnswer as any).create = async (data: any) => {
      createdAnswers.push(data)
      return { id: 1, ...data }
    }

    // Log event
    ;(ResponseEvent as any).create = async (data: any) => {
      eventCreated = data
      return { id: 42, ...data }
    }

    const { ctx, getStatus, getBody } = createMockContext({
      params: { token: 'valid-token', questionId: '10' },
      body: { question_option_ids: [101], invalidated_question_ids: [] },
      responseSession: { id: 'resp-uuid-1', surveyId: 1, status: 'iniciado' },
    })

    const controller = new AnswerController()
    await controller.handle(ctx)

    assert.strictEqual(getStatus(), 200, 'Should respond with 200')
    assert.deepStrictEqual(getBody(), { saved: true })

    // Verify answer was created with correct data
    assert.strictEqual(createdAnswers.length, 1)
    assert.strictEqual(createdAnswers[0].responseId, 'resp-uuid-1')
    assert.strictEqual(createdAnswers[0].questionId, 10)
    assert.strictEqual(createdAnswers[0].questionOptionId, 101)
    assert.strictEqual(createdAnswers[0].textoLivre, null)

    // Verify event was logged
    assert.ok(eventCreated, 'Should log a response event')
    assert.strictEqual(eventCreated.responseId, 'resp-uuid-1')
    assert.strictEqual(eventCreated.tipo, 'pergunta_respondida')
    assert.strictEqual(eventCreated.payload.question_id, 10)
    assert.ok(eventCreated.payload.timestamp, 'Event payload should include timestamp')
  })

  it('returns 200 with { saved: true } for a text (aberta) answer', async () => {
    const createdAnswers: any[] = []

    ;(Question as any).query = () => {
      const builder: any = {
        where() { return builder },
        first: async () => ({ id: 20, surveyId: 1 }),
      }
      return builder
    }

    ;(ResponseAnswer as any).query = () => {
      const builder: any = {
        where() { return builder },
        whereIn() { return builder },
        delete: async () => 0,
      }
      return builder
    }

    ;(ResponseAnswer as any).create = async (data: any) => {
      createdAnswers.push(data)
      return { id: 2, ...data }
    }

    ;(ResponseEvent as any).create = async (data: any) => ({ id: 43, ...data })

    const { ctx, getStatus, getBody } = createMockContext({
      params: { token: 'valid-token', questionId: '20' },
      body: { texto_livre: 'My open text answer', invalidated_question_ids: [] },
      responseSession: { id: 'resp-uuid-2', surveyId: 1, status: 'iniciado' },
    })

    const controller = new AnswerController()
    await controller.handle(ctx)

    assert.strictEqual(getStatus(), 200)
    assert.deepStrictEqual(getBody(), { saved: true })

    // Verify text answer was created
    assert.strictEqual(createdAnswers.length, 1)
    assert.strictEqual(createdAnswers[0].responseId, 'resp-uuid-2')
    assert.strictEqual(createdAnswers[0].questionId, 20)
    assert.strictEqual(createdAnswers[0].questionOptionId, null)
    assert.strictEqual(createdAnswers[0].textoLivre, 'My open text answer')
  })

  it('returns 200 with { saved: true } for multiple-choice answer', async () => {
    const createdAnswers: any[] = []

    ;(Question as any).query = () => {
      const builder: any = {
        where() { return builder },
        first: async () => ({ id: 30, surveyId: 1 }),
      }
      return builder
    }

    ;(ResponseAnswer as any).query = () => {
      const builder: any = {
        where() { return builder },
        whereIn() { return builder },
        delete: async () => 0,
      }
      return builder
    }

    ;(ResponseAnswer as any).create = async (data: any) => {
      createdAnswers.push(data)
      return { id: createdAnswers.length, ...data }
    }

    ;(ResponseEvent as any).create = async (data: any) => ({ id: 44, ...data })

    const { ctx, getStatus, getBody } = createMockContext({
      params: { token: 'valid-token', questionId: '30' },
      body: { question_option_ids: [200, 203, 205], invalidated_question_ids: [] },
      responseSession: { id: 'resp-uuid-3', surveyId: 1, status: 'iniciado' },
    })

    const controller = new AnswerController()
    await controller.handle(ctx)

    assert.strictEqual(getStatus(), 200)
    assert.deepStrictEqual(getBody(), { saved: true })

    // One row per selected option
    assert.strictEqual(createdAnswers.length, 3)
    assert.strictEqual(createdAnswers[0].questionOptionId, 200)
    assert.strictEqual(createdAnswers[1].questionOptionId, 203)
    assert.strictEqual(createdAnswers[2].questionOptionId, 205)
  })
})

describe('AnswerController.handle — 422 for questionId not in survey (Requirement 4.10)', () => {
  it('returns 422 when questionId does not belong to the session survey', async () => {
    // Question query returns null (not found for this survey)
    ;(Question as any).query = () => {
      const builder: any = {
        where() { return builder },
        first: async () => null,
      }
      return builder
    }

    const { ctx, getStatus, getBody } = createMockContext({
      params: { token: 'valid-token', questionId: '999' },
      body: { question_option_ids: [101], invalidated_question_ids: [] },
      responseSession: { id: 'resp-uuid-1', surveyId: 1, status: 'iniciado' },
    })

    const controller = new AnswerController()
    await controller.handle(ctx)

    assert.strictEqual(getStatus(), 422, 'Should respond with 422')
    const body = getBody() as any
    assert.strictEqual(body.error, 'question_not_in_survey')
    assert.ok(body.message, 'Should include an error message')
  })
})

describe('AnswerController.handle — deletion of invalidated answers (Requirement 4.9)', () => {
  it('deletes answers for invalidated_question_ids when provided', async () => {
    let deletedInvalidatedIds: number[] = []

    ;(Question as any).query = () => {
      const builder: any = {
        where() { return builder },
        first: async () => ({ id: 10, surveyId: 1 }),
      }
      return builder
    }

    let queryCallCount = 0
    ;(ResponseAnswer as any).query = () => {
      queryCallCount++
      const builder: any = {
        where() { return builder },
        whereIn(_col: string, ids: number[]) {
          deletedInvalidatedIds = ids
          return builder
        },
        delete: async () => deletedInvalidatedIds.length,
      }
      return builder
    }

    ;(ResponseAnswer as any).create = async (data: any) => ({ id: 1, ...data })
    ;(ResponseEvent as any).create = async (data: any) => ({ id: 45, ...data })

    const { ctx, getStatus, getBody } = createMockContext({
      params: { token: 'valid-token', questionId: '10' },
      body: { question_option_ids: [102], invalidated_question_ids: [15, 16, 17] },
      responseSession: { id: 'resp-uuid-1', surveyId: 1, status: 'iniciado' },
    })

    const controller = new AnswerController()
    await controller.handle(ctx)

    assert.strictEqual(getStatus(), 200)
    assert.deepStrictEqual(getBody(), { saved: true })

    // Verify invalidated answers were targeted for deletion
    assert.deepStrictEqual(
      deletedInvalidatedIds,
      [15, 16, 17],
      'Should delete answers for the invalidated question IDs'
    )
  })

  it('does not attempt deletion when invalidated_question_ids is empty', async () => {
    let deleteCallCount = 0

    ;(Question as any).query = () => {
      const builder: any = {
        where() { return builder },
        first: async () => ({ id: 10, surveyId: 1 }),
      }
      return builder
    }

    ;(ResponseAnswer as any).query = () => {
      const builder: any = {
        where() { return builder },
        whereIn() {
          return builder
        },
        delete: async () => {
          deleteCallCount++
          return 0
        },
      }
      return builder
    }

    ;(ResponseAnswer as any).create = async (data: any) => ({ id: 1, ...data })
    ;(ResponseEvent as any).create = async (data: any) => ({ id: 46, ...data })

    const { ctx, getStatus } = createMockContext({
      params: { token: 'valid-token', questionId: '10' },
      body: { question_option_ids: [101], invalidated_question_ids: [] },
      responseSession: { id: 'resp-uuid-1', surveyId: 1, status: 'iniciado' },
    })

    const controller = new AnswerController()
    await controller.handle(ctx)

    assert.strictEqual(getStatus(), 200)
    // The controller checks `invalidatedIds.length > 0` before issuing the delete query
    // so delete should only be called once (the upsert delete), not for invalidation
    assert.strictEqual(deleteCallCount, 1, 'Only the upsert delete should be called, not the invalidation delete')
  })
})

describe('ResponseTokenAuth middleware — 401 for missing/invalid token (Requirement 9.1)', () => {
  it('returns 401 when token param is missing', async () => {
    let statusCode: number | null = null
    let responseBody: unknown = null

    const ctx: any = {
      params: {},
      request: {
        url: () => '/api/public/responses//answers/10',
      },
      response: {
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

    const middleware = new ResponseTokenAuthMiddleware()
    await middleware.handle(ctx, async () => {})

    assert.strictEqual(statusCode, 401, 'Should respond with 401')
    assert.deepStrictEqual(responseBody, { error: 'invalid_token' })
  })

  it('returns 401 when token does not match any session', async () => {
    let statusCode: number | null = null
    let responseBody: unknown = null

    ;(Response as any).query = () => {
      const builder: any = {
        where() { return builder },
        first: async () => null,
      }
      return builder
    }

    const ctx: any = {
      params: { token: 'nonexistent-token' },
      request: {
        url: () => '/api/public/responses/nonexistent-token/answers/10',
      },
      response: {
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

    const middleware = new ResponseTokenAuthMiddleware()
    await middleware.handle(ctx, async () => {})

    assert.strictEqual(statusCode, 401, 'Should respond with 401')
    assert.deepStrictEqual(responseBody, { error: 'invalid_token' })
  })

  it('attaches response_session and calls next when token is valid', async () => {
    const fakeSession = {
      id: 'resp-uuid-1',
      surveyId: 1,
      status: 'iniciado',
      token: 'valid-token',
    }

    ;(Response as any).query = () => {
      const builder: any = {
        where() { return builder },
        first: async () => fakeSession,
      }
      return builder
    }

    let nextCalled = false
    const ctx: any = {
      params: { token: 'valid-token' },
      request: {
        url: () => '/api/public/responses/valid-token/answers/10',
      },
      response: {
        status() {
          return { json() {} }
        },
      },
    }

    const middleware = new ResponseTokenAuthMiddleware()
    await middleware.handle(ctx, async () => {
      nextCalled = true
    })

    assert.strictEqual(nextCalled, true, 'Should call next() for valid token')
    assert.strictEqual(ctx.response_session, fakeSession, 'Should attach session to ctx')
  })
})
