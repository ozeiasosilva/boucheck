import { describe, it } from 'node:test'
import assert from 'node:assert'
import { maskEmail } from '../../app/support/mask_email.js'

/**
 * Unit tests for maskEmail
 * Validates: Requirements 13.4
 */

describe('maskEmail', () => {
  it('masks local part except first character, preserves domain', () => {
    assert.strictEqual(maskEmail('joao.silva@empresa.com.br'), 'j*********@empresa.com.br')
  })

  it('handles single-character local part', () => {
    assert.strictEqual(maskEmail('a@example.com'), 'a@example.com')
  })

  it('handles two-character local part', () => {
    assert.strictEqual(maskEmail('ab@example.com'), 'a*@example.com')
  })

  it('returns empty string for empty input', () => {
    assert.strictEqual(maskEmail(''), '')
  })

  it('returns empty string for input without @', () => {
    assert.strictEqual(maskEmail('noemail'), '')
  })

  it('handles local part with special characters', () => {
    assert.strictEqual(maskEmail('user.name+tag@domain.org'), 'u************@domain.org')
  })

  it('handles empty local part (starts with @)', () => {
    assert.strictEqual(maskEmail('@domain.com'), '@domain.com')
  })
})
