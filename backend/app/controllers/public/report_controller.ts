import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import Report from '#models/report'
import ResponseEvent from '#models/response_event'

const s3Region = process.env.AWS_REGION ?? 'us-east-1'
const reportsBucket = process.env.S3_REPORTS_BUCKET ?? 'boucheck-reports'
const s3 = new S3Client({ region: s3Region })

export default class ReportController {
  /**
   * GET /r/:token
   *
   * Serves the Report HTML for a valid, non-expired public token.
   * Returns a generic 404 for both "no match" and "expired" — no information leak.
   * No auth middleware applied to this route.
   *
   * Validates: Requirements 8.4, 8.5, 17.3
   */
  async show({ params, response }: HttpContext) {
    const { token } = params

    const report = await Report.query().where('public_token', token).first()

    // Generic 404 for no match (Req 8.5)
    if (!report) {
      return response.notFound({ error: 'not_found' })
    }

    // Generic 404 for expired token (Req 8.5, 17.3)
    if (report.expiresAt && report.expiresAt < DateTime.now()) {
      return response.notFound({ error: 'not_found' })
    }

    // Fetch HTML from S3
    const html = await this.fetchHtmlFromS3(report.htmlS3Key)
    if (!html) {
      return response.notFound({ error: 'not_found' })
    }

    // Log the access event (Req 8.4)
    await ResponseEvent.create({
      responseId: report.responseId,
      tipo: 'relatorio_link_acessado',
      payload: null,
    })

    return response.header('Content-Type', 'text/html; charset=utf-8').send(html)
  }

  private async fetchHtmlFromS3(key: string): Promise<string | null> {
    try {
      const result = await s3.send(
        new GetObjectCommand({ Bucket: reportsBucket, Key: key })
      )
      if (!result.Body) {
        return null
      }
      const chunks: Uint8Array[] = []
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk)
      }
      return Buffer.concat(chunks).toString('utf-8')
    } catch {
      return null
    }
  }
}
