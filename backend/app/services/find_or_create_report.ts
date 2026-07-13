import { DateTime } from 'luxon'
import Report from '#models/report'
import Response from '#models/response'
import { generatePublicReportToken } from './public_report_token.js'

interface FindOrCreateReportInput {
  responseId: string
  htmlS3Key: string
}

/**
 * Find-or-create a Report row for a given Response_Session.
 *
 * - On redelivery (existing report): updates `html_s3_key` in-place without
 *   regenerating `public_token` or `expires_at` (Req 1.4, 8.2, 8.3).
 * - On first creation: generates a unique `public_token` via a bounded
 *   collision loop against `reports_public_token_unique`, and computes
 *   `expires_at = completed_at + 90 days` (Req 17.2).
 *
 * Validates: Requirements 1.4, 8.2, 8.3, 17.2
 */
export async function findOrCreateReport(input: FindOrCreateReportInput): Promise<Report> {
  // Redelivery case: report already exists for this response_id
  const existing = await Report.query().where('response_id', input.responseId).first()
  if (existing) {
    // Update HTML key in-place; never regenerate token/expiry (Req 1.4)
    existing.htmlS3Key = input.htmlS3Key
    await existing.save()
    return existing
  }

  // New report: load the response to compute expires_at from completed_at
  const response = await Response.query().where('id', input.responseId).firstOrFail()
  const expiresAt = response.completedAt
    ? response.completedAt.plus({ days: 90 })
    : DateTime.now().plus({ days: 90 })

  // Bounded collision loop for token uniqueness (Req 17.2)
  const MAX_RETRIES = 5
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const token = generatePublicReportToken()
    try {
      const report = await Report.create({
        responseId: input.responseId,
        htmlS3Key: input.htmlS3Key,
        publicToken: token,
        expiresAt,
      })
      return report
    } catch (err: any) {
      const isUniqueViolation = err.code === '23505'

      // Token collision — regenerate and retry
      if (isUniqueViolation && err.constraint === 'reports_public_token_unique') {
        continue
      }

      // Race condition: another process created the report for the same response_id
      if (isUniqueViolation && err.constraint === 'reports_response_id_unique') {
        const raceWinner = await Report.query()
          .where('response_id', input.responseId)
          .firstOrFail()
        raceWinner.htmlS3Key = input.htmlS3Key
        await raceWinner.save()
        return raceWinner
      }

      throw err
    }
  }

  throw new Error(`Failed to generate unique public_token after ${MAX_RETRIES} attempts`)
}
