import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

/**
 * MailMessage envelope types for the foundation SQS email queue.
 * The worker (foundation infra) renders and sends via SES.
 */
export type MailMessage =
  | { kind: 'password_reset'; to: string; resetLink: string }
  | { kind: 'temp_password'; to: string; nome: string; tempPassword: string }

/**
 * Thin SQS producer that serializes a MailMessage envelope and puts it
 * on the foundation email queue.
 *
 * - Queue URL and region are sourced from environment variables
 *   (populated at runtime from Secrets Manager / SSM per Req 11.3).
 * - Reset links and temporary passwords are NEVER written to application logs (Req 11.5).
 * - On enqueue failure the error is logged (masked — no secrets) and swallowed;
 *   callers always see a resolved promise so uniform success responses are maintained.
 */
export class MailQueue {
  private client: SQSClient
  private queueUrl: string

  constructor() {
    const region = process.env.AWS_REGION ?? 'us-east-1'
    this.client = new SQSClient({ region })
    this.queueUrl = process.env.SQS_MAIL_QUEUE_URL ?? ''
  }

  /**
   * Enqueue a mail message to the foundation SQS queue.
   * Never throws — failures are logged with masked details only.
   */
  async enqueue(msg: MailMessage): Promise<void> {
    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(msg),
        })
      )
    } catch (error) {
      // Log without secrets: never expose resetLink or tempPassword (Req 11.5)
      console.error('[MailQueue] Failed to enqueue message', {
        kind: msg.kind,
        to: msg.to,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}

export default new MailQueue()
