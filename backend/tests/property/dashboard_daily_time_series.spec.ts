import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for Dashboard daily time series zero-fill completeness.
 * Property 22: Daily time series zero-fill completeness
 * Validates: Requirements 15.1, 15.2
 *
 * Tests the pure computation logic: for each calendar day in the Dashboard_Period,
 * the result contains exactly one entry with the count of matching sessions.
 * Days with zero sessions must appear with count = 0 (zero-fill, Req 15.2).
 */

// ─── Pure simulation types ────────────────────────────────────────────────────

interface Session {
  /** Days offset from the period start (0-based) */
  dayOffset: number
}

interface TimeSeriesEntry {
  date: string // YYYY-MM-DD
  count: number
}

// ─── Helper: produce a YYYY-MM-DD string from a base date + day offset ────────

function addDays(baseDate: Date, days: number): string {
  const d = new Date(baseDate)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(start: Date, end: Date): number {
  const msPerDay = 86_400_000
  return Math.round((end.getTime() - start.getTime()) / msPerDay)
}

// ─── Pure simulation function ─────────────────────────────────────────────────

/**
 * Mirrors DashboardService.computeDailyTimeSeries — pure, no DB.
 *
 * Iterates every calendar day in [periodStart, periodEnd] (inclusive),
 * counts how many sessions fall on that day, and returns one entry per day
 * in ascending date order. Days with zero sessions get count = 0 (Req 15.2).
 */
function computeDailyTimeSeries(
  periodStart: Date,
  periodEnd: Date,
  sessions: Session[]
): TimeSeriesEntry[] {
  const totalDays = daysBetween(periodStart, periodEnd)
  const result: TimeSeriesEntry[] = []

  for (let i = 0; i <= totalDays; i++) {
    const date = addDays(periodStart, i)
    const count = sessions.filter((s) => s.dayOffset === i).length
    result.push({ date, count })
  }

  return result
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generates a period length between 1 and 60 days (inclusive). */
const periodLengthArb = fc.integer({ min: 0, max: 59 }) // 0 means single day (length 1)

/** Generates a deterministic base date in 2023 to keep tests reproducible. */
const baseDateArb = fc.integer({ min: 0, max: 364 }).map((dayOfYear) => {
  const d = new Date(Date.UTC(2023, 0, 1))
  d.setUTCDate(d.getUTCDate() + dayOfYear)
  return d
})

/** Generates a list of sessions, each with a dayOffset within [0, periodLength]. */
function sessionsArb(periodLength: number) {
  return fc.array(
    fc.record({
      dayOffset: fc.integer({ min: 0, max: periodLength }),
    }),
    { minLength: 0, maxLength: 100 }
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 22: Daily time series zero-fill completeness', () => {
  /**
   * **Validates: Requirements 15.1**
   *
   * The result must contain exactly one entry per calendar day in [start, end]:
   * daysBetween(start, end) + 1 entries total.
   */
  it('result contains exactly one entry per day of the period (Req 15.1)', () => {
    fc.assert(
      fc.property(baseDateArb, periodLengthArb, (baseDate, lengthMinus1) => {
        const periodStart = baseDate
        const periodEnd = new Date(baseDate)
        periodEnd.setUTCDate(periodEnd.getUTCDate() + lengthMinus1)

        const sessions = [] // empty — we only test the structural count here
        const result = computeDailyTimeSeries(periodStart, periodEnd, sessions)

        const expectedEntries = lengthMinus1 + 1
        assert.strictEqual(
          result.length,
          expectedEntries,
          `Period of ${lengthMinus1 + 1} day(s) should produce ${expectedEntries} entries, got ${result.length}`
        )
      }),
      { numRuns: 200 }
    )
  })

  /**
   * **Validates: Requirements 15.1**
   *
   * No date in [start, end] is missing: every day must appear in the result.
   */
  it('every day in the period appears exactly once — no gaps (Req 15.1)', () => {
    fc.assert(
      fc.property(baseDateArb, periodLengthArb, (baseDate, lengthMinus1) => {
        const periodStart = baseDate
        const periodEnd = new Date(baseDate)
        periodEnd.setUTCDate(periodEnd.getUTCDate() + lengthMinus1)

        const result = computeDailyTimeSeries(periodStart, periodEnd, [])

        const resultDates = new Set(result.map((e) => e.date))

        for (let i = 0; i <= lengthMinus1; i++) {
          const expectedDate = addDays(periodStart, i)
          assert.ok(
            resultDates.has(expectedDate),
            `Day ${expectedDate} (offset ${i}) is missing from the result`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  /**
   * **Validates: Requirements 15.1**
   *
   * Entries are in ascending date order: result[i].date < result[i+1].date.
   */
  it('dates are in ascending order (Req 15.1)', () => {
    fc.assert(
      fc.property(baseDateArb, periodLengthArb, (baseDate, lengthMinus1) => {
        const periodStart = baseDate
        const periodEnd = new Date(baseDate)
        periodEnd.setUTCDate(periodEnd.getUTCDate() + lengthMinus1)

        const result = computeDailyTimeSeries(periodStart, periodEnd, [])

        for (let i = 1; i < result.length; i++) {
          assert.ok(
            result[i - 1].date < result[i].date,
            `Expected ascending order, but result[${i - 1}].date (${result[i - 1].date}) ` +
              `>= result[${i}].date (${result[i].date})`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  /**
   * **Validates: Requirements 15.1, 15.2**
   *
   * All counts are non-negative integers (count >= 0).
   */
  it('all counts are non-negative integers (Req 15.1, 15.2)', () => {
    fc.assert(
      fc.property(
        baseDateArb.chain((baseDate) =>
          periodLengthArb.chain((lengthMinus1) =>
            sessionsArb(lengthMinus1).map((sessions) => ({ baseDate, lengthMinus1, sessions }))
          )
        ),
        ({ baseDate, lengthMinus1, sessions }) => {
          const periodStart = baseDate
          const periodEnd = new Date(baseDate)
          periodEnd.setUTCDate(periodEnd.getUTCDate() + lengthMinus1)

          const result = computeDailyTimeSeries(periodStart, periodEnd, sessions)

          for (const entry of result) {
            assert.ok(
              Number.isInteger(entry.count) && entry.count >= 0,
              `count for ${entry.date} must be a non-negative integer, got ${entry.count}`
            )
          }
        }
      ),
      { numRuns: 150 }
    )
  })

  /**
   * **Validates: Requirements 15.2**
   *
   * Days with no matching sessions must have count = 0.
   * Simulate sessions on specific days and verify the remaining days are zero-filled.
   */
  it('days with no sessions have count 0 — zero-fill (Req 15.2)', () => {
    fc.assert(
      fc.property(baseDateArb, periodLengthArb, (baseDate, lengthMinus1) => {
        const periodStart = baseDate
        const periodEnd = new Date(baseDate)
        periodEnd.setUTCDate(periodEnd.getUTCDate() + lengthMinus1)

        // Place sessions on a single day (offset 0 = first day of the period).
        // Every other day should be zero-filled.
        const sessions: Session[] = [{ dayOffset: 0 }, { dayOffset: 0 }]

        const result = computeDailyTimeSeries(periodStart, periodEnd, sessions)

        for (const entry of result) {
          const isSessionDay = entry.date === addDays(periodStart, 0)
          if (!isSessionDay) {
            assert.strictEqual(
              entry.count,
              0,
              `Day ${entry.date} has no sessions — expected count 0, got ${entry.count}`
            )
          }
        }
      }),
      { numRuns: 150 }
    )
  })

  /**
   * **Validates: Requirements 15.1, 15.2**
   *
   * Session counts sum correctly: the sum of all daily counts equals
   * the total number of sessions in the period.
   */
  it('sum of all daily counts equals total session count (Req 15.1, 15.2)', () => {
    fc.assert(
      fc.property(
        baseDateArb.chain((baseDate) =>
          periodLengthArb.chain((lengthMinus1) =>
            sessionsArb(lengthMinus1).map((sessions) => ({ baseDate, lengthMinus1, sessions }))
          )
        ),
        ({ baseDate, lengthMinus1, sessions }) => {
          const periodStart = baseDate
          const periodEnd = new Date(baseDate)
          periodEnd.setUTCDate(periodEnd.getUTCDate() + lengthMinus1)

          const result = computeDailyTimeSeries(periodStart, periodEnd, sessions)

          const totalCount = result.reduce((acc, e) => acc + e.count, 0)
          assert.strictEqual(
            totalCount,
            sessions.length,
            `Sum of daily counts (${totalCount}) should equal total sessions (${sessions.length})`
          )
        }
      ),
      { numRuns: 150 }
    )
  })

  /**
   * **Validates: Requirements 15.2**
   *
   * A single-day period (start === end) always returns exactly one entry
   * whose count equals the number of sessions on that day.
   */
  it('single-day period returns exactly one entry with correct count (Req 15.1, 15.2)', () => {
    fc.assert(
      fc.property(
        baseDateArb,
        fc.integer({ min: 0, max: 50 }),
        (baseDate, sessionCount) => {
          const sessions: Session[] = Array.from({ length: sessionCount }, () => ({ dayOffset: 0 }))
          const result = computeDailyTimeSeries(baseDate, baseDate, sessions)

          assert.strictEqual(result.length, 1, `Single-day period must return exactly 1 entry, got ${result.length}`)
          assert.strictEqual(
            result[0].count,
            sessionCount,
            `Single-day entry count should be ${sessionCount}, got ${result[0].count}`
          )
          assert.strictEqual(
            result[0].date,
            addDays(baseDate, 0),
            `Single-day entry date should be the period start, got ${result[0].date}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })
})
