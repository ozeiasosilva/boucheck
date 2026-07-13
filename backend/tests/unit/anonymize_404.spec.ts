import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import {
  AnonymizationService,
  NotFoundException,
} from '../../app/services/anonymization_service.js'
import Response from '../../app/models/response.js'

/**
 * Unit tests for anonymize 404 behavior.
 * Validates: Requirements 9.1
 */

describe('AnonymizationService - anonymize with non-existent session id', () => {
  it('throws NotFoundException when session id does not exist', async () => {
    // Mock Response.find to return null (session not found)
    const findMock = mock.method(Response, 'find', async () => null)

    const service = new AnonymizationService()

    await assert.rejects(
      () => service.anonymize('non-existent-session-id'),
      (err: unknown) => {
        assert.ok(err instanceof NotFoundException)
        assert.strictEqual(err.status, 404)
        assert.strictEqual(err.message, 'Session not found')
        return true
      }
    )

    assert.strictEqual(findMock.mock.callCount(), 1)
    assert.deepStrictEqual(findMock.mock.calls[0].arguments, ['non-existent-session-id'])

    findMock.mock.restore()
  })

  it('NotFoundException has status 404 by default', () => {
    const error = new NotFoundException()
    assert.strictEqual(error.status, 404)
    assert.strictEqual(error.message, 'Session not found')
    assert.ok(error instanceof Error)
  })

  it('NotFoundException accepts a custom message', () => {
    const error = new NotFoundException('Custom message')
    assert.strictEqual(error.status, 404)
    assert.strictEqual(error.message, 'Custom message')
  })
})
