// Feature: admin-auth-users, Property 2
import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { validate, generateCompliant } from '../../app/policies/password_policy.js'

/**
 * Property 2: Generated temporary passwords are always compliant
 * Validates: Requirements 6.2
 *
 * For any invocation of `generateCompliant()`, the returned password
 * satisfies `validate()` (`ok === true`).
 */
describe('Property 2: Generated temporary passwords are always compliant', () => {
  it('every generated password passes validate (100+ iterations)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 64 }), (length) => {
        const password = generateCompliant(length)
        const result = validate(password)
        assert.strictEqual(result.ok, true, `Generated password of length ${length} should be compliant`)
        assert.strictEqual(password.length, length, `Password should have exactly ${length} characters`)
      }),
      { numRuns: 200 }
    )
  })

  it('default length (no arg) always produces compliant passwords', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const password = generateCompliant()
        const result = validate(password)
        assert.strictEqual(result.ok, true)
        assert.strictEqual(password.length, 12) // default
      }),
      { numRuns: 100 }
    )
  })

  it('lengths below minimum are clamped to 10', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), (length) => {
        const password = generateCompliant(length)
        const result = validate(password)
        assert.strictEqual(result.ok, true)
        assert.strictEqual(password.length, 10)
      }),
      { numRuns: 50 }
    )
  })
})
