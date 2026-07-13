import type { ReportingQueueMessage } from '#services/reporting_queue_client'

/**
 * Represents a raw SQS record as received by the Lambda/consumer.
 * Carries the message body (JSON-encoded ReportingQueueMessage) plus
 * SQS-native attributes used for retry counting.
 */
export interface SqsRecord {
  body: string
  attributes: { ApproximateReceiveCount: string; [key: string]: string }
  messageId: string
  receiptHandle: string
}

/**
 * Context passed to each job handler alongside the parsed message.
 * Exposes the SQS ApproximateReceiveCount as a numeric `retryCount`
 * (Requirement 16.1) and record metadata for downstream use.
 */
export interface JobContext {
  retryCount: number
  messageId: string
  receiptHandle: string
}

/**
 * Signature of a registered job handler function.
 * Receives the parsed message envelope and a JobContext.
 */
export type JobHandler = (message: ReportingQueueMessage, ctx: JobContext) => Promise<void>

/**
 * Routes inbound SQS records to the correct handler by `kind`.
 *
 * The dispatcher:
 * 1. Parses `record.body` as JSON to get the `ReportingQueueMessage`
 * 2. Reads `record.attributes.ApproximateReceiveCount` as the retry count
 * 3. Looks up the handler by `message.kind`
 * 4. Calls the handler with the message and job context
 * 5. Logs unknown kinds with a structured error
 * 6. Re-throws handler errors so SQS native redrive mechanics work
 *
 * Requirements: 18.1, 16.1
 */
export class ReportingDispatcher {
  private handlers: Map<string, JobHandler> = new Map()

  /**
   * Register a handler for a specific message kind.
   * Handlers registered later for the same kind overwrite previous ones.
   */
  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler)
  }

  /**
   * Dispatch a single SQS record to the appropriate handler.
   *
   * - Parses the record body as a ReportingQueueMessage
   * - Builds a JobContext with the numeric retryCount from ApproximateReceiveCount
   * - Routes to the registered handler by message.kind
   * - Logs and returns silently for unknown kinds (no throw — avoids infinite redelivery
   *   for messages that will never find a handler)
   * - Re-throws any handler error so SQS redrive policy moves the message to the DLQ
   *   after maxReceiveCount failures
   */
  async dispatch(record: SqsRecord): Promise<void> {
    const message: ReportingQueueMessage = JSON.parse(record.body)

    const ctx: JobContext = {
      retryCount: Number.parseInt(record.attributes.ApproximateReceiveCount, 10) || 1,
      messageId: record.messageId,
      receiptHandle: record.receiptHandle,
    }

    const handler = this.handlers.get(message.kind)

    if (!handler) {
      // Structured error log for unknown kinds (Req 19.1)
      console.error(
        JSON.stringify({
          event: 'unknown_message_kind',
          kind: message.kind,
          message_id: record.messageId,
          body: record.body,
        })
      )
      return
    }

    // Re-throw handler errors to let SQS redrive mechanics work (Req 16, 18.1)
    await handler(message, ctx)
  }
}

