import { ReportingDispatcher } from './reporting_dispatcher.js'
import type { SqsRecord } from './reporting_dispatcher.js'
import { handleScoreCalculation } from './score_calculator_job.js'
import { handleReportGeneration } from './report_generator_job.js'
import { handlePdfGeneration } from './pdf_generation_job.js'
import { handleEmailDelivery } from './email_delivery_job.js'
import { handleWhatsAppDelivery } from './whatsapp_delivery_job.js'
import { handleConsultantNotify } from './consultant_notify_job.js'

// ---------------------------------------------------------------------------
// Reporting Worker Entry Point (Req 18.1)
//
// Instantiates a ReportingDispatcher and registers all six pipeline-stage
// handlers. Exports a `processRecords` function for the Lambda/consumer to
// call with each batch of SQS records.
//
// Handler registrations:
//   score_calculate   → ScoreCalculatorJob   (task 3)
//   report_generate   → ReportGeneratorJob   (task 8)
//   pdf_generate      → PdfGenerationJob     (task 11)
//   email_deliver     → EmailDeliveryJob     (task 13)
//   whatsapp_deliver  → WhatsAppDeliveryJob  (task 14)
//   consultant_notify → ConsultantNotifyJob  (simple notification email)
// ---------------------------------------------------------------------------

/**
 * Singleton dispatcher instance with all handlers registered.
 */
const dispatcher = new ReportingDispatcher()

// Register all pipeline-stage handlers by message kind
dispatcher.register('score_calculate', (msg, ctx) =>
  handleScoreCalculation(msg as any, ctx)
)

dispatcher.register('report_generate', (msg, ctx) =>
  handleReportGeneration(msg as any, ctx)
)

dispatcher.register('pdf_generate', (msg, ctx) =>
  handlePdfGeneration(msg as any, ctx)
)

dispatcher.register('email_deliver', (msg, ctx) =>
  handleEmailDelivery(msg as any, ctx)
)

dispatcher.register('whatsapp_deliver', (msg, ctx) =>
  handleWhatsAppDelivery(msg as any, ctx)
)

dispatcher.register('consultant_notify', (msg, ctx) =>
  handleConsultantNotify(msg as any, ctx)
)

/**
 * Process a batch of SQS records through the dispatcher.
 *
 * This is the entry point for the Lambda/consumer: it receives the raw SQS
 * event records, dispatches each one to the appropriate handler, and collects
 * any failures. Records that throw are reported as batch item failures so
 * SQS's native redrive mechanics can retry them individually.
 *
 * @param records - Array of raw SQS records from the Lambda event
 * @returns An object containing `batchItemFailures` for partial batch response
 */
export async function processRecords(
  records: SqsRecord[]
): Promise<{ batchItemFailures: Array<{ itemIdentifier: string }> }> {
  const batchItemFailures: Array<{ itemIdentifier: string }> = []

  for (const record of records) {
    try {
      await dispatcher.dispatch(record)
    } catch (err) {
      // Structured error log (Req 19.1)
      console.error(
        JSON.stringify({
          event: 'record_processing_failed',
          message_id: record.messageId,
          error: err instanceof Error ? err.message : String(err),
        })
      )

      // Report as a batch item failure so SQS retries only this record
      batchItemFailures.push({ itemIdentifier: record.messageId })
    }
  }

  return { batchItemFailures }
}

/**
 * The configured dispatcher instance, exported for testing purposes.
 */
export { dispatcher }
