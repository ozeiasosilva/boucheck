import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import type { ReportingQueueMessage } from '#services/reporting_queue_client'
import type { JobContext } from './reporting_dispatcher.js'
import { assertBpaEnabled } from '#services/bpa_check'
import { PdfRenderer } from '#services/pdf_renderer'
import Report from '#models/report'

// ---------------------------------------------------------------------------
// PDF Generation Job (Req 9.1, 9.2, 9.3, 18.3, 18.4)
//
// Consumes a `pdf_generate` message from Reporting_Queue, fetches the Report's
// stored HTML from S3 (Req 9.3 — same bytes, no re-template), renders it into
// a PDF via PdfRenderer (Playwright headless Chromium — Req 9.1), asserts BPA
// before storing (Req 18.3, 18.4), stores the PDF to S3, and updates
// `reports.pdf_s3_key` (Req 9.2).
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for testability.
 */
export interface PdfGenerationJobDeps {
  s3Client: S3Client
  pdfRenderer: PdfRenderer
  reportsBucket: string
}

/**
 * Lazily-created default dependencies sourced from environment variables.
 */
let _defaultDeps: PdfGenerationJobDeps | null = null

function getDefaultDeps(): PdfGenerationJobDeps {
  if (!_defaultDeps) {
    const region = process.env.AWS_REGION ?? 'us-east-1'
    _defaultDeps = {
      s3Client: new S3Client({ region }),
      pdfRenderer: new PdfRenderer(),
      reportsBucket: process.env.S3_REPORTS_BUCKET ?? 'boucheck-reports',
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
  // Req 18.3, 18.4: refuse to store if BPA is not fully enabled
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
 * Handles a `pdf_generate` message from Reporting_Queue.
 *
 * 1. Loads the Report row for the given response_id
 * 2. Fetches the HTML from S3 using `report.html_s3_key` (Req 9.3)
 * 3. Renders the HTML into a PDF via PdfRenderer (Req 9.1)
 * 4. Asserts BPA is enabled on the bucket (Req 18.3, 18.4)
 * 5. Stores the PDF to S3 (Req 9.2)
 * 6. Updates `reports.pdf_s3_key` with the stored key (Req 9.2)
 *
 * Idempotency: if `reports.pdf_s3_key` is already set, the job still
 * re-renders and overwrites — this ensures that redelivered messages
 * produce an up-to-date PDF without creating duplicate rows (Req 18.2).
 *
 * Requirements: 9.1, 9.2, 9.3, 18.2, 18.3, 18.4
 */
export async function handlePdfGeneration(
  message: ReportingQueueMessage & { kind: 'pdf_generate' },
  ctx: JobContext,
  deps?: PdfGenerationJobDeps
): Promise<void> {
  const { s3Client, pdfRenderer, reportsBucket } = deps ?? getDefaultDeps()
  const { response_id: responseId } = message

  // Structured log: job start (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'pdf_generation_start',
      response_id: responseId,
      message_id: ctx.messageId,
      retry_count: ctx.retryCount,
    })
  )

  // 1. Load the Report row
  const report = await Report.query().where('response_id', responseId).firstOrFail()

  // 2. Fetch the stored HTML from S3 (Req 9.3: same bytes, no re-render/re-template)
  const html = await getObjectAsString(s3Client, reportsBucket, report.htmlS3Key)

  // 3. Render HTML to PDF via Playwright (Req 9.1)
  const pdfBuffer = await pdfRenderer.renderFromHtml(html)

  // 4 & 5. Store PDF to S3 with BPA assertion (Req 18.3, 18.4, 9.2)
  const pdfKey = `reports/${responseId}/report.pdf`
  await putObject(s3Client, reportsBucket, pdfKey, pdfBuffer, 'application/pdf')

  // 6. Update the Report row with the PDF S3 key (Req 9.2)
  report.pdfS3Key = pdfKey
  await report.save()

  // Structured log: job success (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'pdf_generation_success',
      response_id: responseId,
      message_id: ctx.messageId,
      pdf_s3_key: pdfKey,
    })
  )
}
