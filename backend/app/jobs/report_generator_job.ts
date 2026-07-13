import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import type { ReportingQueueMessage } from '#services/reporting_queue_client'
import type { JobContext } from './reporting_dispatcher.js'
import { ReportGenerator } from '#services/report_generator'
import { RecommendationGenerator } from '#services/recommendation_generator'
import { findOrCreateReport } from '#services/find_or_create_report'
import { assertBpaEnabled } from '#services/bpa_check'
import { BedrockClient } from '../support/bedrock_client.js'
import AiGenerationLog from '#models/ai_generation_log'
import reportingQueue from '#services/reporting_queue_client'
import type { ReportingQueueClient } from '#services/reporting_queue_client'

// ---------------------------------------------------------------------------
// Report Generator Job (Req 6.1, 7.6, 8.1, 8.2, 8.3)
//
// Consumes a `report_generate` message from Reporting_Queue:
// 1. Calls ReportGenerator.assemble to build the HTML content
// 2. Stores the HTML to S3 at `reports/{response_id}/report.html`
// 3. Calls findOrCreateReport to persist the Report row (with public_token, expires_at)
// 4. Enqueues `pdf_generate` for the same response
//
// Idempotency: findOrCreateReport uses the `reports.response_id_unique` DB
// constraint — redelivered messages update the same Report row (never create
// duplicates). The subsequent `pdf_generate` enqueue is safe to duplicate
// because the PDF worker always re-renders and overwrites (Req 18.2).
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for testability.
 */
export interface ReportGeneratorJobDeps {
  reportGenerator: ReportGenerator
  s3Client: S3Client
  reportsBucket: string
  queue: ReportingQueueClient
}

/**
 * Lazily-created default dependencies sourced from environment variables.
 */
let _defaultDeps: ReportGeneratorJobDeps | null = null

function getDefaultDeps(): ReportGeneratorJobDeps {
  if (!_defaultDeps) {
    const region = process.env.AWS_REGION ?? 'us-east-1'
    const reportsBucket = process.env.S3_REPORTS_BUCKET ?? 'boucheck-reports'
    const s3Client = new S3Client({ region })

    const bedrockClient = new BedrockClient({
      region,
      modelId: process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-haiku-20240307-v1:0',
      timeoutMs: Number(process.env.BEDROCK_TIMEOUT_MS ?? '30000'),
    })
    const recommendationGenerator = new RecommendationGenerator(bedrockClient, AiGenerationLog)
    const reportGenerator = new ReportGenerator(recommendationGenerator)

    _defaultDeps = {
      reportGenerator,
      s3Client,
      reportsBucket,
      queue: reportingQueue,
    }
  }
  return _defaultDeps
}

/**
 * Handles a `report_generate` message from Reporting_Queue.
 *
 * 1. Assembles the report HTML via ReportGenerator (includes recommendation
 *    generation — Req 7.6: always proceeds regardless of Bedrock outcome)
 * 2. Stores the rendered HTML to S3 with BPA assertion (Req 8.1, 18.3)
 * 3. Finds or creates the Report row (Req 8.2, 8.3, 1.4)
 * 4. Enqueues `pdf_generate` for the same response
 *
 * Requirements: 6.1, 7.6, 8.1, 8.2, 8.3, 18.2
 */
export async function handleReportGeneration(
  message: ReportingQueueMessage & { kind: 'report_generate' },
  ctx: JobContext,
  deps?: ReportGeneratorJobDeps
): Promise<void> {
  const resolvedDeps = deps ?? getDefaultDeps()
  const { reportGenerator, s3Client, reportsBucket, queue } = resolvedDeps
  const { response_id: responseId } = message

  // Structured log: job start (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'report_generation_start',
      response_id: responseId,
      message_id: ctx.messageId,
      retry_count: ctx.retryCount,
    })
  )

  // 1. Assemble the report HTML (Req 6.1, 7.6)
  const { html } = await reportGenerator.assemble(responseId)

  // 2. Store HTML to S3 (Req 8.1)
  const htmlS3Key = `reports/${responseId}/report.html`
  await assertBpaEnabled(reportsBucket, { s3Client })
  await s3Client.send(
    new PutObjectCommand({
      Bucket: reportsBucket,
      Key: htmlS3Key,
      Body: Buffer.from(html, 'utf-8'),
      ContentType: 'text/html; charset=utf-8',
    })
  )

  // 3. Find-or-create Report row (Req 8.2, 8.3, 1.4)
  await findOrCreateReport({ responseId, htmlS3Key })

  // 4. Enqueue PDF generation
  await queue.enqueue({ kind: 'pdf_generate', response_id: responseId })

  // Structured log: job success (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'report_generation_success',
      response_id: responseId,
      message_id: ctx.messageId,
      html_s3_key: htmlS3Key,
    })
  )
}
