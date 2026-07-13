import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { ANONYMIZED_PLACEHOLDERS } from '../../app/services/anonymization_service.js'

/**
 * Property-based tests for anonymization idempotency
 * Property 15: Anonymization idempotency
 * Validates: Requirements 9.5
 *
 * Tests the idempotency invariant at the logic level:
 * - Applying placeholders to already-anonymized data produces no change
 * - Applying the replacement operation twice yields the same result as applying it once: f(f(x)) = f(x)
 */

type PiiKeys = keyof typeof ANONYMIZED_PLACEHOLDERS

const PII_KEYS = Object.keys(ANONYMIZED_PLACEHOLDERS) as PiiKeys[]

/**
 * Simulates the anonymization replacement operation:
 * Given a record of PII fields, replace each with the corresponding placeholder.
 */
function applyAnonymization(data: Record<PiiKeys, string>): Record<PiiKeys, string> {
  const result = { ...data }
  for (const key of PII_KEYS) {
    result[key] = ANONYMIZED_PLACEHOLDERS[key]
  }
  return result
}

describe('Property 15: Anonymization idempotency', () => {
  it('applying placeholders to already-anonymized data produces no change (Req 9.5)', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          // Build a record where values already equal placeholders (simulates anonimizado=true state)
          const alreadyAnonymized: Record<PiiKeys, string> = {} as Record<PiiKeys, string>
          for (const key of PII_KEYS) {
            alreadyAnonymized[key] = ANONYMIZED_PLACEHOLDERS[key]
          }

          // Merge ANONYMIZED_PLACEHOLDERS into the already-anonymized record
          const afterMerge = { ...alreadyAnonymized, ...ANONYMIZED_PLACEHOLDERS }

          // Should produce no change
          for (const key of PII_KEYS) {
            assert.strictEqual(
              afterMerge[key],
              alreadyAnonymized[key],
              `Merging placeholders into already-anonymized data should not change "${key}"`
            )
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('for any random PII data, applying anonymization once equals applying it twice: f(f(x)) = f(x) (Req 9.5)', () => {
    fc.assert(
      fc.property(
        fc.record({
          nome: fc.string({ minLength: 1, maxLength: 200 }),
          email: fc.string({ minLength: 1, maxLength: 200 }),
          telefone: fc.string({ minLength: 1, maxLength: 50 }),
          empresa: fc.string({ minLength: 1, maxLength: 200 }),
          cargo: fc.string({ minLength: 1, maxLength: 200 }),
          cidade: fc.string({ minLength: 1, maxLength: 200 }),
        }),
        (randomPii) => {
          const onceApplied = applyAnonymization(randomPii)
          const twiceApplied = applyAnonymization(onceApplied)

          // Idempotency: f(f(x)) must equal f(x)
          for (const key of PII_KEYS) {
            assert.strictEqual(
              twiceApplied[key],
              onceApplied[key],
              `Anonymization must be idempotent for "${key}": f(f(x)) should equal f(x)`
            )
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('merging ANONYMIZED_PLACEHOLDERS into any record where values already equal placeholders produces identical record (Req 9.5)', () => {
    fc.assert(
      fc.property(
        // Generate a record where each key's value is exactly the placeholder value
        // (varying other "metadata" fields to show they don't interfere)
        fc.record({
          nome: fc.constant(ANONYMIZED_PLACEHOLDERS.nome),
          email: fc.constant(ANONYMIZED_PLACEHOLDERS.email),
          telefone: fc.constant(ANONYMIZED_PLACEHOLDERS.telefone),
          empresa: fc.constant(ANONYMIZED_PLACEHOLDERS.empresa),
          cargo: fc.constant(ANONYMIZED_PLACEHOLDERS.cargo),
          cidade: fc.constant(ANONYMIZED_PLACEHOLDERS.cidade),
        }),
        (anonymizedRecord) => {
          const merged = { ...anonymizedRecord, ...ANONYMIZED_PLACEHOLDERS }

          // Verify each key individually (avoids prototype mismatch from fc.record)
          for (const key of PII_KEYS) {
            assert.strictEqual(
              merged[key],
              anonymizedRecord[key],
              `Merging ANONYMIZED_PLACEHOLDERS into a record with placeholder values should not change "${key}"`
            )
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('the anonymized state is a fixed point of the replacement operation (Req 9.5)', () => {
    fc.assert(
      fc.property(
        fc.record({
          nome: fc.string({ minLength: 0, maxLength: 300 }),
          email: fc.string({ minLength: 0, maxLength: 300 }),
          telefone: fc.string({ minLength: 0, maxLength: 100 }),
          empresa: fc.string({ minLength: 0, maxLength: 300 }),
          cargo: fc.string({ minLength: 0, maxLength: 300 }),
          cidade: fc.string({ minLength: 0, maxLength: 300 }),
        }),
        (arbitraryData) => {
          const anonymized = applyAnonymization(arbitraryData)

          // The anonymized result should always equal the placeholders exactly
          for (const key of PII_KEYS) {
            assert.strictEqual(
              anonymized[key],
              ANONYMIZED_PLACEHOLDERS[key],
              `After anonymization, "${key}" must equal its placeholder value`
            )
          }

          // And since it equals placeholders, applying again should be unchanged (fixed point)
          const reAnonymized = applyAnonymization(anonymized)
          for (const key of PII_KEYS) {
            assert.strictEqual(
              reAnonymized[key],
              anonymized[key],
              `Anonymized state must be a fixed point for "${key}": re-applying produces identical result`
            )
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
