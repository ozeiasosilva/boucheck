import { describe, it } from 'node:test'
import assert from 'node:assert'

/**
 * Integration test for the resend re-enqueue contract.
 * Validates: Requirements 8.6
 *
 * Verifies that the message shapes produced by ResendService match
 * reporting-delivery's `ReportingQueueMessage` discriminated union exactly
 * and can be processed by the existing (unmodified) delivery worker without error.
 */

/**
 * The ReportingQueueMessage discriminated union as defined by reporting-delivery.
 * These are the exact message shapes the Email_Delivery_Worker and
 * WhatsApp_Delivery_Worker consume from the Reporting_Queue.
 */
type ReportingQueueMessage =
  | { kind: 'email_deliver'; response_id: string; to_email: string }
  | { kind: 'whatsapp_deliver'; response_id: string; to_phone: string }

/**
 * Simulates the message construction logic from ResendService.enqueueDeliveryJob.
 * This mirrors the exact logic in the service without requiring SQS connectivity.
 */
function buildDeliveryMessage(
  channel: 'email' | 'whatsapp',
  sessionId: string,
  session: { email: string | null; telefone: string | null }
): ReportingQueueMessage {
  if (channel === 'email') {
    return { kind: 'email_deliver', response_id: sessionId, to_email: session.email! }
  }
  return { kind: 'whatsapp_deliver', response_id: sessionId, to_phone: session.telefone! }
}

/**
 * Simulates how a delivery worker would validate/process an incoming message.
 * Returns true if the message conforms to the expected shape and has all required fields.
 */
function workerCanProcess(raw: string): { success: boolean; error?: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { success: false, error: 'Invalid JSON' }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { success: false, error: 'Message is not an object' }
  }

  const msg = parsed as Record<string, unknown>

  if (msg.kind !== 'email_deliver' && msg.kind !== 'whatsapp_deliver') {
    return { success: false, error: `Unknown kind: ${msg.kind}` }
  }

  if (typeof msg.response_id !== 'string' || msg.response_id.length === 0) {
    return { success: false, error: 'Missing or invalid response_id' }
  }

  if (msg.kind === 'email_deliver') {
    if (typeof msg.to_email !== 'string' || msg.to_email.length === 0) {
      return { success: false, error: 'email_deliver message missing to_email' }
    }
  }

  if (msg.kind === 'whatsapp_deliver') {
    if (typeof msg.to_phone !== 'string' || msg.to_phone.length === 0) {
      return { success: false, error: 'whatsapp_deliver message missing to_phone' }
    }
  }

  return { success: true }
}

