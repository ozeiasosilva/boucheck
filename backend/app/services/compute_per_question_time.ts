import { DateTime } from 'luxon'

// ---------------------------------------------------------------------------
// computePerQuestionTime (Req 6)
// ---------------------------------------------------------------------------

/**
 * Pure function — computes the per-question fill time from a sequence of
 * `pergunta_respondida` events ordered ascending by `created_at`.
 *
 * - The first event's duration is measured from `startedAt`.
 * - Each subsequent event's duration is measured from the preceding event's timestamp.
 * - An empty input yields an empty array (Req 6.4).
 */
export function computePerQuestionTime(
  startedAt: DateTime,
  perguntaRespondidaEvents: Array<{ questionId: number; createdAt: DateTime }>
): Array<{ questionId: number; seconds: number }> {
  const result: Array<{ questionId: number; seconds: number }> = []
  let previous = startedAt

  for (const event of perguntaRespondidaEvents) {
    result.push({
      questionId: event.questionId,
      seconds: event.createdAt.diff(previous, 'seconds').seconds,
    })
    previous = event.createdAt
  }

  return result
}
