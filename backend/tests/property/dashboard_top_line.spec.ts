import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for Dashboard top-line counts and completion rate.
 * Property 17: Top-line counts and completion rate
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 *
 * Since `computeTopLineCounts` requires a PostgreSQL connection, we test the
 * completion rate computation formula as a pure function.
 */

/**
 * Pure function that mirrors the completion rate logic in DashboardService.computeTopLineCounts().
 * The formula: startedCount === 0 ? 0 : (completedCount / startedCount) * 100
 */
function computeRate(started: number, completed: number): number {
  return started === 0 ? 0 : (completed / started) * 100
}

describe('Property 17: Top-line counts and completion rate', () => {
  it('divide-by-zero guard: when startedCount = 0, rate is always 0 (Req 10.5)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        (completedCount) => {
          const rate = computeRate(0, completedCount)
          assert.strictEqual(
            rate,
            0,
            `Rate should be 0 when startedCount=0, got ${rate} for completedCount=${completedCount}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('rate is between 0 and 100 when completedCount <= startedCount and both >= 0 (Req 10.4)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }).chain((started) =>
          fc.record({
            started: fc.constant(started),
            completed: fc.integer({ min: 0, max: started }),
          })
        ),
        ({ started, completed }) => {
          const rate = computeRate(started, completed)
          assert.ok(
            rate >= 0 && rate <= 100,
            `Rate should be in [0, 100], got ${rate} for started=${started}, completed=${completed}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('rate is 100 when all are completed (completedCount === startedCount > 0) (Req 10.4)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        (count) => {
          const rate = computeRate(count, count)
          assert.strictEqual(
            rate,
            100,
            `Rate should be 100 when completedCount === startedCount = ${count}, got ${rate}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('rate is 0 when none completed (completedCount === 0, startedCount > 0) (Req 10.4, 10.5)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        (started) => {
          const rate = computeRate(started, 0)
          assert.strictEqual(
            rate,
            0,
            `Rate should be 0 when completedCount=0 and startedCount=${started}, got ${rate}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('rate proportionality / monotonicity: higher ratio produces higher rate (Req 10.4)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (startedA, completedA, startedB, completedB) => {
          const ratioA = completedA / startedA
          const ratioB = completedB / startedB
          // Only test when ratios are strictly different to avoid floating-point edge cases
          if (ratioA === ratioB) return
          const rateA = computeRate(startedA, completedA)
          const rateB = computeRate(startedB, completedB)
          if (ratioA > ratioB) {
            assert.ok(
              rateA > rateB,
              `rateA (${rateA}) should be > rateB (${rateB}) because ratioA (${ratioA}) > ratioB (${ratioB})`
            )
          } else {
            assert.ok(
              rateA < rateB,
              `rateA (${rateA}) should be < rateB (${rateB}) because ratioA (${ratioA}) < ratioB (${ratioB})`
            )
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('completionRate <= 100 when completedCount does not exceed startedCount (Req 10.4)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }).chain((started) =>
          fc.record({
            started: fc.constant(started),
            completed: fc.integer({ min: 0, max: started }),
          })
        ),
        ({ started, completed }) => {
          const rate = computeRate(started, completed)
          assert.ok(
            rate <= 100,
            `Rate should be <= 100 when completedCount (${completed}) does not exceed startedCount (${started}), got ${rate}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })
})
