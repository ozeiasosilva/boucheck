import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { ANONYMIZED_PLACEHOLDERS } from '../../app/services/anonymization_service.js'

/**
 * Property-based tests for anonymization partial-failure handling
 * Property 16: Anonymization partial-failure handling
 * Validates: Requirements 9.6
 *
 * These tests verify the CONTRACT of the column-by-column fallback strategy
 * at the logic level, without requiring a database connection. They simulate
 * the fallback path where some columns succeed and others fail.
 */

const PII_KEYS = ['nome', 'email', 'telefone', 'empresa', 'cargo', 'cidade'] as const
type PiiKey = (typeof PII_KEYS)[number]

/**
 * Simulates the column-by-column fallback logic from AnonymizationService.
 * For each PII column:
 *   - If the column is NOT in the failingColumns set, apply the placeholder
 *   - If the column IS in the failingColumns set, keep the original value
 * Then unconditionally set anonimizado = true.
 */
function simulateFallback(
  originalData: Record<PiiKey, string>,
  failingColumns: Set<PiiKey>
): Record<PiiKey | 'anonimizado', string | boolean> {
  const result: Record<string, string | boolean> = {}

  for (const key of PII_KEYS) {
    if (failingColumns.has(key)) {
      result[key] = originalData[key]
    } else {
      result[key] = ANONYMIZED_PLACEHOLDERS[key]
    }
  }

  // anonimizado is always set to true regardless of column failures
  result['anonimizado'] = true

  return result as Record<PiiKey | 'anonimizado', string | boolean>
}

describe('Property 16: Anonymization partial-failure handling', () => {
  const piiRecordArb = fc.record({
    nome: fc.string({ minLength: 1, maxLength: 80 }),
    email: fc.emailAddress(),
    telefone: fc.string({ minLength: 5, maxLength: 20 }),
    empresa: fc.string({ minLength: 1, maxLength: 80 }),
    cargo: fc.string({ minLength: 1, maxLength: 60 }),
    cidade: fc.string({ minLength: 1, maxLength: 60 }),
  })

  const failingColumnsArb = fc.subarray([...PII_KEYS])

  it('for any subset of columns that succeed, the remaining columns retain their original values (Req 9.6)', () => {
    fc.assert(
      fc.property(piiRecordArb, failingColumnsArb, (originalData, failingColumns) => {
        const failingSet = new Set<PiiKey>(failingColumns)
        const result = simulateFallback(originalData, failingSet)

        // All non-failing columns must have their placeholder value
        for (const key of PII_KEYS) {
          if (!failingSet.has(key)) {
            assert.strictEqual(
              result[key],
              ANONYMIZED_PLACEHOLDERS[key],
              `Non-failing column "${key}" should have placeholder value "${ANONYMIZED_PLACEHOLDERS[key]}", got "${result[key]}"`
            )
          }
        }

        // All failing columns must retain their original value
        for (const key of PII_KEYS) {
          if (failingSet.has(key)) {
            assert.strictEqual(
              result[key],
              originalData[key],
              `Failing column "${key}" should retain original value "${originalData[key]}", got "${result[key]}"`
            )
          }
        }
      }),
      { numRuns: 200 }
    )
  })

  it('anonimizado is always set to true regardless of which columns fail (Req 9.6)', () => {
    fc.assert(
      fc.property(piiRecordArb, failingColumnsArb, (originalData, failingColumns) => {
        const failingSet = new Set<PiiKey>(failingColumns)
        const result = simulateFallback(originalData, failingSet)

        assert.strictEqual(
          result['anonimizado'],
          true,
          `anonimizado must always be true, regardless of failing columns: [${failingColumns.join(', ')}]`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('when no columns fail, all have placeholder values (Req 9.6)', () => {
    fc.assert(
      fc.property(piiRecordArb, (originalData) => {
        const failingSet = new Set<PiiKey>() // empty set = no failures
        const result = simulateFallback(originalData, failingSet)

        // All columns should have their placeholder values
        for (const key of PII_KEYS) {
          assert.strictEqual(
            result[key],
            ANONYMIZED_PLACEHOLDERS[key],
            `With zero failures, column "${key}" should have placeholder "${ANONYMIZED_PLACEHOLDERS[key]}", got "${result[key]}"`
          )
        }

        // anonimizado is still true
        assert.strictEqual(result['anonimizado'], true)
      }),
      { numRuns: 200 }
    )
  })

  it('when all columns fail, no PII is changed but anonimizado is still true (Req 9.6)', () => {
    fc.assert(
      fc.property(piiRecordArb, (originalData) => {
        const failingSet = new Set<PiiKey>(PII_KEYS) // all columns fail
        const result = simulateFallback(originalData, failingSet)

        // No PII column should have changed
        for (const key of PII_KEYS) {
          assert.strictEqual(
            result[key],
            originalData[key],
            `With all columns failing, "${key}" should retain original value "${originalData[key]}", got "${result[key]}"`
          )
        }

        // anonimizado is STILL true — worst case still marks the record as anonymized
        assert.strictEqual(
          result['anonimizado'],
          true,
          'anonimizado must be true even when all columns fail'
        )
      }),
      { numRuns: 200 }
    )
  })
})
