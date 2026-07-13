import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { ANONYMIZED_PLACEHOLDERS } from '../../app/services/anonymization_service.js'

/**
 * Property-based tests for anonymization completeness and non-interference
 * Property 14: Anonymization completeness and non-interference
 * Validates: Requirements 9.2, 9.3, 9.4
 */

const EXPECTED_PII_KEYS = ['nome', 'email', 'telefone', 'empresa', 'cargo', 'cidade'] as const
const NON_PII_FIELDS = ['pontuacao', 'faixaId', 'surveyId', 'status', 'anonimizado'] as const

describe('Property 14: Anonymization completeness and non-interference', () => {
  it('ANONYMIZED_PLACEHOLDERS has exactly the six PII columns (Req 9.2)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXPECTED_PII_KEYS),
        (key) => {
          assert.ok(
            key in ANONYMIZED_PLACEHOLDERS,
            `Expected key "${key}" to be present in ANONYMIZED_PLACEHOLDERS`
          )
        }
      ),
      { numRuns: 100 }
    )

    // Also verify exact key set (no extra keys)
    const actualKeys = Object.keys(ANONYMIZED_PLACEHOLDERS).sort()
    const expectedKeys = [...EXPECTED_PII_KEYS].sort()
    assert.deepStrictEqual(actualKeys, expectedKeys, 'ANONYMIZED_PLACEHOLDERS should have exactly the six PII keys')
  })

  it('no placeholder value is empty or null (Req 9.3)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXPECTED_PII_KEYS),
        (key) => {
          const value = ANONYMIZED_PLACEHOLDERS[key]
          assert.ok(value !== null, `Placeholder for "${key}" must not be null`)
          assert.ok(value !== undefined, `Placeholder for "${key}" must not be undefined`)
          assert.ok(typeof value === 'string', `Placeholder for "${key}" must be a string`)
          assert.ok(value.length > 0, `Placeholder for "${key}" must not be empty`)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('placeholder values differ from any plausible real PII data (Req 9.2, 9.3)', () => {
    fc.assert(
      fc.property(
        fc.record({
          nome: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0 && !s.includes('[ANONIMIZADO]')),
          email: fc.emailAddress().filter((e) => e !== 'anonimizado@boucheck.invalid'),
          telefone: fc.stringMatching(/^\+?\d[\d\s\-()]{5,20}$/),
          empresa: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0 && !s.includes('[ANONIMIZADO]')),
          cargo: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0 && !s.includes('[ANONIMIZADO]')),
          cidade: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0 && !s.includes('[ANONIMIZADO]')),
        }),
        (realPii) => {
          for (const key of EXPECTED_PII_KEYS) {
            assert.notStrictEqual(
              ANONYMIZED_PLACEHOLDERS[key],
              realPii[key],
              `Placeholder for "${key}" should differ from generated real data "${realPii[key]}"`
            )
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('non-PII columns are NOT in ANONYMIZED_PLACEHOLDERS (Req 9.4 - non-interference)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_PII_FIELDS),
        (nonPiiField) => {
          assert.ok(
            !(nonPiiField in ANONYMIZED_PLACEHOLDERS),
            `Non-PII field "${nonPiiField}" must NOT be a key in ANONYMIZED_PLACEHOLDERS`
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('anonimizado flag is not in ANONYMIZED_PLACEHOLDERS (set separately, Req 9.4)', () => {
    fc.assert(
      fc.property(
        fc.constant('anonimizado'),
        (field) => {
          assert.ok(
            !(field in ANONYMIZED_PLACEHOLDERS),
            `"${field}" must NOT be in ANONYMIZED_PLACEHOLDERS — it is set separately`
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
