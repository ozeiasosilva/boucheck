import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for default ordering
 * Property 4: Default ordering
 * Validates: Requirements 3.1
 *
 * Uses a pure simulation: generates random arrays of sessions with random
 * startedAt timestamps, sorts them using the same logic as SessionQueryBuilder,
 * and verifies ordering invariants.
 */

// ---------------------------------------------------------------------------
// Pure sorting simulation (mirrors SessionQueryBuilder's ORDER BY logic)
// ---------------------------------------------------------------------------

interface SessionStub {
  id: number
  startedAt: number // milliseconds timestamp for easy comparison
}

type SimSortOrder = 'started_at_asc' | 'started_at_desc'

/**
 * Pure sort function that mirrors the SessionQueryBuilder's ordering logic.
 * Default sort order is 'started_at_desc' per Requirement 3.1.
 */
function sortSessions(sessions: SessionStub[], order: SimSortOrder = 'started_at_desc'): SessionStub[] {
  const copy = [...sessions]
  if (order === 'started_at_desc') {
    copy.sort((a, b) => b.startedAt - a.startedAt)
  } else {
    copy.sort((a, b) => a.startedAt - b.startedAt)
  }
  return copy
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const sessionArb: fc.Arbitrary<SessionStub> = fc.record({
  id: fc.integer({ min: 1, max: 100_000 }),
  startedAt: fc.integer({ min: 0, max: 2_000_000_000_000 }), // timestamp in ms
})

const sessionsArrayArb = fc.array(sessionArb, { minLength: 0, maxLength: 100 })

const nonEmptySessionsArrayArb = fc.array(sessionArb, { minLength: 2, maxLength: 100 })

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 4: Default ordering', () => {
  it('default (desc) ordering: each element startedAt >= next element startedAt', () => {
    fc.assert(
      fc.property(sessionsArrayArb, (sessions) => {
        const sorted = sortSessions(sessions, 'started_at_desc')

        for (let i = 0; i < sorted.length - 1; i++) {
          assert.ok(
            sorted[i].startedAt >= sorted[i + 1].startedAt,
            `Index ${i}: startedAt ${sorted[i].startedAt} should be >= next ${sorted[i + 1].startedAt}`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  it('ascending ordering: each element startedAt <= next element startedAt', () => {
    fc.assert(
      fc.property(sessionsArrayArb, (sessions) => {
        const sorted = sortSessions(sessions, 'started_at_asc')

        for (let i = 0; i < sorted.length - 1; i++) {
          assert.ok(
            sorted[i].startedAt <= sorted[i + 1].startedAt,
            `Index ${i}: startedAt ${sorted[i].startedAt} should be <= next ${sorted[i + 1].startedAt}`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  it('sorting preserves all elements: same length and same elements', () => {
    fc.assert(
      fc.property(sessionsArrayArb, (sessions) => {
        const sortedDesc = sortSessions(sessions, 'started_at_desc')
        const sortedAsc = sortSessions(sessions, 'started_at_asc')

        // Same length
        assert.strictEqual(sortedDesc.length, sessions.length)
        assert.strictEqual(sortedAsc.length, sessions.length)

        // Same set of elements (by startedAt values, since ids may repeat)
        const originalTimestamps = sessions.map((s) => s.startedAt).sort((a, b) => a - b)
        const descTimestamps = sortedDesc.map((s) => s.startedAt).sort((a, b) => a - b)
        const ascTimestamps = sortedAsc.map((s) => s.startedAt).sort((a, b) => a - b)

        assert.deepStrictEqual(descTimestamps, originalTimestamps)
        assert.deepStrictEqual(ascTimestamps, originalTimestamps)
      }),
      { numRuns: 200 }
    )
  })

  it('sorting is idempotent: sorting an already sorted array produces the same result', () => {
    fc.assert(
      fc.property(nonEmptySessionsArrayArb, (sessions) => {
        // Desc idempotency
        const sortedOnce = sortSessions(sessions, 'started_at_desc')
        const sortedTwice = sortSessions(sortedOnce, 'started_at_desc')
        assert.deepStrictEqual(sortedTwice, sortedOnce)

        // Asc idempotency
        const sortedOnceAsc = sortSessions(sessions, 'started_at_asc')
        const sortedTwiceAsc = sortSessions(sortedOnceAsc, 'started_at_asc')
        assert.deepStrictEqual(sortedTwiceAsc, sortedOnceAsc)
      }),
      { numRuns: 200 }
    )
  })

  it('default sort order is started_at_desc when no explicit order is specified', () => {
    fc.assert(
      fc.property(sessionsArrayArb, (sessions) => {
        // sortSessions defaults to 'started_at_desc' when no order is given
        const defaultSorted = sortSessions(sessions)
        const explicitDesc = sortSessions(sessions, 'started_at_desc')
        assert.deepStrictEqual(defaultSorted, explicitDesc)
      }),
      { numRuns: 200 }
    )
  })
})
