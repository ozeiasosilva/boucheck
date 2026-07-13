import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  ReportingDispatcher,
  type SqsRecord,
  type JobContext,
} from '../../app/jobs/reporting_dispatcher.js'
import type { ReportingQueueMessage } from '../../app/services/reporting_queue_client.js'

/**
 * Unit tests for ReportingDispatcher
 * Validates: Requirements 18.1, 16.1
 */

function buildRecord(message: ReportingQueueMessage, overrides?: Partial<SqsRecord>): SqsRecord {
  return {
    body: JSON.stringify(message),
    attributes: { ApproximateReceiveCount: '1' },
    messageId: 'msg-001',
    receiptHandle: 'receipt-001',
    ...overrides,
  }
}

describe('ReportingDispatcher', () => {
  let dispatcher: ReportingDispatcher

  beforeEach(() => {
    dispatcher = new ReportingDispatcher()
  })

  describe('dispatch routing by kind (Req 18.1)', () => {
    it('routes score_calculate messages to the registered handler', async () => {
      const calls: Array<{ message: ReportingQueueMessage; ctx: JobContext }> = []
      dispatcher.register('score_calculate', async (msg, ctx) => {
        calls.push({ message: msg, ctx })
      })

      const record = buildRecord({ kind: 'score_calculate', response_id: 'resp-1' })
      await dispatcher.dispatch(record)

      assert.strictEqual(calls.length, 1)
      assert.deepStrictEqual(calls[0].message, { kind: 'score_calculate', response_id: 'resp-1' })
    })

    it('routes email_deliver messages to the registered handler', async () => {
      const calls: Array<{ message: ReportingQueueMessage; ctx: JobContext }> = []
      dispatcher.register('email_deliver', async (msg, ctx) => {
        calls.push({ message: msg, ctx })
      })

      const record = buildRecord({
        kind: 'email_deliver',
        response_id: 'resp-2',
        to_email: 'test@example.com',
      })
      await dispatcher.dispatch(record)

      assert.strictEqual(calls.length, 1)
      assert.deepStrictEqual(calls[0].message, {
        kind: 'email_deliver',
        response_id: 'resp-2',
        to_email: 'test@example.com',
      })
    })

    it('routes different kinds to different handlers', async () => {
      const scoreCalls: ReportingQueueMessage[] = []
      const pdfCalls: ReportingQueueMessage[] = []

      dispatcher.register('score_calculate', async (msg) => {
        scoreCalls.push(msg)
      })
      dispatcher.register('pdf_generate', async (msg) => {
        pdfCalls.push(msg)
      })

      await dispatcher.dispatch(buildRecord({ kind: 'score_calculate', response_id: 'r1' }))
      await dispatcher.dispatch(buildRecord({ kind: 'pdf_generate', response_id: 'r2' }))

      assert.strictEqual(scoreCalls.length, 1)
      assert.strictEqual(pdfCalls.length, 1)
      assert.deepStrictEqual(scoreCalls[0], { kind: 'score_calculate', response_id: 'r1' })
      assert.deepStrictEqual(pdfCalls[0], { kind: 'pdf_generate', response_id: 'r2' })
    })
  })

  describe('ApproximateReceiveCount exposed as retryCount (Req 16.1)', () => {
    it('parses ApproximateReceiveCount as numeric retryCount', async () => {
      let capturedCtx: JobContext | null = null
      dispatcher.register('score_calculate', async (_msg, ctx) => {
        capturedCtx = ctx
      })

      const record = buildRecord(
        { kind: 'score_calculate', response_id: 'resp-1' },
        { attributes: { ApproximateReceiveCount: '3' } }
      )
      await dispatcher.dispatch(record)

      assert.ok(capturedCtx)
      assert.strictEqual((capturedCtx as JobContext).retryCount, 3)
    })

    it('defaults retryCount to 1 when ApproximateReceiveCount is non-numeric', async () => {
      let capturedCtx: JobContext | null = null
      dispatcher.register('score_calculate', async (_msg, ctx) => {
        capturedCtx = ctx
      })

      const record = buildRecord(
        { kind: 'score_calculate', response_id: 'resp-1' },
        { attributes: { ApproximateReceiveCount: '' } }
      )
      await dispatcher.dispatch(record)

      assert.ok(capturedCtx)
      assert.strictEqual((capturedCtx as JobContext).retryCount, 1)
    })

    it('passes messageId and receiptHandle in the context', async () => {
      let capturedCtx: JobContext | null = null
      dispatcher.register('report_generate', async (_msg, ctx) => {
        capturedCtx = ctx
      })

      const record = buildRecord(
        { kind: 'report_generate', response_id: 'resp-1' },
        { messageId: 'my-msg-id', receiptHandle: 'my-receipt' }
      )
      await dispatcher.dispatch(record)

      assert.ok(capturedCtx)
      assert.strictEqual((capturedCtx as JobContext).messageId, 'my-msg-id')
      assert.strictEqual((capturedCtx as JobContext).receiptHandle, 'my-receipt')
    })
  })

  describe('unknown kind handling', () => {
    it('does not throw for an unknown kind', async () => {
      // No handler registered for 'unknown_kind'
      const record: SqsRecord = {
        body: JSON.stringify({ kind: 'unknown_kind', response_id: 'resp-1' }),
        attributes: { ApproximateReceiveCount: '1' },
        messageId: 'msg-x',
        receiptHandle: 'receipt-x',
      }

      // Should complete without throwing
      await dispatcher.dispatch(record)
    })

    it('does not call any handler for an unknown kind', async () => {
      const calls: unknown[] = []
      dispatcher.register('score_calculate', async (msg) => {
        calls.push(msg)
      })

      const record: SqsRecord = {
        body: JSON.stringify({ kind: 'something_else', response_id: 'resp-1' }),
        attributes: { ApproximateReceiveCount: '1' },
        messageId: 'msg-x',
        receiptHandle: 'receipt-x',
      }

      await dispatcher.dispatch(record)
      assert.strictEqual(calls.length, 0)
    })
  })

  describe('handler error propagation', () => {
    it('re-throws handler errors so SQS redrive mechanics work', async () => {
      const handlerError = new Error('Simulated failure')
      dispatcher.register('pdf_generate', async () => {
        throw handlerError
      })

      const record = buildRecord({ kind: 'pdf_generate', response_id: 'resp-1' })

      await assert.rejects(async () => dispatcher.dispatch(record), (err: Error) => {
        assert.strictEqual(err, handlerError)
        return true
      })
    })
  })

  describe('JSON parse error', () => {
    it('throws when body is not valid JSON', async () => {
      const record: SqsRecord = {
        body: 'not-json',
        attributes: { ApproximateReceiveCount: '1' },
        messageId: 'msg-bad',
        receiptHandle: 'receipt-bad',
      }

      await assert.rejects(async () => dispatcher.dispatch(record))
    })
  })
})
