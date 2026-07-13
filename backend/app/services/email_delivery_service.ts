import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import type Report from '#models/report'

// ---------------------------------------------------------------------------
// Injectable interfaces for testability
// ---------------------------------------------------------------------------

/**
 * Minimal SES client interface (send raw email with MIME content).
 */
export interface SesClientLike {
  sendRawEmail(rawMessage: Buffer): Promise<void>
}

/**
 * Minimal S3 client interface (get object as Buffer).
 */
export interface S3ClientLike {
  getObject(bucket: string, key: string): Promise<Buffer>
}

// ---------------------------------------------------------------------------
// EmailDeliveryService
// ---------------------------------------------------------------------------

/**
 * Sends a Report by e-mail via Amazon SES with the PDF as an attachment.
 *
 * Requirements covered:
 *   13.2 — Send report by email via Amazon SES with confirmed delivery
 *   13.3 — Attach the Report's PDF document to the email message
 */
export class EmailDeliveryService {
  constructor(
    private ses: SesClientLike,
    private s3: S3ClientLike,
    private config: { fromEmail: string; reportsBucket: string }
  ) {}

  /**
   * Fetch the Report's PDF from S3 and send it as an email attachment via SES.
   *
   * @throws Error if `report.pdfS3Key` is null (caller must ensure PDF exists)
   * @throws Error if SES send fails (propagates for retry/DLQ mechanics)
   */
  async deliver(report: Report, toEmail: string): Promise<void> {
    if (!report.pdfS3Key) {
      throw new Error(
        `Cannot deliver report ${report.id}: pdf_s3_key is null. PDF must be generated first.`
      )
    }

    const pdfBuffer = await this.s3.getObject(this.config.reportsBucket, report.pdfS3Key)
    const rawMessage = this.buildMimeMessage(toEmail, pdfBuffer)
    await this.ses.sendRawEmail(rawMessage)
  }

  /**
   * Builds a RFC 2045 MIME multipart/mixed message with:
   * - A text/html body part (BouCheck branding)
   * - An application/pdf attachment (the report)
   */
  private buildMimeMessage(toEmail: string, pdfBuffer: Buffer): Buffer {
    const boundary = `----=_BouCheck_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const subject = 'Seu relatório diagnóstico BouCheck'

    const htmlBody = `<html>
<body style="font-family: Arial, sans-serif; color: #333;">
  <h2 style="color: #2c3e50;">BouCheck - Relatório Diagnóstico</h2>
  <p>Olá,</p>
  <p>Segue em anexo o seu relatório diagnóstico em formato PDF.</p>
  <p>Você também pode visualizá-lo diretamente pelo link que recebeu na tela de conclusão.</p>
  <br/>
  <p style="color: #666; font-size: 12px;">Este é um e-mail automático enviado pela plataforma BouCheck — BeOnUp.</p>
</body>
</html>`

    const parts = [
      `From: ${this.config.fromEmail}`,
      `To: ${toEmail}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      htmlBody,
      '',
      `--${boundary}`,
      'Content-Type: application/pdf; name="relatorio-boucheck.pdf"',
      'Content-Disposition: attachment; filename="relatorio-boucheck.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      pdfBuffer.toString('base64'),
      '',
      `--${boundary}--`,
    ]

    return Buffer.from(parts.join('\r\n'))
  }
}

// ---------------------------------------------------------------------------
// Default production adapters
// ---------------------------------------------------------------------------

/**
 * Wraps the AWS SDK SES client into the SesClientLike interface.
 */
function buildSesAdapter(): SesClientLike {
  const region = process.env.AWS_REGION ?? 'us-east-1'
  const client = new SESClient({ region })

  return {
    async sendRawEmail(rawMessage: Buffer): Promise<void> {
      await client.send(
        new SendRawEmailCommand({
          RawMessage: { Data: rawMessage },
        })
      )
    },
  }
}

/**
 * Wraps the AWS SDK S3 client into the S3ClientLike interface (getObject).
 */
function buildS3Adapter(): S3ClientLike {
  const region = process.env.AWS_REGION ?? 'us-east-1'
  const client = new S3Client({ region })

  return {
    async getObject(bucket: string, key: string): Promise<Buffer> {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      )
      const stream = response.Body
      if (!stream) {
        throw new Error(`S3 GetObject returned empty body for ${bucket}/${key}`)
      }
      // Convert the readable stream to a Buffer
      const chunks: Uint8Array[] = []
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk)
      }
      return Buffer.concat(chunks)
    },
  }
}

/**
 * Default singleton instance sourced from environment variables.
 */
export default new EmailDeliveryService(buildSesAdapter(), buildS3Adapter(), {
  fromEmail: process.env.SES_FROM_EMAIL ?? 'noreply@boucheck.beonup.com.br',
  reportsBucket: process.env.S3_REPORTS_BUCKET ?? 'boucheck-reports',
})
