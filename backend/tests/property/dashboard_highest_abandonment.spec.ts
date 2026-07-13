import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for Dashboard highest-abandonment question.
 * Property 20: Highest-abandonment question selection and tie-break
 * Validates: Requirements 13.1, 13.2, 13.3
 *
 * Tests the pure computation logic: among 'iniciado' sessions, find the
 * last-answered question per session, group by question, and return the one
 * with the highest count. Tie-break: lowest question_id.
 * Returns null when zero 'iniciado' sessions match or none have a lastAnsweredQuestionId.
 */

interface Session {
  status: 'iniciado' | 'completo'
  lastAnsweredQuestionId: number | null
}

/**
 * Pure function that mirrors the highest-abandonment question logic in DashboardService.
 * For each 'iniciado' session, the lastAnsweredQuestionId identifies where the respondent
 * stopped. Group by question and return the one with the highest count.
 * Tie-break: lowest question_id. Returns null when no qualifying sessions exist (Req 13.3).
 */
function computeHighestAbandonment(
  sessions: Array<{ status: 'iniciado' | 'completo'; lastAnsweredQuestionId: number | null }>
): { questionId: number; count: number } | null {
  // Only 'iniciado' sessions contribute (Req 13.1)
  const iniciado = sessions.filter(
    (s) => s.status === 'iniciado' && s.lastAnsweredQuestionId !== null
  )

  if (iniciado.length === 0) return null // Req 13.3

  // Group by lastAnsweredQuestionId and count
  const counts = new Map<number, number>()
  for (const s of iniciado) {
    const qId = s.lastAnsweredQuestionId!
    counts.set(qId, (counts.get(qId) || 0) + 1)
  }

  // Find the highest count, tie-break by lowest question_id (Req 13.2)
  let bestId = -1
  let bestCount = -1
  for (const [qId, count] of counts) {
    if (count > bestCount || (count === bestCount && qId < bestId)) {
      bestId = qId
      bestCount = count
    }
  }

  return { questionId: bestId, count: bestCount }
}

