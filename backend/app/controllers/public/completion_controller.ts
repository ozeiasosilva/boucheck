import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { revalidateAnsweredPath } from '#services/navigation_validator'
import ResponseEvent from '#models/response_event'
import reportingQueue from '#services/reporting_queue_client'

export default class CompletionController {
  /**
   * POST /api/public/responses/:token/complete
   *
   * Triggers backend path revalidation and transitions the session to `completo`.
   *
   * - Calls `revalidateAnsweredPath` to verify the answered path is valid.
   * - On invalid path → 422 with `{ error: 'invalid_answered_path' }`.
   * - On valid path → sets `status = 'completo'`, records `completed_at`, logs
   *   `concluido` event, triggers reporting handoff (SQS placeholder).
   *
   * Note: The idempotent case (session already `completo`) is handled by the
   * ResponseTokenAuth middleware which short-circuits with 200 before reaching
   * this controller.
   *
   * Validates: Requirements 5.8, 5.9, 7.1, 7.2, 7.3, 7.4, 7.5
   */
  async handle({ response, response_session }: HttpContext) {
    const session = response_session!

    // Revalidate the answered path deterministically
    const isValid = await revalidateAnsweredPath(
      session.id,
      session.surveyId,
      session.surveyVersion
    )

    if (!isValid) {
      return response.status(422).json({
        error: 'invalid_answered_path',
        details:
          'The answered path does not form a valid traversal of the survey structure. ' +
          'Some answers may be off-path or mandatory questions may be unanswered.',
      })
    }

    // Transition to completo
    const now = DateTime.now()
    session.status = 'completo'
    session.completedAt = now
    await session.save()

    // Log concluido event
    await ResponseEvent.create({
      responseId: session.id,
      tipo: 'concluido',
      payload: {
        completed_at: now.toISO(),
      },
    })

    // Reporting handoff — enqueue score_calculate to start the pipeline (Req 1.3, 18.1)
    try {
      await reportingQueue.enqueue({
        kind: 'score_calculate',
        response_id: String(session.id),
      })
    } catch (err) {
      // Log but don't fail the completion — the user's session is already marked complete.
      // The reporting pipeline can be retried manually or via DLQ redrive.
      console.error(
        `[reporting-handoff] Failed to enqueue score_calculate for response_id=${session.id}:`,
        err
      )
    }

    return response.ok({
      completed: true,
      completed_at: now.toISO(),
    })
  }
}
