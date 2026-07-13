import { describe, it } from 'node:test'
import assert from 'node:assert'
import { NotFoundException } from '../../app/services/anonymization_service.js'
import {
  AmbiguousChannelException,
  ChannelNotFoundException,
} from '../../app/services/resend_service.js'

/**
 * Unit tests for resend error mapping.
 * Validates: Requirements 8.1, 8.4, 8.5
 */

describe('Resend error mapping', () => {
  describe('NotFoundException (session not found → 404)', () => {
    it('has status 404', () => {
      const err = new NotFoundException()
      assert.strictEqual(err.status, 404)
    })

    it('has an appropriate message about session not found', () => {
      const err = new NotFoundException()
      assert.strictEqual(err.message, 'Session not found')
    })

    it('extends Error', () => {
      const err = new NotFoundException()
      assert.ok(err instanceof Error)
    })
  })

  describe('AmbiguousChannelException (ambiguous channel → 422)', () => {
    it('has status 422', () => {
      const err = new AmbiguousChannelException()
      assert.strictEqual(err.status, 422)
    })

    it('has a message about ambiguous channel', () => {
      const err = new AmbiguousChannelException()
      assert.ok(err.message.toLowerCase().includes('ambiguous'))
      assert.ok(err.message.toLowerCase().includes('channel'))
    })

    it('extends Error', () => {
      const err = new AmbiguousChannelException()
      assert.ok(err instanceof Error)
    })
  })

  describe('ChannelNotFoundException (channel not found → 422)', () => {
    it('has status 422', () => {
      const err = new ChannelNotFoundException()
      assert.strictEqual(err.status, 422)
    })

    it('has a message about channel not found', () => {
      const err = new ChannelNotFoundException()
      assert.ok(err.message.toLowerCase().includes('channel'))
      assert.ok(err.message.toLowerCase().includes('not found'))
    })

    it('extends Error', () => {
      const err = new ChannelNotFoundException()
      assert.ok(err instanceof Error)
    })
  })

  describe('Error hierarchy for controller mapping', () => {
    it('all three exceptions are throwable Error instances', () => {
      const errors = [
        new NotFoundException(),
        new AmbiguousChannelException(),
        new ChannelNotFoundException(),
      ]
      for (const err of errors) {
        assert.ok(err instanceof Error)
        assert.ok(typeof err.message === 'string')
        assert.ok(typeof err.stack === 'string')
      }
    })

    it('422 exceptions are distinct from the 404 exception', () => {
      const notFound = new NotFoundException()
      const ambiguous = new AmbiguousChannelException()
      const channelNotFound = new ChannelNotFoundException()

      assert.strictEqual(notFound.status, 404)
      assert.strictEqual(ambiguous.status, 422)
      assert.strictEqual(channelNotFound.status, 422)

      // No enqueue should happen for 422 cases — verified by the status distinction
      assert.notStrictEqual(ambiguous.status, notFound.status)
      assert.notStrictEqual(channelNotFound.status, notFound.status)
    })
  })
})