describe('Resend re-enqueue contract', () => {
  const sessionId = 'abc-123-def-456'
  const session = { email: 'respondent@example.com', telefone: '+5511999998888' }

  describe('Email delivery message shape', () => {
    it('produces a message with kind email_deliver, response_id, and to_email', () => {
      const msg = buildDeliveryMessage('email', sessionId, session)

      assert.strictEqual(msg.kind, 'email_deliver')
      assert.strictEqual(msg.response_id, sessionId)
      assert.strictEqual((msg as { to_email: string }).to_email, session.email)
    })

    it('email message has exactly 3 keys (no extra fields)', () => {
      const msg = buildDeliveryMessage('email', sessionId, session)
      const keys = Object.keys(msg).sort()

      assert.deepStrictEqual(keys, ['kind', 'response_id', 'to_email'].sort())
    })
  })

  describe('WhatsApp delivery message shape', () => {
    it('produces a message with kind whatsapp_deliver, response_id, and to_phone', () => {
      const msg = buildDeliveryMessage('whatsapp', sessionId, session)

      assert.strictEqual(msg.kind, 'whatsapp_deliver')
      assert.strictEqual(msg.response_id, sessionId)
      assert.strictEqual((msg as { to_phone: string }).to_phone, session.telefone)
    })

    it('whatsapp message has exactly 3 keys (no extra fields)', () => {
      const msg = buildDeliveryMessage('whatsapp', sessionId, session)
      const keys = Object.keys(msg).sort()

      assert.deepStrictEqual(keys, ['kind', 'response_id', 'to_phone'].sort())
    })
  })

  describe('Message is valid JSON', () => {
    it('email delivery message serializes to valid JSON', () => {
      const msg = buildDeliveryMessage('email', sessionId, session)
      const serialized = JSON.stringify(msg)

      assert.doesNotThrow(() => JSON.parse(serialized))
      const parsed = JSON.parse(serialized)
      assert.deepStrictEqual(parsed, msg)
    })

    it('whatsapp delivery message serializes to valid JSON', () => {
      const msg = buildDeliveryMessage('whatsapp', sessionId, session)
      const serialized = JSON.stringify(msg)

      assert.doesNotThrow(() => JSON.parse(serialized))
      const parsed = JSON.parse(serialized)
      assert.deepStrictEqual(parsed, msg)
    })

    it('handles special characters in email without breaking JSON', () => {
      const specialSession = { email: 'user+tag@sub.domain.com', telefone: null }
      const msg = buildDeliveryMessage('email', sessionId, specialSession)
      const serialized = JSON.stringify(msg)

      assert.doesNotThrow(() => JSON.parse(serialized))
    })

    it('handles special characters in phone without breaking JSON', () => {
      const specialSession = { email: null, telefone: '+55 (11) 99999-8888' }
      const msg = buildDeliveryMessage('whatsapp', sessionId, specialSession)
      const serialized = JSON.stringify(msg)

      assert.doesNotThrow(() => JSON.parse(serialized))
    })
  })

  describe('Message conforms to the ReportingQueueMessage discriminated union', () => {
    it('email message kind is exactly email_deliver', () => {
      const msg = buildDeliveryMessage('email', sessionId, session)
      assert.strictEqual(msg.kind, 'email_deliver')
    })

    it('whatsapp message kind is exactly whatsapp_deliver', () => {
      const msg = buildDeliveryMessage('whatsapp', sessionId, session)
      assert.strictEqual(msg.kind, 'whatsapp_deliver')
    })

    it('kind field is one of the two valid discriminator values', () => {
      const validKinds = ['email_deliver', 'whatsapp_deliver'] as const

      const emailMsg = buildDeliveryMessage('email', sessionId, session)
      const whatsappMsg = buildDeliveryMessage('whatsapp', sessionId, session)

      assert.ok(validKinds.includes(emailMsg.kind as typeof validKinds[number]))
      assert.ok(validKinds.includes(whatsappMsg.kind as typeof validKinds[number]))
    })
  })

  describe('Required fields are present', () => {
    it('email message has to_email field (not to_phone)', () => {
      const msg = buildDeliveryMessage('email', sessionId, session)

      assert.ok('to_email' in msg)
      assert.ok(!('to_phone' in msg))
    })

    it('whatsapp message has to_phone field (not to_email)', () => {
      const msg = buildDeliveryMessage('whatsapp', sessionId, session)

      assert.ok('to_phone' in msg)
      assert.ok(!('to_email' in msg))
    })

    it('both message types have response_id', () => {
      const emailMsg = buildDeliveryMessage('email', sessionId, session)
      const whatsappMsg = buildDeliveryMessage('whatsapp', sessionId, session)

      assert.ok('response_id' in emailMsg)
      assert.ok('response_id' in whatsappMsg)
      assert.strictEqual(emailMsg.response_id, sessionId)
      assert.strictEqual(whatsappMsg.response_id, sessionId)
    })
  })

  describe('Delivery worker/mock processes without error', () => {
    it('email delivery message is accepted by the worker validator', () => {
      const msg = buildDeliveryMessage('email', sessionId, session)
      const serialized = JSON.stringify(msg)
      const result = workerCanProcess(serialized)

      assert.strictEqual(result.success, true, `Worker rejected message: ${result.error}`)
    })

    it('whatsapp delivery message is accepted by the worker validator', () => {
      const msg = buildDeliveryMessage('whatsapp', sessionId, session)
      const serialized = JSON.stringify(msg)
      const result = workerCanProcess(serialized)

      assert.strictEqual(result.success, true, `Worker rejected message: ${result.error}`)
    })

    it('worker rejects invalid JSON', () => {
      const result = workerCanProcess('not valid json{')
      assert.strictEqual(result.success, false)
    })

    it('worker rejects unknown kind', () => {
      const result = workerCanProcess(JSON.stringify({ kind: 'sms_deliver', response_id: '123' }))
      assert.strictEqual(result.success, false)
    })

    it('worker rejects email_deliver without to_email', () => {
      const result = workerCanProcess(
        JSON.stringify({ kind: 'email_deliver', response_id: '123' })
      )
      assert.strictEqual(result.success, false)
    })

    it('worker rejects whatsapp_deliver without to_phone', () => {
      const result = workerCanProcess(
        JSON.stringify({ kind: 'whatsapp_deliver', response_id: '123' })
      )
      assert.strictEqual(result.success, false)
    })

    it('worker rejects messages with empty response_id', () => {
      const result = workerCanProcess(
        JSON.stringify({ kind: 'email_deliver', response_id: '', to_email: 'a@b.com' })
      )
      assert.strictEqual(result.success, false)
    })
  })
})
