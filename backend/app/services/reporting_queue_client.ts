import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

/**
 * Discriminated-union envelope for all Reporting_Queue message kinds.
 *
 * A single SQS standard queue (`Reporting_Queue`) carries every pipeline stage;
 * the job dispatcher routes each record to the correct handler by `kind`.
 */
export type ReportingQueueMessage =
  | { kind: 'score_calculate'; response_id: string }
  | { kind: 'report_generate'; response_id: string }
  | { kind: 'pdf_generate'; response_id: string }
  | { kind: 'email_deliver'; response_id: string; to_email: string }
  | { kind: 'whatsapp_deliver'; response_id: string; to_phone: string }
  | { kind: 'consultant_notify'; response_id: string; to_email: string }
  | { kind: 'consultant_whatsapp_notify'; response_id: string; to_email: string }

export interface ReportingQueueConfig {
  queueUrl: string
  region: string
}

/**
 * Thin SQS producer that serializes a ReportingQueueMessage envelope and puts it
 * on the foundation Reporting_Queue.
 *
 * Unlike the MailQueue (which swallows errors silently), this client lets enqueue
 * failures propagate so that upstream callers (job handlers) can fail and be retried
 * by SQS's native redelivery/redrive mechanics.
 */
export class ReportingQueueClient {
  private client: SQSClient
  private queueUrl: string

  constructor(cfg: ReportingQueueConfig) {
    this.client = new SQSClient({ region: cfg.region })
    this.queueUrl = cfg.queueUrl
  }

  /**
   * Enqueue a message to the Reporting_Queue.
   *
   * Propagates SQS send failures so the calling job handler can re-throw
   * and let the queue's redrive policy handle retries (Req 16, 18.1).
   */
  async enqueue(message: ReportingQueueMessage): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
      })
    )
  }
}

/**
 * Default singleton instance sourced from environment variables.
 * In production these are populated from Secrets Manager / SSM.
 */
export default new ReportingQueueClient({
  queueUrl: process.env.SQS_REPORTING_QUEUE_URL ?? '',
  region: process.env.AWS_REGION ?? 'us-east-1',
})
