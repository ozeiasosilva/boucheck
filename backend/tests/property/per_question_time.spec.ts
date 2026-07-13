import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { DateTime } from 'luxon'
import { computePerQuestionTime } from '../../app/services/compute_per_question_time.js'

/**
 * Property-based tests for computePerQuestionTime
 * Property 10: Per-question time calculation
 * Validates: Requirements 6.1, 6.2, 6.3
 */

/**
 * Generator: produces a startedAt DateTime and a list of perguntaRespondida events
 * with strictly increasing createdAt timestamps.
 */
function eventsArbitrary() {
  return fc
    .record({
      baseTimestampMs: fc.integer({ min: 0, max: 2_000_000_000_000 }), // base timestamp in ms
      offsets: fc.array(
        fc.record({
          questionId: fc.integer({ min: 1, max: 10_000 }),
          deltaMs: fc.integer({ min: 1, max: 600_000 }), // 1ms to 10 minutes between events
        }),
        { minLength: 0, maxLength: 50 }
      ),
    })
    .map(({ baseTimestampMs, offsets }) => {
      const startedAt = DateTime.fromMillis(baseTimestampMs, { zone: 'utc' })
      let currentMs = baseTimestampMs
      const events = offsets.map(({ questionId, deltaMs }) => {
        currentMs += deltaMs
        return {
          questionId,
          createdAt: DateTime.fromMillis(currentMs, { zone: 'utc' }),
        }
      })
      return { startedAt, events }
    })
}

/**
 * Generator: produces at least one event (non-empty).
 */
function nonEmptyEventsArbitrary() {
  return fc
    .record({
      baseTimestampMs: fc.integer({ min: 0, max: 2_000_000_000_000 }),
      offsets: fc.array(
        fc.record({
          questionId: fc.integer({ min: 1, max: 10_000 }),
          deltaMs: fc.integer({ min: 1, max: 600_000 }),
        }),
        { minLength: 1, maxLength: 50 }
      ),
    })
    .map(({ baseTimestampMs, offsets }) => {
      const startedAt = DateTime.fromMillis(baseTimestampMs, { zone: 'utc' })
      let currentMs = baseTimestampMs
      const events = offsets.map(({ questionId, deltaMs }) => {
        currentMs += deltaMs
        return {
          questionId,
          createdAt: DateTime.fromMillis(currentMs, { zone: 'utc' }),
        }
      })
      return { startedAt, events }
    })
}

describe('Property 10: Per-question time calculation', () => {
  it('output length equals input length (Req 6.1)', () => {
    fc.assert(
      fc.property(eventsArbitrary(), ({ startedAt, events }) => {
        const result = computePerQuestionTime(startedAt, events)
        assert.strictEqual(result.length, events.length)
      }),
      { numRuns: 200 }
    )
  })

  it('all durations sum to total elapsed time (Req 6.1, 6.2, 6.3)', () => {
    fc.assert(
      fc.property(nonEmptyEventsArbitrary(), ({ startedAt, events }) => {
        const result = computePerQuestionTime(startedAt, events)
        const totalSeconds = result.reduce((sum, r) => sum + r.seconds, 0)
        const expectedTotal = events[events.length - 1].createdAt.diff(startedAt, 'seconds').seconds
        // Allow a tiny floating-point tolerance
        assert.ok(
          Math.abs(totalSeconds - expectedTotal) < 1e-6,
          `Sum of durations (${totalSeconds}) should equal total elapsed (${expectedTotal})`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('first event duration is from startedAt (Req 6.3)', () => {
    fc.assert(
      fc.property(nonEmptyEventsArbitrary(), ({ startedAt, events }) => {
        const result = computePerQuestionTime(startedAt, events)
        const expectedFirstSeconds = events[0].createdAt.diff(startedAt, 'seconds').seconds
        assert.ok(
          Math.abs(result[0].seconds - expectedFirstSeconds) < 1e-6,
          `First duration (${result[0].seconds}) should equal diff from startedAt (${expectedFirstSeconds})`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('each duration is from the preceding event (Req 6.2)', () => {
    fc.assert(
      fc.property(nonEmptyEventsArbitrary(), ({ startedAt, events }) => {
        const result = computePerQuestionTime(startedAt, events)
        for (let i = 1; i < result.length; i++) {
          const expectedSeconds = events[i].createdAt.diff(events[i - 1].createdAt, 'seconds').seconds
          assert.ok(
            Math.abs(result[i].seconds - expectedSeconds) < 1e-6,
            `Duration at index ${i} (${result[i].seconds}) should equal diff from previous event (${expectedSeconds})`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  it('question IDs are preserved in order (Req 6.1)', () => {
    fc.assert(
      fc.property(eventsArbitrary(), ({ startedAt, events }) => {
        const result = computePerQuestionTime(startedAt, events)
        for (let i = 0; i < result.length; i++) {
          assert.strictEqual(
            result[i].questionId,
            events[i].questionId,
            `questionId at index ${i} should be preserved`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  it('empty input yields empty output (Req 6.1)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000_000_000 }),
        (baseMs) => {
          const startedAt = DateTime.fromMillis(baseMs, { zone: 'utc' })
          const result = computePerQuestionTime(startedAt, [])
          assert.deepStrictEqual(result, [])
        }
      ),
      { numRuns: 100 }
    )
  })
})
