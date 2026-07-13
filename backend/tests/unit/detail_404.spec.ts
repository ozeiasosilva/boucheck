import { describe, it, mock } from 'node:test'
import assert from 'node:assert'

// Mock the @adonisjs/lucid/services/db module before importing services
// that transitively depend on it (SessionQueryBuilder → db)
mock.module('@adonisjs/lucid/services/db', { namedExports: {}, defaultExport: {} })

const { ResponseTrackingService } = await import(
  '../../app/services/response_tracking_service.js'
)
const { NotFoundException } = await import('../../app/services/anonymization_service.js')
const { default: Response } = await import('../../app/models/response.js')

/**
 * Unit tests for detail 404 behavior.
 * Validates: Requirements 4.5
 */

describe('ResponseTrackingService - detail with non-existent session id', () => {
  it('throws NotFoundException when session id does not exist', async () => {
    // Mock Response.find to return null (session not found)
    const findMock = mock.method(Response, 'find', async () => null)

    const service = new ResponseTrackingService()

    await assert.rejects(
      () => service.detail('non-existent-session-id'),
      (err: unknown) => {
        assert.ok(err instanceof NotFoundException)
        assert.strictEqual(err.message, 'Session not found')
        return true
      }
    )

    assert.strictEqual(findMock.mock.callCount(), 1)
    assert.deepStrictEqual(findMock.mock.calls[0].arguments, ['non-existent-session-id'])

    findMock.mock.restore()
  })

  it('the thrown error has status 404', async () => {
    const findMock = mock.method(Response, 'find', async () => null)

    const service = new ResponseTrackingService()

    await assert.rejects(
      () => service.detail('another-missing-id'),
      (err: unknown) => {
        assert.ok(err instanceof NotFoundException)
        assert.strictEqual(err.status, 404)
        return true
      }
    )

    findMock.mock.restore()
  })
})