describe('Property 20: Highest-abandonment question selection and tie-break', () => {
  it('returns null when zero iniciado sessions (Req 13.3)', () => {
    /**
     * **Validates: Requirements 13.3**
     */
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            status: fc.constant('completo' as const),
            lastAnsweredQuestionId: fc.oneof(
              fc.constant(null),
              fc.integer({ min: 1, max: 1000 })
            ),
          }),
          { minLength: 0, maxLength: 50 }
        ),
        (sessions) => {
          const result = computeHighestAbandonment(sessions)
          assert.strictEqual(
            result,
            null,
            `Expected null when all sessions are 'completo', got ${JSON.stringify(result)}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('returns null when no iniciado session has a lastAnsweredQuestionId (Req 13.3)', () => {
    /**
     * **Validates: Requirements 13.3**
     */
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            status: fc.constant('iniciado' as const),
            lastAnsweredQuestionId: fc.constant(null),
          }),
          { minLength: 0, maxLength: 50 }
        ),
        // Optionally mix in some 'completo' sessions
        fc.array(
          fc.record({
            status: fc.constant('completo' as const),
            lastAnsweredQuestionId: fc.oneof(
              fc.constant(null),
              fc.integer({ min: 1, max: 1000 })
            ),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        (iniciadoSessions, completoSessions) => {
          const result = computeHighestAbandonment([...iniciadoSessions, ...completoSessions])
          assert.strictEqual(
            result,
            null,
            `Expected null when no 'iniciado' session has a lastAnsweredQuestionId, got ${JSON.stringify(result)}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('selected question has the highest count (Req 13.2)', () => {
    /**
     * **Validates: Requirements 13.2**
     */
    fc.assert(
      fc.property(
        // Generate at least one 'iniciado' session with a non-null lastAnsweredQuestionId
        fc.array(
          fc.record({
            status: fc.constant('iniciado' as const),
            lastAnsweredQuestionId: fc.integer({ min: 1, max: 50 }),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        // Optionally mix in some 'completo' sessions
        fc.array(
          fc.record({
            status: fc.constant('completo' as const),
            lastAnsweredQuestionId: fc.oneof(
              fc.constant(null),
              fc.integer({ min: 1, max: 50 })
            ),
          }),
          { minLength: 0, maxLength: 30 }
        ),
        (iniciadoSessions, completoSessions) => {
          const allSessions: Session[] = [...iniciadoSessions, ...completoSessions]
          const result = computeHighestAbandonment(allSessions)

          assert.ok(result !== null, 'Should not be null when iniciado sessions with questions exist')

          // Manually compute all counts for 'iniciado' sessions
          const counts = new Map<number, number>()
          for (const s of iniciadoSessions) {
            if (s.lastAnsweredQuestionId !== null) {
              const qId = s.lastAnsweredQuestionId
              counts.set(qId, (counts.get(qId) || 0) + 1)
            }
          }

          // No other question should have a higher count
          for (const [, count] of counts) {
            assert.ok(
              count <= result.count,
              `Found a question with count ${count} > selected count ${result.count}`
            )
          }

          // The selected question's count should match the actual count
          assert.strictEqual(
            result.count,
            counts.get(result.questionId),
            `Selected question ${result.questionId} count should be ${counts.get(result.questionId)}, got ${result.count}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('tie-break by lowest question_id (design decision)', () => {
    /**
     * **Validates: Requirements 13.2**
     */
    fc.assert(
      fc.property(
        // Generate sessions with at least 2 distinct question ids that will tie
        fc.integer({ min: 2, max: 10 }).chain((numQuestions) =>
          fc.tuple(
            // Unique question ids
            fc.uniqueArray(fc.integer({ min: 1, max: 1000 }), {
              minLength: numQuestions,
              maxLength: numQuestions,
            }),
            // Count per question (all the same to force a tie)
            fc.integer({ min: 1, max: 20 })
          )
        ),
        ([questionIds, countPerQuestion]) => {
          // Build sessions so every question has exactly the same count
          const sessions: Session[] = []
          for (const qId of questionIds) {
            for (let i = 0; i < countPerQuestion; i++) {
              sessions.push({ status: 'iniciado', lastAnsweredQuestionId: qId })
            }
          }

          const result = computeHighestAbandonment(sessions)

          assert.ok(result !== null, 'Should not be null when sessions exist')
          assert.strictEqual(
            result.count,
            countPerQuestion,
            `Expected count ${countPerQuestion}, got ${result.count}`
          )

          // Tie-break: lowest question_id wins
          const lowestId = Math.min(...questionIds)
          assert.strictEqual(
            result.questionId,
            lowestId,
            `Tie-break should select lowest question_id ${lowestId}, got ${result.questionId}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('only iniciado sessions contribute - completo sessions are ignored', () => {
    /**
     * **Validates: Requirements 13.1**
     */
    fc.assert(
      fc.property(
        // Generate at least one 'iniciado' session with a non-null lastAnsweredQuestionId
        fc.array(
          fc.record({
            status: fc.constant('iniciado' as const),
            lastAnsweredQuestionId: fc.integer({ min: 1, max: 50 }),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        // Generate 'completo' sessions with potentially different question ids
        fc.array(
          fc.record({
            status: fc.constant('completo' as const),
            lastAnsweredQuestionId: fc.integer({ min: 1, max: 50 }),
          }),
          { minLength: 0, maxLength: 50 }
        ),
        (iniciadoSessions, completoSessions) => {
          // Result with only 'iniciado' sessions
          const resultWithoutCompleto = computeHighestAbandonment(iniciadoSessions)
          // Result with mixed sessions
          const resultWithCompleto = computeHighestAbandonment([
            ...iniciadoSessions,
            ...completoSessions,
          ])

          // Adding 'completo' sessions should not change the result
          assert.deepStrictEqual(
            resultWithCompleto,
            resultWithoutCompleto,
            `Adding 'completo' sessions should not change result. Without: ${JSON.stringify(resultWithoutCompleto)}, With: ${JSON.stringify(resultWithCompleto)}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })
})
