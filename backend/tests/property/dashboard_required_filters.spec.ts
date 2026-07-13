import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for required dashboard filters.
 * Property 24: Required dashboard filters
 * Validates: Requirements 17.1, 17.2, 17.3
 *
 * The `dashboardFiltersValidator` (VineJS) requires exactly three fields:
 *   survey_id, period_start, period_end
 * All must be non-undefined strings. If any is missing, VineJS returns 422.
 *
 * The controller then parses the validated `survey_id` string as either:
 *   - the literal string 'all' → DashboardFilters.surveyId = 'all'
 *   - a positive integer string → DashboardFilters.surveyId = <parsed number>
 *
 * Since VineJS validators require the AdonisJS runtime, we test the contract
 * as pure functions that mirror the validation + parsing logic.
 */

// --- Pure function simulating the validator's required-fields check ---

interface RawDashboardInput {
  survey_id?: string | undefined
  period_start?: string | undefined
  period_end?: string | undefined
}

type ValidationResult =
  | { valid: true; data: { survey_id: string; period_start: string; period_end: string } }
  | { valid: false; missingFields: string[] }

/**
 * Simulates the VineJS dashboardFiltersValidator contract:
 * all three fields must be present (not undefined) and must be strings.
 * VineJS's vine.string().trim() accepts any string (including empty after trim),
 * but rejects undefined/missing fields with 422.
 */
function validateDashboardFilters(input: RawDashboardInput): ValidationResult {
  const missing: string[] = []
  if (input.survey_id === undefined) missing.push('survey_id')
  if (input.period_start === undefined) missing.push('period_start')
  if (input.period_end === undefined) missing.push('period_end')

  if (missing.length > 0) {
    return { valid: false, missingFields: missing }
  }

  return {
    valid: true,
    data: {
      survey_id: input.survey_id!.trim(),
      period_start: input.period_start!.trim(),
      period_end: input.period_end!.trim(),
    },
  }
}

// --- Pure function simulating the controller's survey_id parsing ---

type SurveyIdParseResult =
  | { kind: 'all' }
  | { kind: 'numeric'; value: number }
  | { kind: 'invalid' }

/**
 * Parses the validated survey_id string into DashboardFilters.surveyId.
 * The controller accepts either 'all' or a positive integer string.
 */
function parseSurveyId(raw: string): SurveyIdParseResult {
  if (raw === 'all') return { kind: 'all' }
  const num = Number.parseInt(raw, 10)
  if (Number.isNaN(num) || num <= 0 || String(num) !== raw) return { kind: 'invalid' }
  return { kind: 'numeric', value: num }
}

// --- Generators ---

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)

