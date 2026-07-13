import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import Response from '#models/response'
import ResponseEvent from '#models/response_event'
import { NotFoundException } from './anonymization_service.js'

export type DeliveryChannel = 'email' | 'whatsapp'

export type ChannelResolution =
  | { kind: 'resolved'; channel: DeliveryChannel }
  | { kind: 'ambiguous' }
  | { kind: 'not_found' }

export class AmbiguousChannelException extends Error {
  status = 422
  constructor() {
    super('Ambiguous channel: more than one failed channel exists and none was specified')
  }
}

export class ChannelNotFoundException extends Error {
  status = 422
  constructor() {
    super('Channel not found: no failed delivery events exist for the resolved channel')
  }
}

/**
 * Pure function — unit of property testing.
 *
 * Resolves the delivery channel for a manual resend based on the explicitly
 * requested channel and the set of channels that have at least one
 * `relatorio_envio_falhou` event for the session.
 *
 * - Req 8.2: When an explicit channel is provided, restrict to that channel.
 * - Req 8.3: When omitted and exactly one failed channel exists, default to it.
 * - Req 8.4: When omitted and more than one failed channel → ambiguous.
 * - Req 8.5: When no relatorio_envio_falhou events for the resolved channel → not_found.
 */
export function resolveChannel(
  explicit: DeliveryChannel | undefined,
  failedChannels: Set<DeliveryChannel>
): ChannelResolution {
  if (explicit !== undefined) {
    return failedChannels.has(explicit)
      ? { kind: 'resolved', channel: explicit }
      : { kind: 'not_found' }
  }
  if (failedChannels.size === 0) return { kind: 'not_found' }
  if (failedChannels.size === 1) return { kind: 'resolved', channel: [...failedChannels][0] }
  return { kind: 'ambiguous' }
}

/**
 * Module-level SQS client singleton — reused across all resend invocations.
 */
const sqsClient = new SQSClient({})

export class ResendService {
  /**
   * Req 8 — Manually re-trigger a failed report delivery.
   *
   * - Req 8.1: Throws NotFoundException (404) if the session doesn't exist.
   * - Req 8.4: Throws AmbiguousChannelException (422) when multiple failed channels and none specified.
   * - Req 8.5: Throws ChannelNotFoundException (422) when the resolved channel has no failed events.
   * - Req 8.6: Enqueues a Delivery_Job (email_deliver or whatsapp_deliver) to Reporting_Queue.
   * - Req 8.7: Records a Manual_Resend_Event (relatorio_reenvio_solicitado).
   */
  async resend(
    sessionId: string,
    explicitChannel?: DeliveryChannel,
    requestingAdminId?: number
  ): Promise<{ channel: DeliveryChannel }> {
    const session = await Response.find(sessionId)
    if (!session) throw new NotFoundException()

    const failedChannels = await this.loadFailedChannels(sessionId)
    const resolution = resolveChannel(explicitChannel, failedChannels)

    if (resolution.kind === 'ambiguous') throw new AmbiguousChannelException()
    if (resolution.kind === 'not_found') throw new ChannelNotFoundException()

    const { channel } = resolution
    await this.enqueueDeliveryJob(sessionId, session, channel)

    await ResponseEvent.create({
      responseId: sessionId,
      tipo: 'relatorio_reenvio_solicitado',
      payload: { admin_user_id: requestingAdminId, canal: channel },
    })

    return { channel }
  }

  /**
   * Loads distinct failed delivery channels from `relatorio_envio_falhou` events
   * for the given session.
   */
  private async loadFailedChannels(sessionId: string): Promise<Set<DeliveryChannel>> {
    const events = await ResponseEvent.query()
      .where('responseId', sessionId)
      .where('tipo', 'relatorio_envio_falhou')

    const channels = new Set<DeliveryChannel>()
    for (const event of events) {
      const canal = (event.payload as Record<string, unknown> | null)?.canal
      if (canal === 'email' || canal === 'whatsapp') {
        channels.add(canal)
      }
    }
    return channels
  }

  /**
   * Enqueues the exact Delivery_Job message that reporting-delivery's workers
   * already consume (email_deliver or whatsapp_deliver).
   */
  private async enqueueDeliveryJob(
    sessionId: string,
    session: Response,
    channel: DeliveryChannel
  ): Promise<void> {
    const messageBody =
      channel === 'email'
        ? { kind: 'email_deliver', response_id: sessionId, to_email: session.email }
        : { kind: 'whatsapp_deliver', response_id: sessionId, to_phone: session.telefone }

    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: process.env.REPORTING_QUEUE_URL,
        MessageBody: JSON.stringify(messageBody),
      })
    )
  }
}

export default new ResendService()
