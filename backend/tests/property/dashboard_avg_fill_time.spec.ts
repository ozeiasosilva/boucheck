import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for Dashboard average fill time.
 * Property 19: Average fill time
 * Validates: Requirements 12.1, 12.2, 12.3
 *
 * Tests the pure computation logic: AVG(completedAt - startedAt) over sessions
 * with status 'completo'. Returns null when zero completed sessions match.
 */

interface Session {
  status: 'iniciado' | 'completo'
  startedAt: number
  completedAt: number | null
}

/**
 * Pure function that mirrors the average fill time logic in DashboardService.
 * Formula: AVG(completedAt - startedAt) over sessions with status 'completo'
 * Returns null when zero completed sessions match (Req 12.3)
 */
function computeAvgFillTime(sessions: Session[]): number | null {
  const completed = sessions.filter((s) => s.status === 'completo' && s.completedAt !== null)
  if (completed.length === 0) return null
  const sum = completed.reduce((acc, s) => acc + (s.completedAt! - s.startedAt), 0)
  return sum / completed.length
}

describe('Property 19: Average fill time', () => {
  it('returns null when zero completed sessions (Req 12.3)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            status: fc.constant('iniciado' as const),
            startedAt: fc.integer({ min: 0, max: 1_000_000 }),
            completedAt: fc.constant(null),
          }),
          { minLength: 0, maxLength: 50 }
        ),
        (sessions) => {
          const result = computeAvgFillTime(sessions)
          assert.strictEqual(
            result,
            null,
            `Expected null when all sessions have status 'iniciado', got ${result}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('excludes iniciado sessions from the average (Req 12.2)', () => {
    fc.assert(
      fc.property(
        // Generate at least one completed session
        fc.array(
          fc.integer({ min: 0, max: 1_000_000 }).chain((startedAt) =>
            fc.record({
              status: fc.constant('completo' as const),
              startedAt: fc.constant(startedAt),
              completedAt: fc.integer({ min: startedAt, max: startedAt + 1_000_000 }),
            })
          ),
          { minLength: 1, maxLength: 20 }
        ),
        // Generate some iniciado sessions to mix in
        fc.array(
          fc.record({
            status: fc.constant('iniciado' as const),
            startedAt: fc.integer({ min: 0, max: 1_000_000 }),
            completedAt: fc.constant(null),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        (completedSessions, iniciadoSessions) => {
          const avgWithoutIniciado = computeAvgFillTime(completedSessions)
          const avgWithIniciado = computeAvgFillTime([...completedSessions, ...iniciadoSessions])
          assert.strictEqual(
            avgWithIniciado,
            avgWithoutIniciado,
            `Adding 'iniciado' sessions should not change the average. Without: ${avgWithoutIniciado}, With: ${avgWithIniciado}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('average is non-negative when completedAt >= startedAt (Req 12.1)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 0, max: 1_000_000 }).chain((startedAt) =>
            fc.record({
              status: fc.constant('completo' as const),
              startedAt: fc.constant(startedAt),
              completedAt: fc.integer({ min: startedAt, max: startedAt + 1_000_000 }),
            })
          ),
          { minLength: 1, maxLength: 50 }
        ),
        (sessions) => {
          const result = computeAvgFillTime(sessions)
          assert.ok(
            result !== null && result >= 0,
            `Average should be non-negative for valid data, got ${result}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('single completed session returns exact fill time (Req 12.1)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (startedAt, duration) => {
          const completedAt = startedAt + duration
          const sessions: Session[] = [{ status: 'completo', startedAt, completedAt }]
          const result = computeAvgFillTime(sessions)
          assert.strictEqual(
            result,
            duration,
            `Single session avg should equal completedAt - startedAt = ${duration}, got ${result}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('average of identical fill times equals that fill time (Req 12.1)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (duration, count, baseStart) => {
          const sessions: Session[] = Array.from({ length: count }, (_, i) => ({
            status: 'completo' as const,
            startedAt: baseStart + i * 100,
            completedAt: baseStart + i * 100 + duration,
          }))
          const result = computeAvgFillTime(sessions)
          assert.strictEqual(
            result,
            duration,
            `Average of ${count} sessions all with duration ${duration} should equal ${duration}, got ${result}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('result is always between min and max fill times (Req 12.1)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 0, max: 1_000_000 }).chain((startedAt) =>
            fc.record({
              status: fc.constant('completo' as const),
              startedAt: fc.constant(startedAt),
              completedAt: fc.integer({ min: startedAt, max: startedAt + 1_000_000 }),
            })
          ),
          { minLength: 1, maxLength: 50 }
        ),
        (sessions) => {
          const result = computeAvgFillTime(sessions)!
          const durations = sessions.map((s) => s.completedAt! - s.startedAt)
          const min = Math.min(...durations)
          const max = Math.max(...durations)
          assert.ok(
            result >= min && result <= max,
            `Average ${result} should be within [${min}, ${max}]`
          )
        }
      ),
      { numRuns: 200 }
    )
  })
})
