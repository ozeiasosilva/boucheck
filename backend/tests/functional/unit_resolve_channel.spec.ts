/**
 * Unit tests for resolveChannel pure function.
 *
 * Validates Requirements: 8.2, 8.3, 8.4, 8.5
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { resolveChannel } from '../../app/services/resend_service.js'
import type { DeliveryChannel } from '../../app/services/resend_service.js'

describe('resolveChannel', () => {
  describe('Req 8.2 - explicit channel specified', () => {
    it('returns resolved when explicit channel is in failedChannels', () => {
      const result = resolveChannel('email', new Set<DeliveryChannel>(['email']))
      assert.deepStrictEqual(result, { kind: 'resolved', channel: 'email' })
    })

    it('returns resolved for whatsapp when whatsapp is in failedChannels', () => {
      const result = resolveChannel('whatsapp', new Set<DeliveryChannel>(['whatsapp', 'email']))
      assert.deepStrictEqual(result, { kind: 'resolved', channel: 'whatsapp' })
    })

    it('returns not_found when explicit channel is not in failedChannels', () => {
      const result = resolveChannel('email', new Set<DeliveryChannel>(['whatsapp']))
      assert.deepStrictEqual(result, { kind: 'not_found' })
    })

    it('returns not_found when explicit channel given but failedChannels is empty', () => {
      const result = resolveChannel('email', new Set<DeliveryChannel>())
      assert.deepStrictEqual(result, { kind: 'not_found' })
    })
  })

  describe('Req 8.3 - no explicit channel, exactly one failed channel', () => {
    it('defaults to the single failed channel (email)', () => {
      const result = resolveChannel(undefined, new Set<DeliveryChannel>(['email']))
      assert.deepStrictEqual(result, { kind: 'resolved', channel: 'email' })
    })

    it('defaults to the single failed channel (whatsapp)', () => {
      const result = resolveChannel(undefined, new Set<DeliveryChannel>(['whatsapp']))
      assert.deepStrictEqual(result, { kind: 'resolved', channel: 'whatsapp' })
    })
  })

  describe('Req 8.4 - no explicit channel, more than one failed channel', () => {
    it('returns ambiguous when both channels failed', () => {
      const result = resolveChannel(undefined, new Set<DeliveryChannel>(['email', 'whatsapp']))
      assert.deepStrictEqual(result, { kind: 'ambiguous' })
    })
  })

  describe('Req 8.5 - no failed events for resolved channel', () => {
    it('returns not_found when failedChannels is empty and no explicit channel', () => {
      const result = resolveChannel(undefined, new Set<DeliveryChannel>())
      assert.deepStrictEqual(result, { kind: 'not_found' })
    })
  })
})
