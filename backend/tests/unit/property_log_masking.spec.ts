/**
 * Feature: admin-auth-users, Property 14
 * Log masking of PII and secrets.
 *
 * Over arbitrary payloads containing emails/secrets, assert no unmasked PII
 * or secret is written.
 *
 * **Validates: Requirements 11.4, 11.5**
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { sanitize, maskEmail } from '../../app/services/log_serializer.js'

const SENSITIVE_FIELDS = [
  'password',
  'new_password',
  'current_password',
  'password_hash',
  'passwordHash',
  'token',
  'token_hash',
  'tokenHash',
  'hash',
  'resetLink',
  'tempPassword',
]

describe('Property 14: Log masking of PII and secrets', () => {
  it('sensitive fields are always redacted regardless of value (200 iterations)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SENSITIVE_FIELDS),
        fc.string({ minLength: 1, maxLength: 100 }),
        (field, value) => {
          const obj = { [field]: value, nome: 'Test' }
          const result = sanitize(obj) as Record<string, unknown>
          assert.strictEqual(result[field], '[REDACTED]')
          assert.strictEqual(result.nome, 'Test') // non-sensitive unchanged
        }
      ),
      { numRuns: 200 }
    )
  })

  it('email fields are always masked (first char + *** + domain)', () => {
    // Generate valid-looking emails using only ASCII alphanumeric chars
    const alphaNum = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const alpha = 'abcdefghijklmnopqrstuvwxyz'
    const localArb = fc
      .array(fc.constantFrom(...alphaNum.split('')), { minLength: 1, maxLength: 20 })
      .map((chars) => chars.join(''))
    const domainArb = fc
      .array(fc.constantFrom(...alpha.split('')), { minLength: 1, maxLength: 10 })
      .map((chars) => chars.join(''))
    const tldArb = fc.constantFrom('com', 'org', 'br', 'net')
    const emailArb = fc
      .tuple(localArb, domainArb, tldArb)
      .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)

    fc.assert(
      fc.property(emailArb, (email) => {
        const obj = { email }
        const result = sanitize(obj) as Record<string, unknown>
        const masked = result.email as string
        // Should start with first char of local part
        assert.strictEqual(masked[0], email[0])
        // Should contain ***
        assert.ok(masked.includes('***'))
        // Should NOT contain the full local part
        const localPart = email.split('@')[0]
        if (localPart.length > 1) {
          assert.ok(!masked.includes(localPart))
        }
      }),
      { numRuns: 200 }
    )
  })

  it('nested sensitive fields are redacted recursively', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SENSITIVE_FIELDS),
        fc.string({ minLength: 1, maxLength: 50 }),
        (field, value) => {
          const obj = { outer: { [field]: value } }
          const result = sanitize(obj) as Record<string, unknown>
          const inner = result.outer as Record<string, unknown>
          assert.strictEqual(inner[field], '[REDACTED]')
        }
      ),
      { numRuns: 100 }
    )
  })
})
