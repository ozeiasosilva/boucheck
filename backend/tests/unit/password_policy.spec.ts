import { describe, it } from 'node:test'
import assert from 'node:assert'
import { validate } from '../../app/policies/password_policy.js'

/**
 * Unit tests for PasswordPolicy.validate
 * Validates: Requirements 4.2, 4.3
 */

describe('PasswordPolicy.validate', () => {
  it('returns ok:true for a compliant password (≥10 chars, letter, digit)', () => {
    const result = validate('abcdefgh12')
    assert.strictEqual(result.ok, true)
    assert.deepStrictEqual(result.unmet, [])
  })

  it('fails min_length when password is shorter than 10 chars', () => {
    const result = validate('abc1')
    assert.strictEqual(result.ok, false)
    assert.ok(result.unmet.includes('min_length'))
  })

  it('fails has_letter when no ASCII letters present', () => {
    const result = validate('1234567890')
    assert.strictEqual(result.ok, false)
    assert.ok(result.unmet.includes('has_letter'))
  })

  it('fails has_number when no digits present', () => {
    const result = validate('abcdefghij')
    assert.strictEqual(result.ok, false)
    assert.ok(result.unmet.includes('has_number'))
  })

  it('returns all three unmet for an empty string', () => {
    const result = validate('')
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.unmet.length, 3)
    assert.ok(result.unmet.includes('min_length'))
    assert.ok(result.unmet.includes('has_letter'))
    assert.ok(result.unmet.includes('has_number'))
  })

  it('passes at exactly 10 characters with letter and digit', () => {
    const result = validate('aaaaaaaaa1')
    assert.strictEqual(result.ok, true)
    assert.deepStrictEqual(result.unmet, [])
  })

  it('fails only min_length at 9 characters with letter and digit', () => {
    const result = validate('aaaaaaaa1')
    assert.strictEqual(result.ok, false)
    assert.deepStrictEqual(result.unmet, ['min_length'])
  })

  it('handles unicode characters for length but requires ASCII letter', () => {
    // 10 unicode chars with no ASCII letter and no digit
    const result = validate('éèêëàâäùûü')
    assert.strictEqual(result.ok, false)
    assert.ok(!result.unmet.includes('min_length'))
    assert.ok(result.unmet.includes('has_letter'))
    assert.ok(result.unmet.includes('has_number'))
  })

  it('whitespace counts for length but not as letter or digit', () => {
    const result = validate('          ') // 10 spaces
    assert.strictEqual(result.ok, false)
    assert.ok(!result.unmet.includes('min_length'))
    assert.ok(result.unmet.includes('has_letter'))
    assert.ok(result.unmet.includes('has_number'))
  })
})
