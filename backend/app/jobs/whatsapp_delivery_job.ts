import type { ReportingQueueMessage } from '#services/reporting_queue_client'
import type { JobContext } from './reporting_dispatcher.js'
import { handleDeliveryFailure } from '#services/delivery_failure_handler'
import whatsAppDeliveryService, { WhatsAppDeliveryService } from '#services/whatsapp_delivery_service'
import Report from '#models/report'
import ResponseEvent from '#models/response_event'

// ---------------------------------------------------------------------------
// WhatsApp Delivery Job (Req 14.1, 14.3, 18.2)
//
// Consumes a `whatsapp_deliver` message from Reporting_Queue, sends the
// Report's Public_Report_Endpoint link to the respondent's phone number via
// the WhatsApp Cloud API, and logs the `relatorio_whatsapp_enviado` event
// on confirmed send.
//
// Idempotency (Req 18.2): if a `relatorio_whatsapp_enviado` event already
// exists for the Response_Session, the handler returns immediately without
// re-sending — preventing duplicate deliveries on queue redelivery.
//
// Failures are routed through the shared `handleDeliveryFailure` handler
// which manages retry counting and exactly-once `relatorio_envio_falhou`
// logging (Requirement 16).
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for testability.
 */
export interface WhatsAppDeliveryJobDeps {
  whatsAppService: WhatsAppDeliveryService
  publicBaseUrl: string
}

/**
 * Lazily-created default dependencies sourced from environment variables.
 */
let _defaultDeps: WhatsAppDeliveryJobDeps | null = null

function getDefaultDeps(): WhatsAppDeliveryJobDeps {
  if (!_defaultDeps) {
    _defaultDeps = {
      whatsAppService: whatsAppDeliveryService,
      publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'https://app.boucheck.com',
    }
  }
  return _defaultDeps
}

/**
 * Handles a `whatsapp_deliver` message from Reporting_Queue.
 *
 * 1. Idempotency guard: checks for an existing `relatorio_whatsapp_enviado`
 *    event for this Response_Session — skips if already sent (Req 18.2).
 * 2. Loads the Report row to build the public report URL.
 * 3. Calls `WhatsAppDeliveryService.deliver` with the respondent's phone
 *    and the report link (Req 14.1, 14.2).
 * 4. On confirmed send, logs a `relatorio_whatsapp_enviado` event (Req 14.3).
 * 5. On failure, routes through `handleDeliveryFailure` for retry/DLQ
 *    mechanics (Requirement 16), then re-throws so SQS redrive works.
 *
 * Requirements: 14.1, 14.3, 18.2, 16, 19.1
 */
export async function handleWhatsAppDelivery(
  message: ReportingQueueMessage & { kind: 'whatsapp_deliver' },
  ctx: JobContext,
  deps?: WhatsAppDeliveryJobDeps
): Promise<void> {
  const { whatsAppService, publicBaseUrl } = deps ?? getDefaultDeps()
  const { response_id: responseId, to_phone: toPhone } = message

  // Structured log: job start (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'whatsapp_delivery_start',
      response_id: responseId,
      message_id: ctx.messageId,
      retry_count: ctx.retryCount,
    })
  )

  // 1. Idempotent redelivery guard (Req 18.2)
  const alreadySent = await ResponseEvent.query()
    .where('response_id', responseId)
    .where('tipo', 'relatorio_whatsapp_enviado')
    .first()

  if (alreadySent) {
    // Structured log: skipped duplicate (Req 19.1)
    console.log(
      JSON.stringify({
        event: 'whatsapp_delivery_skipped',
        response_id: responseId,
        message_id: ctx.messageId,
        reason: 'already_sent',
      })
    )
    return
  }

  try {
    // 2. Load the Report — if the response was deleted, bail gracefully
    const report = await Report.query().where('response_id', responseId).first()

    if (!report) {
      console.log(
        JSON.stringify({
          event: 'whatsapp_delivery_skipped_orphan',
          response_id: responseId,
          message_id: ctx.messageId,
          reason: 'response or report no longer exists',
        })
      )
      return
    }

    const reportUrl = `${publicBaseUrl}/r/${report.publicToken}`

    // 3. Send the template message via WhatsApp Cloud API (Req 14.1, 14.2)
    await whatsAppService.deliver(toPhone, reportUrl)

    // 4. Log confirmed send event (Req 14.3)
    await ResponseEvent.create({
      responseId,
      tipo: 'relatorio_whatsapp_enviado',
    })

    // Structured log: job success (Req 19.1)
    console.log(
      JSON.stringify({
        event: 'whatsapp_delivery_success',
        response_id: responseId,
        message_id: ctx.messageId,
      })
    )
  } catch (err) {
    // 5. Route failures through the shared delivery failure handler (Req 16, 19)
    await handleDeliveryFailure({
      responseId,
      canal: 'whatsapp',
      receiveCount: ctx.retryCount,
      err,
    })

    // Re-throw so SQS redrive mechanics move the message to DLQ after maxReceiveCount
    throw err
  }
}
