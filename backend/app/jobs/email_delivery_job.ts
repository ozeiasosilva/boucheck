import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import type { ReportingQueueMessage } from '#services/reporting_queue_client'
import type { JobContext } from './reporting_dispatcher.js'
import { handleDeliveryFailure } from '#services/delivery_failure_handler'
import emailDeliveryServiceDefault, { EmailDeliveryService } from '#services/email_delivery_service'
import { assertBpaEnabled } from '#services/bpa_check'
import { PdfRenderer } from '#services/pdf_renderer'
import Report from '#models/report'
import ResponseEvent from '#models/response_event'

// ---------------------------------------------------------------------------
// Email Delivery Job (Req 13.1, 13.2, 13.3, 9.4, 18.2)
//
// Consumes an `email_deliver` message from Reporting_Queue:
// 1. Idempotency guard — skip if `relatorio_email_enviado` already exists (Req 18.2)
// 2. PDF reuse-vs-render gating — reuse existing `pdf_s3_key` or render in-process (Req 9.4)
// 3. Send the email with PDF attachment via EmailDeliveryService (Req 13.2, 13.3)
// 4. Log `relatorio_email_enviado` on confirmed send (Req 13.2)
// 5. Route failures through handleDeliveryFailure (Req 16)
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for testability.
 */
export interface EmailDeliveryJobDeps {
  emailDeliveryService: EmailDeliveryService
  pdfRenderer: PdfRenderer
  s3Client: S3Client
  reportsBucket: string
}

/**
 * Lazily-created default dependencies sourced from environment variables.
 */
let _defaultDeps: EmailDeliveryJobDeps | null = null

function getDefaultDeps(): EmailDeliveryJobDeps {
  if (!_defaultDeps) {
    const region = process.env.AWS_REGION ?? 'us-east-1'
    const reportsBucket = process.env.S3_REPORTS_BUCKET ?? 'boucheck-reports'
    const s3Client = new S3Client({ region })

    _defaultDeps = {
      emailDeliveryService: emailDeliveryServiceDefault,
      pdfRenderer: new PdfRenderer(),
      s3Client,
      reportsBucket,
    }
  }
  return _defaultDeps
}

/**
 * Fetches an S3 object as a UTF-8 string.
 */
async function getObjectAsString(s3Client: S3Client, bucket: string, key: string): Promise<string> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  )
  const stream = response.Body
  if (!stream) {
    throw new Error(`S3 GetObject returned empty body for ${bucket}/${key}`)
  }
  const chunks: Uint8Array[] = []
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

/**
 * Stores a buffer to S3 with the given content type.
 * Calls assertBpaEnabled BEFORE the put (Req 18.3, 18.4).
 */
async function putObject(
  s3Client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await assertBpaEnabled(bucket, { s3Client })
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
}

/**
 * Renders and stores the PDF in-process for a Report that has no pdf_s3_key yet.
 * This satisfies Req 9.4: when the email delivery worker processes a job and
 * the PDF hasn't been generated yet, it renders the PDF in-process rather than
 * enqueuing a separate job, avoiding an extra queue hop.
 */
async function renderAndStorePdf(
  report: Report,
  deps: EmailDeliveryJobDeps
): Promise<void> {
  const { s3Client, pdfRenderer, reportsBucket } = deps

  // Fetch the stored HTML from S3 (same bytes — Req 9.3)
  const html = await getObjectAsString(s3Client, reportsBucket, report.htmlS3Key)

  // Render HTML to PDF via Playwright (Req 9.1)
  const pdfBuffer = await pdfRenderer.renderFromHtml(html)

  // Store PDF to S3 with BPA assertion (Req 18.3, 18.4)
  const pdfKey = `reports/${report.responseId}/report.pdf`
  await putObject(s3Client, reportsBucket, pdfKey, pdfBuffer, 'application/pdf')

  // Update the Report row with the PDF S3 key
  report.pdfS3Key = pdfKey
  await report.save()
}

/**
 * Handles an `email_deliver` message from Reporting_Queue.
 *
 * Flow:
 * 1. Idempotency guard: if `relatorio_email_enviado` event already exists for this
 *    response_id, skip processing (Req 18.2 — no duplicate delivery or event).
 * 2. Load the Report for this response_id.
 * 3. PDF reuse-vs-render gating (Req 9.4):
 *    - If `report.pdfS3Key` is set → reuse (no re-render)
 *    - If null → render the PDF in-process using the stored HTML
 * 4. Call EmailDeliveryService.deliver to send via SES with PDF attachment (Req 13.2, 13.3).
 * 5. On confirmed send, log `relatorio_email_enviado` event (Req 13.2).
 * 6. On failure, route through handleDeliveryFailure (Req 16) and re-throw for SQS redrive.
 *
 * Requirements: 13.1, 13.2, 13.3, 9.4, 18.2
 */
export async function handleEmailDelivery(
  message: ReportingQueueMessage & { kind: 'email_deliver' },
  ctx: JobContext,
  deps?: EmailDeliveryJobDeps
): Promise<void> {
  const resolvedDeps = deps ?? getDefaultDeps()
  const { emailDeliveryService } = resolvedDeps
  const { response_id: responseId, to_email: toEmail } = message

  // Structured log: job start (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'email_delivery_start',
      response_id: responseId,
      to_email: toEmail,
      message_id: ctx.messageId,
      retry_count: ctx.retryCount,
    })
  )

  // 1. Idempotency guard (Req 18.2): skip if already confirmed sent
  const alreadySent = await ResponseEvent.query()
    .where('response_id', responseId)
    .where('tipo', 'relatorio_email_enviado')
    .first()

  if (alreadySent) {
    console.log(
      JSON.stringify({
        event: 'email_delivery_skipped_idempotent',
        response_id: responseId,
        message_id: ctx.messageId,
        reason: 'relatorio_email_enviado event already exists',
      })
    )
    return
  }

  try {
    // 2. Load the Report row
    let report = await Report.query().where('response_id', responseId).firstOrFail()

    // 3. PDF reuse-vs-render gating (Req 9.4)
    if (!report.pdfS3Key) {
      console.log(
        JSON.stringify({
          event: 'email_delivery_pdf_render_inline',
          response_id: responseId,
          message_id: ctx.messageId,
        })
      )
      await renderAndStorePdf(report, resolvedDeps)
      // Refresh the report instance to pick up the newly saved pdfS3Key
      await report.refresh()
    }

    // 4. Send email with PDF attachment via SES (Req 13.2, 13.3)
    await emailDeliveryService.deliver(report, toEmail)

    // 5. Log relatorio_email_enviado on confirmed send (Req 13.2)
    await ResponseEvent.create({
      responseId,
      tipo: 'relatorio_email_enviado',
      payload: { to_email: toEmail },
    })

    // Structured log: job success (Req 19.1)
    console.log(
      JSON.stringify({
        event: 'email_delivery_success',
        response_id: responseId,
        to_email: toEmail,
        message_id: ctx.messageId,
      })
    )
  } catch (err) {
    // 6. Route failures through handleDeliveryFailure (Req 16)
    await handleDeliveryFailure({
      responseId,
      canal: 'email',
      receiveCount: ctx.retryCount,
      err,
    })

    // Re-throw so SQS's redrive mechanics move it to DLQ after maxReceiveCount
    throw err
  }
}
