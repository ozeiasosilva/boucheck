import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import type { ReportingQueueMessage } from '#services/reporting_queue_client'
import type { JobContext } from './reporting_dispatcher.js'
import Response from '#models/response'

// ---------------------------------------------------------------------------
// Consultant Notify Job (Req 15.4)
//
// Consumes a `consultant_notify` message from Reporting_Queue and sends a
// plain notification e-mail to the survey's configured `email_notificacao`
// address via Amazon SES (no PDF attachment needed — just a text notification
// that a respondent has requested a consultant presentation).
//
// This handler reuses the same SQS → SES pattern established by the
// Email_Delivery_Worker for consistency.
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for testability.
 */
export interface ConsultantNotifyJobDeps {
  sesClient: SESClient
  fromEmail: string
}

/**
 * Lazily-created default dependencies sourced from environment variables.
 */
let _defaultDeps: ConsultantNotifyJobDeps | null = null

function getDefaultDeps(): ConsultantNotifyJobDeps {
  if (!_defaultDeps) {
    const region = process.env.AWS_REGION ?? 'us-east-1'
    _defaultDeps = {
      sesClient: new SESClient({ region }),
      fromEmail: process.env.SES_FROM_EMAIL ?? 'noreply@boucheck.beonup.com.br',
    }
  }
  return _defaultDeps
}

/**
 * Handles a `consultant_notify` message from Reporting_Queue.
 *
 * Sends a notification e-mail to the `to_email` address (the survey's
 * `email_notificacao`) informing that a respondent has requested a
 * consultant presentation.
 *
 * The message body includes the respondent's name and company (when available)
 * so the consultant has context before the scheduled call.
 *
 * Requirements: 15.4
 */
export async function handleConsultantNotify(
  message: ReportingQueueMessage & { kind: 'consultant_notify' },
  ctx: JobContext,
  deps?: ConsultantNotifyJobDeps
): Promise<void> {
  const { sesClient, fromEmail } = deps ?? getDefaultDeps()
  const { response_id: responseId, to_email: toEmail } = message

  // Structured log: job start (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'consultant_notify_start',
      response_id: responseId,
      to_email: toEmail,
      message_id: ctx.messageId,
      retry_count: ctx.retryCount,
    })
  )

  // Load response for context (respondent name/company/contact)
  const response = await Response.query().where('id', responseId).first()
  const nome = response?.nome ?? 'Respondente'
  const empresa = response?.empresa ?? '(não informado)'
  const email = response?.email ?? null
  const telefone = response?.telefone ?? null
  const cargo = response?.cargo ?? null
  const cidade = response?.cidade ?? null

  // Build and send the notification email
  const subject = 'Novo diagnóstico concluído — BouCheck'
  const htmlBody = buildNotificationHtml(nome, empresa, email, telefone, cargo, cidade)

  const rawMessage = buildMimeMessage({
    from: fromEmail,
    to: toEmail,
    subject,
    htmlBody,
  })

  await sesClient.send(
    new SendRawEmailCommand({ RawMessage: { Data: rawMessage } })
  )

  // Structured log: job success (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'consultant_notify_success',
      response_id: responseId,
      to_email: toEmail,
      message_id: ctx.messageId,
    })
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildNotificationHtml(
  nome: string,
  empresa: string,
  email: string | null,
  telefone: string | null,
  cargo: string | null,
  cidade: string | null
): string {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Nome', value: nome },
    { label: 'Empresa', value: empresa },
  ]
  if (cargo) rows.push({ label: 'Cargo', value: cargo })
  if (email) rows.push({ label: 'E-mail', value: email })
  if (telefone) rows.push({ label: 'Telefone', value: telefone })
  if (cidade) rows.push({ label: 'Cidade', value: cidade })

  const tableRows = rows
    .map(
      (r) => `<tr>
      <td style="padding: 6px 12px 6px 0; font-weight: bold; color: #555;">${esc(r.label)}:</td>
      <td style="padding: 6px 0;">${esc(r.value)}</td>
    </tr>`
    )
    .join('\n')

  return `<html>
<body style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 3px solid #1c57e5; padding-bottom: 12px; margin-bottom: 20px;">
    <h2 style="color: #1c57e5; margin: 0;">Novo diagnóstico concluído</h2>
  </div>
  <p>Um respondente completou o diagnóstico na plataforma BouCheck. Seguem os dados:</p>
  <table style="border-collapse: collapse; margin: 16px 0; width: 100%;">
    ${tableRows}
  </table>
  <p style="margin-top: 20px; color: #555;">Acesse o <a href="https://app.boucheck.beonup.com.br/admin/responses" style="color: #1c57e5;">painel administrativo</a> para ver as respostas completas e o relatório.</p>
  <br/>
  <p style="color: #999; font-size: 11px; border-top: 1px solid #eee; padding-top: 12px;">E-mail automático enviado pela plataforma BouCheck — BeOnUp.</p>
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
}): Buffer {
  const parts = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    opts.htmlBody,
  ]

  return Buffer.from(parts.join('\r\n'))
}
