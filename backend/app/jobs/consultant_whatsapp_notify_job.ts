import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import type { ReportingQueueMessage } from '#services/reporting_queue_client'
import type { JobContext } from './reporting_dispatcher.js'
import Response from '#models/response'
import Report from '#models/report'

// ---------------------------------------------------------------------------
// Consultant WhatsApp Notify Job (Req 7.2, 7.3, 7.4)
//
// Consumes a `consultant_whatsapp_notify` message from Reporting_Queue and
// sends a notification e-mail to the survey's `email_notificacao` address
// with the respondent's data (nome, empresa, telefone, email) and the PDF
// report attached.
//
// If the PDF is not yet available, the handler throws so SQS's native
// redrive mechanics retry the message until the PDF is generated.
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for testability.
 */
export interface ConsultantWhatsappNotifyJobDeps {
  sesClient: SESClient
  s3Client: S3Client
  fromEmail: string
  reportsBucket: string
}

/**
 * Lazily-created default dependencies sourced from environment variables.
 */
let _defaultDeps: ConsultantWhatsappNotifyJobDeps | null = null

function getDefaultDeps(): ConsultantWhatsappNotifyJobDeps {
  if (!_defaultDeps) {
    const region = process.env.AWS_REGION ?? 'us-east-1'
    _defaultDeps = {
      sesClient: new SESClient({ region }),
      s3Client: new S3Client({ region }),
      fromEmail: process.env.SES_FROM_EMAIL ?? 'noreply@boucheck.beonup.com.br',
      reportsBucket: process.env.S3_REPORTS_BUCKET ?? 'boucheck-reports',
    }
  }
  return _defaultDeps
}

/**
 * Handles a `consultant_whatsapp_notify` message from Reporting_Queue.
 *
 * Sends an e-mail to `to_email` (the survey's `email_notificacao`) containing:
 * - Respondent data: nome, empresa, telefone, email
 * - PDF report as attachment (fetched from S3)
 *
 * If the PDF is not available yet, throws an error so SQS retries the message
 * until the PDF generation pipeline completes.
 *
 * Requirements: 7.2, 7.3, 7.4
 */
export async function handleConsultantWhatsappNotify(
  message: ReportingQueueMessage & { kind: 'consultant_whatsapp_notify' },
  ctx: JobContext,
  deps?: ConsultantWhatsappNotifyJobDeps
): Promise<void> {
  const { sesClient, s3Client, fromEmail, reportsBucket } = deps ?? getDefaultDeps()
  const { response_id: responseId, to_email: toEmail } = message

  // Structured log: job start (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'consultant_whatsapp_notify_start',
      response_id: responseId,
      to_email: toEmail,
      message_id: ctx.messageId,
      retry_count: ctx.retryCount,
    })
  )

  // Load response for respondent context
  const response = await Response.findOrFail(responseId)

  // Load the report to check PDF availability
  const report = await Report.query().where('response_id', responseId).first()

  // Req 7.4 — If the PDF is not available yet, throw to trigger SQS retry
  if (!report?.pdfS3Key) {
    const errMsg = `PDF not ready for response_id=${responseId}`
    console.log(
      JSON.stringify({
        event: 'consultant_whatsapp_notify_pdf_not_ready',
        response_id: responseId,
        message_id: ctx.messageId,
        retry_count: ctx.retryCount,
      })
    )
    throw new Error(errMsg)
  }

  // Fetch PDF from S3 (Req 7.3)
  const pdfBuffer = await getObjectAsBuffer(s3Client, reportsBucket, report.pdfS3Key)

  // Build and send the notification email with PDF attachment (Req 7.2, 7.3)
  const nome = response.nome ?? 'Respondente'
  const empresa = response.empresa ?? '(não informado)'
  const telefone = response.telefone ?? '(não informado)'
  const email = response.email ?? '(não informado)'

  const subject = 'Novo respondente solicitou relatório via WhatsApp'
  const htmlBody = buildNotificationHtml(nome, empresa, telefone, email)

  const rawMessage = buildMimeMessage({
    from: fromEmail,
    to: toEmail,
    subject,
    htmlBody,
    pdfBuffer,
  })

  await sesClient.send(
    new SendRawEmailCommand({ RawMessage: { Data: rawMessage } })
  )

  // Structured log: job success (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'consultant_whatsapp_notify_success',
      response_id: responseId,
      to_email: toEmail,
      message_id: ctx.messageId,
    })
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetches an S3 object as a Buffer.
 */
async function getObjectAsBuffer(s3Client: S3Client, bucket: string, key: string): Promise<Buffer> {
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
  return Buffer.concat(chunks)
}

/**
 * Builds the notification HTML body with respondent data.
 */
export function buildNotificationHtml(
  nome: string,
  empresa: string,
  telefone: string,
  email: string
): string {
  return `<html>
<body style="font-family: Arial, sans-serif; color: #333;">
  <h2 style="color: #2c3e50;">Novo respondente solicitou relatório via WhatsApp</h2>
  <p>Um respondente solicitou receber o relatório diagnóstico via WhatsApp. Seguem os dados:</p>
  <table style="border-collapse: collapse; margin-top: 12px;">
    <tr>
      <td style="padding: 4px 12px 4px 0; font-weight: bold;">Nome:</td>
      <td style="padding: 4px 0;">${esc(nome)}</td>
    </tr>
    <tr>
      <td style="padding: 4px 12px 4px 0; font-weight: bold;">Empresa:</td>
      <td style="padding: 4px 0;">${esc(empresa)}</td>
    </tr>
    <tr>
      <td style="padding: 4px 12px 4px 0; font-weight: bold;">Telefone:</td>
      <td style="padding: 4px 0;">${esc(telefone)}</td>
    </tr>
    <tr>
      <td style="padding: 4px 12px 4px 0; font-weight: bold;">E-mail:</td>
      <td style="padding: 4px 0;">${esc(email)}</td>
    </tr>
  </table>
  <p style="margin-top: 16px;">O relatório em PDF está anexado a este e-mail.</p>
  <br/>
  <p style="color: #666; font-size: 12px;">Este é um e-mail automático enviado pela plataforma BouCheck — BeOnUp.</p>
</body>
</html>`
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return map[c]!
  })
}

function buildMimeMessage(opts: {
  from: string
  to: string
  subject: string
  htmlBody: string
  pdfBuffer: Buffer
}): Buffer {
  const boundary = `----=_BouCheck_${Date.now()}_${Math.random().toString(36).slice(2)}`

  const parts = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    opts.htmlBody,
    '',
    `--${boundary}`,
    'Content-Type: application/pdf; name="relatorio.pdf"',
    'Content-Disposition: attachment; filename="relatorio.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    opts.pdfBuffer.toString('base64'),
    '',
    `--${boundary}--`,
  ]

  return Buffer.from(parts.join('\r\n'))
}
