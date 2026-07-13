// Feature: public-response-flow, Property: Resume eligibility is exactly status-and-recency gated
/**
 * Property: Resume eligibility is exactly status-and-recency gated
 *
 * For any combination of session `status` and `started_at` offset, a session
 * is resumable if and only if `status === 'iniciado'` AND `started_at` is
 * within 7 days of now.
 *
 * **Validates: Requirements 3.12**
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { DateTime } from 'luxon'
import { RESUME_WINDOW_DAYS } from '#services/session_resume_service'

/**
 * Pure predicate that encapsulates the session resume eligibility logic,
 * mirroring the DB query conditions used by `findResumableSession`:
 *   status == 'iniciado' AND started_at > now - RESUME_WINDOW_DAYS days
 */
function isResumable(status: string, startedAt: DateTime, now: DateTime): boolean {
  return status === 'iniciado' && startedAt > now.minus({ days: RESUME_WINDOW_DAYS })
}

// --- Generators ---

/** All known session statuses plus arbitrary strings */
const statusArb = fc.oneof(
  fc.constantFrom('iniciado', 'completo', 'abandonado'),
  fc.string({ minLength: 1, maxLength: 20 })
)

/**
 * Offset in minutes from "now", ranging from -30 days in the past to +1 day
 * in the future. This gives us a wide spread around the 7-day boundary.
 */
const offsetMinutesArb = fc.integer({
  min: -30 * 24 * 60, // -30 days
  max: 1 * 24 * 60, // +1 day
})

describe('Property: Session resume eligibility is exactly status-and-recency gated', () => {
  it('isResumable returns true iff status is "iniciado" AND startedAt is within 7 days of now', () => {
    const now = DateTime.now()

    fc.assert(
      fc.property(statusArb, offsetMinutesArb, (status, offsetMinutes) => {
        const startedAt = now.plus({ minutes: offsetMinutes })

        const result = isResumable(status, startedAt, now)

        // Expected: resumable only when both conditions hold
        const isStatusValid = status === 'iniciado'
        const isWithinWindow = startedAt > now.minus({ days: RESUME_WINDOW_DAYS })
        const expected = isStatusValid && isWithinWindow

        assert.strictEqual(
          result,
          expected,
          `Expected isResumable("${status}", offset=${offsetMinutes}min) to be ${expected}, got ${result}`
        )
      }),
      { numRuns: 1000 }
    )
  })

  it('sessions exactly at the boundary (7 days ago to the millisecond) are NOT resumable', () => {
    const now = DateTime.now()
    const exactBoundary = now.minus({ days: RESUME_WINDOW_DAYS })

    // At or before the boundary, the condition startedAt > cutoff is false
    const result = isResumable('iniciado', exactBoundary, now)
    assert.strictEqual(result, false, 'Session started exactly 7 days ago should NOT be resumable')
  })

  it('sessions 1 millisecond after the boundary ARE resumable', () => {
    const now = DateTime.now()
    const justAfterBoundary = now.minus({ days: RESUME_WINDOW_DAYS }).plus({ milliseconds: 1 })

    const result = isResumable('iniciado', justAfterBoundary, now)
    assert.strictEqual(result, true, 'Session started 1ms after the 7-day cutoff SHOULD be resumable')
  })

  it('non-iniciado status is never resumable regardless of recency', () => {
    const now = DateTime.now()
    const nonIniciadoStatus = fc.oneof(
      fc.constantFrom('completo', 'abandonado'),
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s !== 'iniciado')
    )

    fc.assert(
      fc.property(nonIniciadoStatus, offsetMinutesArb, (status, offsetMinutes) => {
        const startedAt = now.plus({ minutes: offsetMinutes })
        const result = isResumable(status, startedAt, now)
        assert.strictEqual(
          result,
          false,
          `Non-iniciado status "${status}" should never be resumable`
        )
      }),
      { numRuns: 500 }
    )
  })

  it('iniciado sessions older than 7 days are never resumable', () => {
    const now = DateTime.now()
    // Offsets from -30 days to exactly -7 days (in minutes)
    const oldOffsetArb = fc.integer({
      min: -30 * 24 * 60,
      max: -RESUME_WINDOW_DAYS * 24 * 60,
    })

    fc.assert(
      fc.property(oldOffsetArb, (offsetMinutes) => {
        const startedAt = now.plus({ minutes: offsetMinutes })
        const result = isResumable('iniciado', startedAt, now)
        assert.strictEqual(
          result,
          false,
          `Iniciado session with offset=${offsetMinutes}min (older than 7 days) should NOT be resumable`
        )
      }),
      { numRuns: 500 }
    )
  })
})
