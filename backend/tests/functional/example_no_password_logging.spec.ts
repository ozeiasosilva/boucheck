// Feature: admin-auth-users, verify-without-logging example test
/**
 * Validates: Requirements 4.4
 *
 * Asserts that the log serializer correctly redacts passwords from request bodies.
 * A login payload passed through the sanitize function must never contain
 * the plaintext password — it should be replaced with '[REDACTED]'.
 * This complements Property 14 (log masking of PII and secrets).
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { sanitize } from '../../app/services/log_serializer.js'

describe('No password logging (Requirement 4.4)', () => {
  it('sanitize replaces plaintext password with [REDACTED] in a login payload', () => {
    const loginPayload = {
      email: 'admin@beonup.com.br',
      password: 'my-s3cret-passw0rd',
    }

    const sanitized = sanitize(loginPayload) as Record<string, unknown>

    assert.strictEqual(
      sanitized.password,
      '[REDACTED]',
      'password field must be [REDACTED] after sanitization'
    )
    assert.notStrictEqual(
      sanitized.password,
      loginPayload.password,
      'plaintext password must not survive sanitization'
    )
  })

  it('sanitize redacts password even when nested inside a request body object', () => {
    const nestedPayload = {
      body: {
        email: 'user@beonup.com.br',
        password: 'another-passw0rd!',
      },
    }

    const sanitized = sanitize(nestedPayload) as Record<string, unknown>
    const body = sanitized.body as Record<string, unknown>

    assert.strictEqual(
      body.password,
      '[REDACTED]',
      'nested password field must be [REDACTED]'
    )
  })

  it('sanitize redacts all sensitive credential fields from a login-like payload', () => {
    const payload = {
      email: 'admin@beonup.com.br',
      password: 'plaintext-pass1',
      current_password: 'old-pass-123',
      new_password: 'new-pass-456',
    }

    const sanitized = sanitize(payload) as Record<string, unknown>

    assert.strictEqual(sanitized.password, '[REDACTED]')
    assert.strictEqual(sanitized.current_password, '[REDACTED]')
    assert.strictEqual(sanitized.new_password, '[REDACTED]')
  })

  it('non-sensitive fields are preserved unchanged', () => {
    const payload = {
      email: 'admin@beonup.com.br',
      password: 'secret-12345',
      method: 'POST',
      url: '/api/admin/auth/login',
    }

    const sanitized = sanitize(payload) as Record<string, unknown>

    assert.strictEqual(sanitized.method, 'POST')
    assert.strictEqual(sanitized.url, '/api/admin/auth/login')
  })
})
