// Feature: admin-auth-users, Property 1
import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { validate } from '../../app/policies/password_policy.js'

/**
 * Property 1: Password policy validation
 * Validates: Requirements 4.2, 4.3
 *
 * For any string `s`, `validate(s)` returns `ok = true` if and only if
 * `s` has length ≥ 10 AND contains at least one letter AND contains at
 * least one digit; and when `ok = false`, the returned `unmet` set is
 * exactly the subset of {min_length, has_letter, has_number} that `s` fails.
 */
describe('Property 1: Password policy validation', () => {
  it('ok === true iff all three criteria pass (100+ iterations)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 50 }), (s) => {
        const result = validate(s)
        const meetsLength = s.length >= 10
        const meetsLetter = /[A-Za-z]/.test(s)
        const meetsNumber = /[0-9]/.test(s)
        const shouldPass = meetsLength && meetsLetter && meetsNumber

        assert.strictEqual(result.ok, shouldPass)

        // Verify unmet set is exactly the failing criteria
        const expectedUnmet: string[] = []
        if (!meetsLength) expectedUnmet.push('min_length')
        if (!meetsLetter) expectedUnmet.push('has_letter')
        if (!meetsNumber) expectedUnmet.push('has_number')

        assert.deepStrictEqual(result.unmet.sort(), expectedUnmet.sort())
      }),
      { numRuns: 200 }
    )
  })
})
