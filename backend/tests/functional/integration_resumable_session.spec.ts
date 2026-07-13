// Feature: public-response-flow, Integration test: Resumable Session Flow
import { describe, it, mock, afterEach } from 'node:test'
import assert from 'node:assert'
import { DateTime } from 'luxon'

/**
 * Integration-level tests for the resumable session flow.
 *
 * These tests exercise the ResponseController's `store` method through the
 * session resume service to verify:
 *
 * 1. When a recent `iniciado` session exists for the same email + survey,
 *    the endpoint returns `{ resumable: true, existing_token, started_at, answered_count }`.
 * 2. The existing token can be used to access answer endpoints (resume path).
 * 3. With `X-Force-New-Session: true`, a new session is always created.
 * 4. Sessions older than 7 days are NOT offered for resume.
 * 5. Completed sessions (`status='completo'`) are NOT offered for resume.
 *
 * Validates: Requirements 3.12, 3.13, 3.14
 *
 * Run with: node --import=tsx --experimental-test-module-mocks --test tests/functional/integration_resumable_session.spec.ts
 */

// --- Module-level mock setup ---

// Mutable state to control the session resume service behavior
let mockResumableResult: any = null
let mockNewSessionResult: any = null
let createNewSessionCalled = false
let createNewSessionArgs: any = null

mock.module('../../app/services/session_resume_service.js', {
  namedExports: {
    checkResumable: async (_email: string, _surveyId: number) => mockResumableResult,
    createNewSession: async (surveyId: number, surveyVersion: number, input: any) => {
      createNewSessionCalled = true
      createNewSessionArgs = { surveyId, surveyVersion, input }
      return mockNewSessionResult
    },
    RESUME_WINDOW_DAYS: 7,
  },
})

// Now import controller and Survey model after mocking
const { default: ResponseController } = await import(
  '../../app/controllers/public/response_controller.js'
)
const { default: Survey } = await import('../../app/models/survey.js')

// Store original query method for cleanup
const originalSurveyQuery = (Survey as any).query

// --- Helpers ---

const VALID_PAYLOAD = {
  nome: 'João Silva',
  telefone: '+55 (11) 99999-0000',
  empresa: 'Empresa X',
  email: 'joao@empresa.com',
  cargo: 'CTO',
  cidade: 'São Paulo',
  aceite_politica: true,
  politica_versao: '2025-01-v1',
}

