import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for All-surveys scope equivalence.
 * Property 25: All-surveys scope equivalence
 * Validates: Requirements 17.4
 *
 * When `surveyId === 'all'`, the dashboard computes across all surveys by
 * omitting the `survey_id = ?` condition from the SQL predicate. We simulate
 * `buildPredicate` as a pure function and verify the behavioral contract.
 */

// --- Interfaces ---

interface DashboardFilters {
  surveyId: number | 'all'
  periodStart: string // ISO date, inclusive
  periodEnd: string // ISO date, inclusive
}

// --- Pure simulation of buildPredicate (mirrors DashboardService.buildPredicate) ---

function buildPredicate(
  filters: DashboardFilters,
  tableAlias: string = 'r'
): { sql: string; bindings: (string | number)[] } {
  const conditions: string[] = []
  const bindings: (string | number)[] = []

  // Survey filter — omit when 'all' (Req 17.4)
  if (filters.surveyId !== 'all') {
    conditions.push(`${tableAlias}.survey_id = ?`)
    bindings.push(filters.surveyId)
  }

  // Period filter — inclusive on started_at
  conditions.push(`${tableAlias}.started_at >= ?`)
  bindings.push(filters.periodStart)

  conditions.push(`${tableAlias}.started_at <= ?`)
  bindings.push(filters.periodEnd)

  return {
    sql: conditions.join(' AND '),
    bindings,
  }
}

// --- Session matching simulation ---

interface Session {
  surveyId: number
  startedAt: string // ISO date
}

/**
 * Simulates whether a session matches the predicate produced by buildPredicate.
 * This mirrors the SQL WHERE clause behavior at application level.
 */
function sessionMatchesPredicate(session: Session, filters: DashboardFilters): boolean {
  // Survey filter
  if (filters.surveyId !== 'all' && session.surveyId !== filters.surveyId) {
    return false
  }
  // Period filter
  if (session.startedAt < filters.periodStart || session.startedAt > filters.periodEnd) {
    return false
  }
  return true
}

// --- Generators ---

const isoDateArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(
    ({ year, month, day }) =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  )

const orderedDatePairArb = isoDateArb.chain((start) =>
  isoDateArb.map((end) => (start <= end ? { start, end } : { start: end, end: start }))
)

const numericSurveyIdArb = fc.integer({ min: 1, max: 999_999 })

const tableAliasArb = fc
  .array(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'r', 's', 't'), {
    minLength: 1,
    maxLength: 5,
  })
  .map((chars) => chars.join(''))

const sessionArb = fc.record({
  surveyId: fc.integer({ min: 1, max: 100 }),
  startedAt: isoDateArb,
})

// --- Tests ---

describe('Property 25: All-surveys scope equivalence', () => {
  it('buildPredicate with "all" produces no survey_id condition (Req 17.4)', () => {
    fc.assert(
      fc.property(orderedDatePairArb, tableAliasArb, (dates, alias) => {
        const filters: DashboardFilters = {
          surveyId: 'all',
          periodStart: dates.start,
          periodEnd: dates.end,
        }
        const result = buildPredicate(filters, alias)

        assert.ok(
          !result.sql.includes('survey_id'),
          `SQL should not contain 'survey_id' when surveyId is 'all', got: "${result.sql}"`
        )
        // Bindings should not contain any survey_id value
        for (const binding of result.bindings) {
          if (typeof binding === 'number') {
            // The only numbers in bindings should come from survey_id;
            // since we're using 'all', none should be present.
            // Actually period bindings are strings, so any number here would be wrong.
            assert.fail(
              `Bindings should not contain numeric values when surveyId is 'all', found: ${binding}`
            )
          }
        }
      }),
      { numRuns: 200 }
    )
  })

  it('buildPredicate with a number produces a survey_id condition (Req 17.4)', () => {
    fc.assert(
      fc.property(
        numericSurveyIdArb,
        orderedDatePairArb,
        tableAliasArb,
        (surveyId, dates, alias) => {
          const filters: DashboardFilters = {
            surveyId,
            periodStart: dates.start,
            periodEnd: dates.end,
          }
          const result = buildPredicate(filters, alias)

          assert.ok(
            result.sql.includes('survey_id = ?'),
            `SQL should contain 'survey_id = ?' when surveyId is numeric, got: "${result.sql}"`
          )
          // The surveyId value should be in the bindings
          assert.ok(
            result.bindings.includes(surveyId),
            `Bindings should include the surveyId value ${surveyId}, got: ${JSON.stringify(result.bindings)}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('all-surveys result includes data from any survey: "all" predicate is less restrictive (Req 17.4)', () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 1, maxLength: 50 }),
        numericSurveyIdArb,
        orderedDatePairArb,
        (sessions, specificSurveyId, dates) => {
          const allFilters: DashboardFilters = {
            surveyId: 'all',
            periodStart: dates.start,
            periodEnd: dates.end,
          }
          const specificFilters: DashboardFilters = {
            surveyId: specificSurveyId,
            periodStart: dates.start,
            periodEnd: dates.end,
          }

          const matchingAll = sessions.filter((s) => sessionMatchesPredicate(s, allFilters))
          const matchingSpecific = sessions.filter((s) =>
            sessionMatchesPredicate(s, specificFilters)
          )

          // Every session matching specific must also match all (all is less restrictive)
          assert.ok(
            matchingSpecific.length <= matchingAll.length,
            `Specific-survey matches (${matchingSpecific.length}) should not exceed all-surveys matches (${matchingAll.length})`
          )

          // Every specific match must be included in all matches
          for (const session of matchingSpecific) {
            assert.ok(
              sessionMatchesPredicate(session, allFilters),
              `Session with surveyId=${session.surveyId} matching specific filter should also match 'all' filter`
            )
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('period bounds are always present regardless of surveyId (Req 17.4)', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant('all' as const), numericSurveyIdArb),
        orderedDatePairArb,
        tableAliasArb,
        (surveyId, dates, alias) => {
          const filters: DashboardFilters = {
            surveyId,
            periodStart: dates.start,
            periodEnd: dates.end,
          }
          const result = buildPredicate(filters, alias)

          // Period start bound must always be present
          assert.ok(
            result.sql.includes(`${alias}.started_at >= ?`),
            `SQL should always contain '${alias}.started_at >= ?' for period start, got: "${result.sql}"`
          )

          // Period end bound must always be present
          assert.ok(
            result.sql.includes(`${alias}.started_at <= ?`),
            `SQL should always contain '${alias}.started_at <= ?' for period end, got: "${result.sql}"`
          )

          // Period values must always be in the bindings
          assert.ok(
            result.bindings.includes(dates.start),
            `Bindings should include periodStart '${dates.start}', got: ${JSON.stringify(result.bindings)}`
          )
          assert.ok(
            result.bindings.includes(dates.end),
            `Bindings should include periodEnd '${dates.end}', got: ${JSON.stringify(result.bindings)}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })
})