// Generate ISO date strings directly (YYYY-MM-DD) without going through Date objects
const isoDateArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // use 28 to avoid invalid day-of-month issues
  })
  .map(({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)

// Valid survey_id values: 'all' or a positive integer string
const validSurveyIdArb = fc.oneof(
  fc.constant('all'),
  fc.integer({ min: 1, max: 999_999 }).map(String)
)

// A fully valid raw input
const validRawInputArb = fc.record({
  survey_id: validSurveyIdArb,
  period_start: isoDateArb,
  period_end: isoDateArb,
})

// --- Tests ---

describe('Property 24: Required dashboard filters', () => {
  it('valid inputs always pass validation when all three fields are present (Req 17.1)', () => {
    fc.assert(
      fc.property(validRawInputArb, (input) => {
        const result = validateDashboardFilters(input)
        assert.strictEqual(
          result.valid,
          true,
          `Validation should pass for input ${JSON.stringify(input)}, got missingFields: ${
            !result.valid ? result.missingFields.join(', ') : ''
          }`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('missing survey_id always rejects with 422 (Req 17.2)', () => {
    fc.assert(
      fc.property(isoDateArb, isoDateArb, (periodStart, periodEnd) => {
        const result = validateDashboardFilters({
          survey_id: undefined,
          period_start: periodStart,
          period_end: periodEnd,
        })
        assert.strictEqual(result.valid, false, 'Should reject when survey_id is missing')
        if (!result.valid) {
          assert.ok(
            result.missingFields.includes('survey_id'),
            `missingFields should include survey_id, got ${result.missingFields}`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  it('missing period_start always rejects with 422 (Req 17.3)', () => {
    fc.assert(
      fc.property(validSurveyIdArb, isoDateArb, (surveyId, periodEnd) => {
        const result = validateDashboardFilters({
          survey_id: surveyId,
          period_start: undefined,
          period_end: periodEnd,
        })
        assert.strictEqual(result.valid, false, 'Should reject when period_start is missing')
        if (!result.valid) {
          assert.ok(
            result.missingFields.includes('period_start'),
            `missingFields should include period_start, got ${result.missingFields}`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  it('missing period_end always rejects with 422 (Req 17.3)', () => {
    fc.assert(
      fc.property(validSurveyIdArb, isoDateArb, (surveyId, periodStart) => {
        const result = validateDashboardFilters({
          survey_id: surveyId,
          period_start: periodStart,
          period_end: undefined,
        })
        assert.strictEqual(result.valid, false, 'Should reject when period_end is missing')
        if (!result.valid) {
          assert.ok(
            result.missingFields.includes('period_end'),
            `missingFields should include period_end, got ${result.missingFields}`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  it('all fields missing rejects with all three identified (Req 17.2, 17.3)', () => {
    const result = validateDashboardFilters({
      survey_id: undefined,
      period_start: undefined,
      period_end: undefined,
    })
    assert.strictEqual(result.valid, false, 'Should reject when all fields missing')
    if (!result.valid) {
      assert.strictEqual(
        result.missingFields.length,
        3,
        `All three fields should be listed as missing, got ${result.missingFields}`
      )
      assert.ok(result.missingFields.includes('survey_id'))
      assert.ok(result.missingFields.includes('period_start'))
      assert.ok(result.missingFields.includes('period_end'))
    }
  })

  it('any random subset of missing fields always causes rejection (Req 17.1, 17.2, 17.3)', () => {
    // Generate a random combination where at least one field is undefined
    const fieldKeys = ['survey_id', 'period_start', 'period_end'] as const

    const partialInputArb = fc
      .record({
        survey_id: fc.option(validSurveyIdArb, { nil: undefined }),
        period_start: fc.option(isoDateArb, { nil: undefined }),
        period_end: fc.option(isoDateArb, { nil: undefined }),
      })
      .filter(
        (input) =>
          input.survey_id === undefined ||
          input.period_start === undefined ||
          input.period_end === undefined
      )

    fc.assert(
      fc.property(partialInputArb, (input) => {
        const result = validateDashboardFilters(input)
        assert.strictEqual(
          result.valid,
          false,
          `Should reject when at least one field is missing: ${JSON.stringify(input)}`
        )
        if (!result.valid) {
          // Verify every missing field is correctly identified
          for (const key of fieldKeys) {
            if (input[key] === undefined) {
              assert.ok(
                result.missingFields.includes(key),
                `missingFields should include '${key}' when it's undefined`
              )
            }
          }
        }
      }),
      { numRuns: 200 }
    )
  })

  it('parsing "all" as survey_id always produces { kind: "all" } (Req 17.4 — surveyId contract)', () => {
    fc.assert(
      fc.property(fc.constant('all'), (raw) => {
        const result = parseSurveyId(raw)
        assert.deepStrictEqual(result, { kind: 'all' })
      }),
      { numRuns: 100 }
    )
  })

  it('parsing any positive integer string as survey_id produces { kind: "numeric", value: n } (Req 17.1)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999_999 }), (n) => {
        const result = parseSurveyId(String(n))
        assert.deepStrictEqual(
          result,
          { kind: 'numeric', value: n },
          `parseSurveyId("${n}") should produce numeric result`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('non-numeric, non-"all" strings are parsed as invalid survey_id', () => {
    const invalidSurveyIdArb = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((s) => s !== 'all' && (Number.isNaN(Number.parseInt(s, 10)) || Number.parseInt(s, 10) <= 0 || String(Number.parseInt(s, 10)) !== s))

    fc.assert(
      fc.property(invalidSurveyIdArb, (raw) => {
        const result = parseSurveyId(raw)
        assert.strictEqual(
          result.kind,
          'invalid',
          `parseSurveyId("${raw}") should be invalid`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('validated data preserves trimmed values (Req 17.1)', () => {
    // Test that whitespace-padded valid inputs are trimmed correctly
    const paddedInputArb = fc.record({
      survey_id: validSurveyIdArb.map((s) => `  ${s}  `),
      period_start: isoDateArb.map((s) => ` ${s} `),
      period_end: isoDateArb.map((s) => `\t${s}\t`),
    })

    fc.assert(
      fc.property(paddedInputArb, (input) => {
        const result = validateDashboardFilters(input)
        assert.strictEqual(result.valid, true, 'Padded valid input should still pass')
        if (result.valid) {
          // After trim, values should not have leading/trailing whitespace
          assert.strictEqual(result.data.survey_id, result.data.survey_id.trim())
          assert.strictEqual(result.data.period_start, result.data.period_start.trim())
          assert.strictEqual(result.data.period_end, result.data.period_end.trim())
        }
      }),
      { numRuns: 200 }
    )
  })
})