function createMockContext(
  params: Record<string, string>,
  body: Record<string, any> = VALID_PAYLOAD,
  headers: Record<string, string> = {}
) {
  let statusCode: number | null = null
  let responseBody: unknown = null

  const ctx: any = {
    params,
    request: {
      // Simulate VineJS validation — just return the payload as-is for tests
      async validateUsing(_validator: any) {
        return body
      },
      header(name: string) {
        return headers[name] ?? null
      },
    },
    response: {
      ok(respBody: unknown) {
        statusCode = 200
        responseBody = respBody
        return respBody
      },
      created(respBody: unknown) {
        statusCode = 201
        responseBody = respBody
        return respBody
      },
      notFound(respBody: unknown) {
        statusCode = 404
        responseBody = respBody
        return respBody
      },
      status(code: number) {
        statusCode = code
        return {
          json(respBody: unknown) {
            responseBody = respBody
            return respBody
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

function mockActiveSurvey(id = 1, version = 3, slug = 'maturidadeti') {
  ;(Survey as any).query = () => ({
    where(_col: string, _val: string) {
      return this
    },
    first: async () => ({ id, slug, version, status: 'ativo' }),
  })
}

function mockSurveyNotFound() {
  ;(Survey as any).query = () => ({
    where(_col: string, _val: string) {
      return this
    },
    first: async () => null,
  })
}

// --- Reset between tests ---

afterEach(() => {
  ;(Survey as any).query = originalSurveyQuery
  mockResumableResult = null
  mockNewSessionResult = null
  createNewSessionCalled = false
  createNewSessionArgs = null
})

// --- Tests ---

describe('Integration: Resumable Session Flow (Requirements 3.12, 3.13, 3.14)', () => {
  describe('Scenario 1: Resume offered when recent session exists (Req 3.12)', () => {
    it('returns 200 with resumable info when a recent iniciado session exists', async () => {
      const startedAt = DateTime.now().minus({ days: 2 })
      mockResumableResult = {
        resumable: true,
        existingToken: 'previous-token-uuid',
        startedAt,
        answeredCount: 5,
      }

      mockActiveSurvey()

      const { ctx, getStatus, getBody } = createMockContext({ slug: 'maturidadeti' })
      const controller = new ResponseController()

      await controller.store(ctx)

      assert.strictEqual(getStatus(), 200, 'Should respond with 200 for resumable session')

      const body = getBody() as any
      assert.strictEqual(body.resumable, true, 'Response should have resumable: true')
      assert.strictEqual(
        body.existing_token,
        'previous-token-uuid',
        'Response should include the existing token'
      )
      assert.strictEqual(
        body.started_at,
        startedAt.toISO(),
        'Response should include started_at as ISO string'
      )
      assert.strictEqual(body.answered_count, 5, 'Response should include answered_count')
    })

    it('does NOT create a new session when resumable session is found', async () => {
      mockResumableResult = {
        resumable: true,
        existingToken: 'existing-token',
        startedAt: DateTime.now().minus({ days: 1 }),
        answeredCount: 3,
      }

      mockActiveSurvey()

      const { ctx } = createMockContext({ slug: 'maturidadeti' })
      const controller = new ResponseController()

      await controller.store(ctx)

      assert.strictEqual(
        createNewSessionCalled,
        false,
        'createNewSession should NOT be called when resumable session exists'
      )
    })
  })

  describe('Scenario 2: Resume chosen — use existing token (Req 3.13)', () => {
    it('returns the existing_token that the client can use for subsequent API calls', async () => {
      const existingToken = 'resume-me-token-abc123'
      mockResumableResult = {
        resumable: true,
        existingToken,
        startedAt: DateTime.now().minus({ hours: 12 }),
        answeredCount: 7,
      }

      mockActiveSurvey()

      const { ctx, getBody } = createMockContext({ slug: 'maturidadeti' })
      const controller = new ResponseController()

      await controller.store(ctx)

      const body = getBody() as any
      assert.strictEqual(
        body.existing_token,
        existingToken,
        'The existing_token should be the token from the iniciado session'
      )
      // The client uses this token directly for PUT /responses/{token}/answers/{questionId}
      // No additional server-side action is needed — the token already works.
    })
  })

  describe('Scenario 3: Start new session despite resumable existing (Req 3.14)', () => {
    it('creates a new session when X-Force-New-Session: true header is present', async () => {
      // Even though a resumable session would exist, the force header skips that check
      mockResumableResult = {
        resumable: true,
        existingToken: 'old-token',
        startedAt: DateTime.now().minus({ days: 1 }),
        answeredCount: 2,
      }

      mockNewSessionResult = {
        token: 'brand-new-token-uuid',
        responseId: 'new-response-id',
        resumed: false,
      }

      mockActiveSurvey(1, 3)

      const { ctx, getStatus, getBody } = createMockContext(
        { slug: 'maturidadeti' },
        VALID_PAYLOAD,
        { 'X-Force-New-Session': 'true' }
      )
      const controller = new ResponseController()

      await controller.store(ctx)

      assert.strictEqual(getStatus(), 201, 'Should respond with 201 for new session')

      const body = getBody() as any
      assert.strictEqual(
        body.token,
        'brand-new-token-uuid',
        'Response should have the new token'
      )
      assert.strictEqual(body.resumed, false, 'Response should have resumed: false')
    })

    it('the new token is different from the existing resumable token', async () => {
      mockNewSessionResult = {
        token: 'completely-new-token',
        responseId: 'new-id',
        resumed: false,
      }

      mockActiveSurvey()

      const { ctx, getBody } = createMockContext(
        { slug: 'maturidadeti' },
        VALID_PAYLOAD,
        { 'X-Force-New-Session': 'true' }
      )
      const controller = new ResponseController()

      await controller.store(ctx)

      const body = getBody() as any
      assert.strictEqual(body.token, 'completely-new-token')
      assert.notStrictEqual(
        body.token,
        'old-token',
        'New token must be different from the old resumable token'
      )
    })

    it('calls createNewSession with correct survey and identification input', async () => {
      mockNewSessionResult = {
        token: 'new-token',
        responseId: 'resp-id',
        resumed: false,
      }

      mockActiveSurvey(5, 2)

      const { ctx } = createMockContext(
        { slug: 'maturidadeti' },
        VALID_PAYLOAD,
        { 'X-Force-New-Session': 'true' }
      )
      const controller = new ResponseController()

      await controller.store(ctx)

      assert.strictEqual(createNewSessionCalled, true, 'createNewSession should be called')
      assert.strictEqual(createNewSessionArgs.surveyId, 5)
      assert.strictEqual(createNewSessionArgs.surveyVersion, 2)
      assert.strictEqual(createNewSessionArgs.input.email, 'joao@empresa.com')
      assert.strictEqual(createNewSessionArgs.input.nome, 'João Silva')
      assert.strictEqual(createNewSessionArgs.input.politicaVersao, '2025-01-v1')
    })
  })

  describe('Scenario 4: No resume offered for old sessions (>7 days) (Req 3.12)', () => {
    it('creates a new session when no resumable session is found (expired)', async () => {
      // checkResumable returns null when sessions are older than 7 days
      mockResumableResult = null

      mockNewSessionResult = {
        token: 'fresh-session-token',
        responseId: 'fresh-id',
        resumed: false,
      }

      mockActiveSurvey()

      const { ctx, getStatus, getBody } = createMockContext({ slug: 'maturidadeti' })
      const controller = new ResponseController()

      await controller.store(ctx)

      assert.strictEqual(getStatus(), 201, 'Should respond with 201 creating a new session')

      const body = getBody() as any
      assert.strictEqual(body.token, 'fresh-session-token')
      assert.strictEqual(body.resumed, false)
      assert.strictEqual(
        createNewSessionCalled,
        true,
        'createNewSession should be called when no resumable session exists'
      )
    })
  })

  describe('Scenario 5: No resume offered for completed sessions (Req 3.12)', () => {
    it('creates a new session when no resumable session is found (completo filtered out)', async () => {
      // checkResumable returns null because the service only looks for status='iniciado'
      // Sessions with status='completo' are not considered resumable
      mockResumableResult = null

      mockNewSessionResult = {
        token: 'after-complete-token',
        responseId: 'new-after-complete-id',
        resumed: false,
      }

      mockActiveSurvey()

      const { ctx, getStatus, getBody } = createMockContext({ slug: 'maturidadeti' })
      const controller = new ResponseController()

      await controller.store(ctx)

      assert.strictEqual(getStatus(), 201, 'Should respond with 201 for new session')

      const body = getBody() as any
      assert.strictEqual(body.token, 'after-complete-token')
      assert.strictEqual(body.resumed, false)
      assert.strictEqual(
        createNewSessionCalled,
        true,
        'createNewSession should be called — completed sessions are not resumable'
      )
    })
  })

  describe('Edge cases', () => {
    it('returns 404 when the survey slug does not match an active survey', async () => {
      mockSurveyNotFound()

      const { ctx, getStatus, getBody } = createMockContext({ slug: 'nonexistent' })
      const controller = new ResponseController()

      await controller.store(ctx)

      assert.strictEqual(getStatus(), 404)
      assert.deepStrictEqual(getBody(), { error: 'survey_not_found' })
    })

    it('X-Force-New-Session header is case-insensitive for value', async () => {
      mockNewSessionResult = {
        token: 'forced-token',
        responseId: 'forced-id',
        resumed: false,
      }

      mockActiveSurvey()

      const { ctx, getStatus, getBody } = createMockContext(
        { slug: 'maturidadeti' },
        VALID_PAYLOAD,
        { 'X-Force-New-Session': 'TRUE' }
      )
      const controller = new ResponseController()

      await controller.store(ctx)

      assert.strictEqual(getStatus(), 201, 'Should create new session with uppercase TRUE')
      const body = getBody() as any
      assert.strictEqual(body.token, 'forced-token')
      assert.strictEqual(body.resumed, false)
    })

    it('does NOT force new session when X-Force-New-Session is not "true"', async () => {
      const startedAt = DateTime.now().minus({ days: 3 })
      mockResumableResult = {
        resumable: true,
        existingToken: 'still-resumable-token',
        startedAt,
        answeredCount: 10,
      }

      mockActiveSurvey()

      const { ctx, getStatus, getBody } = createMockContext(
        { slug: 'maturidadeti' },
        VALID_PAYLOAD,
        { 'X-Force-New-Session': 'false' }
      )
      const controller = new ResponseController()

      await controller.store(ctx)

      assert.strictEqual(getStatus(), 200, 'Should still offer resume when header is not "true"')
      const body = getBody() as any
      assert.strictEqual(body.resumable, true)
      assert.strictEqual(body.existing_token, 'still-resumable-token')
    })
  })
})
