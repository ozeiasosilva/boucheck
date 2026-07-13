import { describe, it } from 'node:test'
import assert from 'node:assert'
import { maskEmail, sanitize, logSerializers } from '../../app/services/log_serializer.js'

/**
 * Unit tests for the log serializer module.
 * Validates: Requirements 11.4, 11.5
 */

describe('Log Serializer - maskEmail', () => {
  it('masks the local part of a standard email', () => {
    assert.strictEqual(maskEmail('ana@beonup.com.br'), 'a***@beonup.com.br')
  })

  it('masks a single-character local part', () => {
    assert.strictEqual(maskEmail('a@example.com'), 'a***@example.com')
  })

  it('masks a long local part', () => {
    assert.strictEqual(maskEmail('verylongemail@domain.org'), 'v***@domain.org')
  })

  it('returns the value as-is if no @ sign', () => {
    assert.strictEqual(maskEmail('noemail'), 'noemail')
  })

  it('returns the value as-is if @ is at position 0', () => {
    assert.strictEqual(maskEmail('@domain.com'), '@domain.com')
  })
})

describe('Log Serializer - sanitize', () => {
  it('redacts password field', () => {
    const result = sanitize({ password: 'secret123' }) as Record<string, unknown>
    assert.strictEqual(result.password, '[REDACTED]')
  })

  it('redacts new_password field', () => {
    const result = sanitize({ new_password: 'newpass123' }) as Record<string, unknown>
    assert.strictEqual(result.new_password, '[REDACTED]')
  })

  it('redacts current_password field', () => {
    const result = sanitize({ current_password: 'oldpass123' }) as Record<string, unknown>
    assert.strictEqual(result.current_password, '[REDACTED]')
  })

  it('redacts password_hash field', () => {
    const result = sanitize({ password_hash: '$scrypt$...' }) as Record<string, unknown>
    assert.strictEqual(result.password_hash, '[REDACTED]')
  })

  it('redacts passwordHash field', () => {
    const result = sanitize({ passwordHash: '$scrypt$...' }) as Record<string, unknown>
    assert.strictEqual(result.passwordHash, '[REDACTED]')
  })

  it('redacts token field', () => {
    const result = sanitize({ token: 'oat_abc123' }) as Record<string, unknown>
    assert.strictEqual(result.token, '[REDACTED]')
  })

  it('redacts token_hash field', () => {
    const result = sanitize({ token_hash: 'sha256hash' }) as Record<string, unknown>
    assert.strictEqual(result.token_hash, '[REDACTED]')
  })

  it('redacts tokenHash field', () => {
    const result = sanitize({ tokenHash: 'sha256hash' }) as Record<string, unknown>
    assert.strictEqual(result.tokenHash, '[REDACTED]')
  })

  it('redacts hash field', () => {
    const result = sanitize({ hash: 'somehashvalue' }) as Record<string, unknown>
    assert.strictEqual(result.hash, '[REDACTED]')
  })

  it('redacts resetLink field', () => {
    const result = sanitize({ resetLink: 'https://app.com/reset?t=abc' }) as Record<string, unknown>
    assert.strictEqual(result.resetLink, '[REDACTED]')
  })

  it('redacts tempPassword field', () => {
    const result = sanitize({ tempPassword: 'TempPass123' }) as Record<string, unknown>
    assert.strictEqual(result.tempPassword, '[REDACTED]')
  })

  it('masks email field', () => {
    const result = sanitize({ email: 'user@example.com' }) as Record<string, unknown>
    assert.strictEqual(result.email, 'u***@example.com')
  })

  it('masks email-like values in non-email fields', () => {
    const result = sanitize({ contact: 'admin@company.org' }) as Record<string, unknown>
    assert.strictEqual(result.contact, 'a***@company.org')
  })

  it('leaves non-sensitive string fields unchanged', () => {
    const result = sanitize({ nome: 'Bruno', role: 'admin' }) as Record<string, unknown>
    assert.strictEqual(result.nome, 'Bruno')
    assert.strictEqual(result.role, 'admin')
  })

  it('leaves non-sensitive number and boolean fields unchanged', () => {
    const result = sanitize({ id: 7, ativo: true }) as Record<string, unknown>
    assert.strictEqual(result.id, 7)
    assert.strictEqual(result.ativo, true)
  })

  it('handles nested objects recursively', () => {
    const result = sanitize({
      user: { email: 'nested@test.com', password: 'secret' },
    }) as Record<string, unknown>
    const user = result.user as Record<string, unknown>
    assert.strictEqual(user.email, 'n***@test.com')
    assert.strictEqual(user.password, '[REDACTED]')
  })

  it('handles arrays recursively', () => {
    const result = sanitize({
      users: [
        { email: 'a@b.com', password: 'x' },
        { email: 'c@d.com', password: 'y' },
      ],
    }) as Record<string, unknown>
    const users = result.users as Array<Record<string, unknown>>
    assert.strictEqual(users[0].email, 'a***@b.com')
    assert.strictEqual(users[0].password, '[REDACTED]')
    assert.strictEqual(users[1].email, 'c***@d.com')
    assert.strictEqual(users[1].password, '[REDACTED]')
  })

  it('handles null input', () => {
    assert.strictEqual(sanitize(null), null)
  })

  it('handles undefined input', () => {
    assert.strictEqual(sanitize(undefined), undefined)
  })

  it('handles primitive inputs', () => {
    assert.strictEqual(sanitize('hello'), 'hello')
    assert.strictEqual(sanitize(42), 42)
    assert.strictEqual(sanitize(true), true)
  })

  it('redacts multiple sensitive fields in one object', () => {
    const result = sanitize({
      email: 'ana@beonup.com.br',
      password: 'pass123456',
      new_password: 'newpass1234',
      nome: 'Ana',
    }) as Record<string, unknown>
    assert.strictEqual(result.email, 'a***@beonup.com.br')
    assert.strictEqual(result.password, '[REDACTED]')
    assert.strictEqual(result.new_password, '[REDACTED]')
    assert.strictEqual(result.nome, 'Ana')
  })
})

describe('Log Serializer - logSerializers.req', () => {
  it('serializes request with method and url', () => {
    const result = logSerializers.req({ method: 'POST', url: '/api/admin/auth/login' })
    assert.strictEqual(result.method, 'POST')
    assert.strictEqual(result.url, '/api/admin/auth/login')
  })

  it('redacts authorization header', () => {
    const result = logSerializers.req({
      method: 'GET',
      url: '/api/admin/admin-users',
      headers: { authorization: 'Bearer oat_abc123xyz', 'content-type': 'application/json' },
    })
    const headers = result.headers as Record<string, unknown>
    assert.strictEqual(headers.authorization, '[REDACTED]')
    assert.strictEqual(headers['content-type'], 'application/json')
  })

  it('sanitizes request body - masks email and redacts password', () => {
    const result = logSerializers.req({
      method: 'POST',
      url: '/api/admin/auth/login',
      body: { email: 'ana@beonup.com.br', password: 'secret123456' },
    })
    const body = result.body as Record<string, unknown>
    assert.strictEqual(body.email, 'a***@beonup.com.br')
    assert.strictEqual(body.password, '[REDACTED]')
  })

  it('does not include body when not present', () => {
    const result = logSerializers.req({ method: 'GET', url: '/api/admin/admin-users' })
    assert.strictEqual(result.body, undefined)
  })
})
