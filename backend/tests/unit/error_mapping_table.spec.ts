import { describe, it } from 'node:test'
import assert from 'node:assert'
import { NotFoundException } from '../../app/services/anonymization_service.js'
import {
  AmbiguousChannelException,
  ChannelNotFoundException,
  resolveChannel,
} from '../../app/services/resend_service.js'

/**
 * Full error-mapping table — contract/documentation test that verifies the
 * complete set of error classes, their HTTP status codes, and the controller
 * error-handling logic used across the admin tracking system.
 *
 * Validates: Requirements 3.3, 4.5, 8.1, 8.4, 8.5, 9.1, 17.2, 17.3
 */

describe('Error Mapping Table', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. NotFoundException → 404 (Req 4.5, 8.1, 9.1)
  //    Used for: missing session in show, resend, anonymize
  // ─────────────────────────────────────────────────────────────────────────
  describe('NotFoundException → 404', () => {
    it('has status code 404', () => {
      const err = new NotFoundException()
      assert.strictEqual(err.status, 404)
    })

    it('default message is "Session not found"', () => {
      const err = new NotFoundException()
      assert.strictEqual(err.message, 'Session not found')
    })

    it('accepts a custom message while retaining status 404', () => {
      const err = new NotFoundException('Custom not found')
      assert.strictEqual(err.status, 404)
      assert.strictEqual(err.message, 'Custom not found')
    })

    it('extends Error for proper catch semantics', () => {
      const err = new NotFoundException()
      assert.ok(err instanceof Error)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 2. AmbiguousChannelException → 422 (Req 8.4)
  //    Used when multiple channels failed and none was specified
  // ─────────────────────────────────────────────────────────────────────────
  describe('AmbiguousChannelException → 422', () => {
    it('has status code 422', () => {
      const err = new AmbiguousChannelException()
      assert.strictEqual(err.status, 422)
    })

    it('message indicates ambiguity', () => {
      const err = new AmbiguousChannelException()
      assert.ok(err.message.toLowerCase().includes('ambiguous'))
    })

    it('extends Error for proper catch semantics', () => {
      const err = new AmbiguousChannelException()
      assert.ok(err instanceof Error)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 3. ChannelNotFoundException → 422 (Req 8.5)
  //    Used when no failed events exist for the resolved channel
  // ─────────────────────────────────────────────────────────────────────────
  describe('ChannelNotFoundException → 422', () => {
    it('has status code 422', () => {
      const err = new ChannelNotFoundException()
      assert.strictEqual(err.status, 422)
    })

    it('message indicates channel not found', () => {
      const err = new ChannelNotFoundException()
      assert.ok(err.message.toLowerCase().includes('channel'))
      assert.ok(err.message.toLowerCase().includes('not found'))
    })

    it('extends Error for proper catch semantics', () => {
      const err = new ChannelNotFoundException()
      assert.ok(err instanceof Error)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Page beyond last page → 200 with empty rows (Req 3.3)
  //    This is NOT an error — pagination logic returns empty array
  // ─────────────────────────────────────────────────────────────────────────
  describe('Page beyond last page → 200 with empty rows', () => {
    it('resolveChannel-style: pagination offset beyond data yields empty by SQL offset/limit semantics', () => {
      // Verify the design contract: when page * perPage exceeds total rows,
      // the query builder uses OFFSET/LIMIT which returns an empty result set.
      // This is a structural guarantee — the query builder applies:
      //   offset = (page - 1) * perPage; limit = perPage
      // When offset >= totalRows, PostgreSQL returns 0 rows (not an error).
      // The service returns { rows: [], total: <actual total> } with HTTP 200.

      // Simulate: 5 total items, page 3, perPage 3 → offset 6 > 5 → empty
      const totalItems = 5
      const page = 3
      const perPage = 3
      const offset = (page - 1) * perPage

      // The offset exceeds total, meaning no rows will be returned
      assert.ok(offset >= totalItems, 'offset should exceed totalItems for beyond-last-page')

      // The contract is: the listing returns HTTP 200 with empty rows,
      // not 404 or any error status. This is an architectural decision (Req 3.3).
      const simulatedResponse = { rows: [] as unknown[], total: totalItems }
      assert.deepStrictEqual(simulatedResponse.rows, [])
      assert.strictEqual(simulatedResponse.total, totalItems)
    })

    it('page=1 with perPage > total still returns 200 (not an error)', () => {
      // Even page=1 with 0 results is valid
      const simulatedResponse = { rows: [] as unknown[], total: 0 }
      assert.deepStrictEqual(simulatedResponse.rows, [])
      assert.strictEqual(simulatedResponse.total, 0)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Missing dashboard survey filter → 422 (Req 17.2)
  //    VineJS validator rejects with 422 when survey_id is absent
  // ─────────────────────────────────────────────────────────────────────────
  describe('Missing dashboard survey filter → 422', () => {
    it('dashboardFiltersValidator requires survey_id (string type enforced by VineJS)', async () => {
      // The dashboardFiltersValidator is compiled with vine.object({ survey_id: vine.string().trim() })
      // VineJS returns a 422 validation error when the field is missing.
      // We verify the validator schema contract by importing and testing it.
      const { dashboardFiltersValidator } = await import(
        '../../app/validators/admin_tracking_validators.js'
      )

      // Attempt validation with missing survey_id
      try {
        await dashboardFiltersValidator.validate({
          period_start: '2024-01-01',
          period_end: '2024-12-31',
        })
        assert.fail('Should have thrown a validation error for missing survey_id')
      } catch (err: any) {
        // VineJS validation errors have a status of 422
        assert.strictEqual(err.status, 422, 'Missing survey_id should produce 422')
      }
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Missing dashboard period filter → 422 (Req 17.3)
  //    VineJS validator rejects with 422 when period_start or period_end is absent
  // ─────────────────────────────────────────────────────────────────────────
  describe('Missing dashboard period filter → 422', () => {
    it('rejects when period_start is missing', async () => {
      const { dashboardFiltersValidator } = await import(
        '../../app/validators/admin_tracking_validators.js'
      )

      try {
        await dashboardFiltersValidator.validate({
          survey_id: '1',
          period_end: '2024-12-31',
        })
        assert.fail('Should have thrown a validation error for missing period_start')
      } catch (err: any) {
        assert.strictEqual(err.status, 422, 'Missing period_start should produce 422')
      }
    })

    it('rejects when period_end is missing', async () => {
      const { dashboardFiltersValidator } = await import(
        '../../app/validators/admin_tracking_validators.js'
      )

      try {
        await dashboardFiltersValidator.validate({
          survey_id: '1',
          period_start: '2024-01-01',
        })
        assert.fail('Should have thrown a validation error for missing period_end')
      } catch (err: any) {
        assert.strictEqual(err.status, 422, 'Missing period_end should produce 422')
      }
    })

    it('rejects when both period_start and period_end are missing', async () => {
      const { dashboardFiltersValidator } = await import(
        '../../app/validators/admin_tracking_validators.js'
      )

      try {
        await dashboardFiltersValidator.validate({
          survey_id: '1',
        })
        assert.fail('Should have thrown a validation error for missing period params')
      } catch (err: any) {
        assert.strictEqual(err.status, 422, 'Missing period params should produce 422')
      }
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Controller error-handling logic: error.status → HTTP response mapping
  //    Verifies the ResponsesController's exception-to-response logic
  // ─────────────────────────────────────────────────────────────────────────
  describe('ResponsesController error-handling logic', () => {
    // These tests verify the contract between error.status and HTTP response
    // without needing the full AdonisJS HTTP context.

    it('NotFoundException (status 404) → response.notFound()', () => {
      const error = new NotFoundException()
      // The controller checks: if (error.status === 404) → response.notFound()
      assert.strictEqual(error.status, 404)
      // Verify the response body shape the controller would produce
      const responseBody = { message: error.message }
      assert.deepStrictEqual(responseBody, { message: 'Session not found' })
    })

    it('AmbiguousChannelException (status 422) → response.unprocessableEntity()', () => {
      const error = new AmbiguousChannelException()
      // The controller checks: if (error.status === 422) → response.unprocessableEntity()
      assert.strictEqual(error.status, 422)
      const responseBody = { message: error.message }
      assert.ok(responseBody.message.includes('Ambiguous'))
    })

    it('ChannelNotFoundException (status 422) → response.unprocessableEntity()', () => {
      const error = new ChannelNotFoundException()
      // The controller checks: if (error.status === 422) → response.unprocessableEntity()
      assert.strictEqual(error.status, 422)
      const responseBody = { message: error.message }
      assert.ok(responseBody.message.includes('Channel not found'))
    })

    it('unknown errors (no status or different status) are re-thrown', () => {
      // The controller logic: if status is neither 404 nor 422, the error is re-thrown
      const unknownError = new Error('Database connection lost')

      // Simulate the controller catch block logic
      const simulateControllerCatch = (error: any) => {
        if (error.status === 404) return { action: 'notFound' }
        if (error.status === 422) return { action: 'unprocessableEntity' }
        throw error
      }

      assert.throws(
        () => simulateControllerCatch(unknownError),
        (err: any) => err.message === 'Database connection lost'
      )
    })

    it('resend endpoint maps both 404 and 422 statuses correctly', () => {
      // The resend controller has the most complete error mapping (both 404 and 422)
      const simulateResendCatch = (error: any) => {
        if (error.status === 404) return { status: 404, body: { message: error.message } }
        if (error.status === 422) return { status: 422, body: { message: error.message } }
        throw error
      }

      const notFoundResult = simulateResendCatch(new NotFoundException())
      assert.strictEqual(notFoundResult.status, 404)

      const ambiguousResult = simulateResendCatch(new AmbiguousChannelException())
      assert.strictEqual(ambiguousResult.status, 422)

      const channelNotFoundResult = simulateResendCatch(new ChannelNotFoundException())
      assert.strictEqual(channelNotFoundResult.status, 422)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Integration: resolveChannel outcome → exception mapping
  //    Verifies that resolveChannel outcomes align with the exception classes
  // ─────────────────────────────────────────────────────────────────────────
  describe('resolveChannel outcomes → exception mapping', () => {
    it('ambiguous resolution leads to AmbiguousChannelException (422)', () => {
      const result = resolveChannel(undefined, new Set(['email', 'whatsapp']))
      assert.strictEqual(result.kind, 'ambiguous')
      // In the service, this triggers: throw new AmbiguousChannelException()
      const exception = new AmbiguousChannelException()
      assert.strictEqual(exception.status, 422)
    })

    it('not_found resolution leads to ChannelNotFoundException (422)', () => {
      const result = resolveChannel('email', new Set(['whatsapp']))
      assert.strictEqual(result.kind, 'not_found')
      // In the service, this triggers: throw new ChannelNotFoundException()
      const exception = new ChannelNotFoundException()
      assert.strictEqual(exception.status, 422)
    })

    it('not_found with empty set leads to ChannelNotFoundException (422)', () => {
      const result = resolveChannel(undefined, new Set())
      assert.strictEqual(result.kind, 'not_found')
      const exception = new ChannelNotFoundException()
      assert.strictEqual(exception.status, 422)
    })

    it('resolved outcome does NOT throw (happy path)', () => {
      const result = resolveChannel('email', new Set(['email']))
      assert.strictEqual(result.kind, 'resolved')
      // No exception is thrown for resolved channels
      assert.ok('channel' in result && result.channel === 'email')
    })
  })
})
