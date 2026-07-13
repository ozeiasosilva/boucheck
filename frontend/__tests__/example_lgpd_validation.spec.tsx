import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  applyPhoneMask,
  isPhoneComplete,
  isValidEmail,
  isFormValid,
} from '../lib/identificacao/helpers.js'

/**
 * Example test for LGPD identification form validation logic.
 *
 * Tests the pure validation helpers that control field formatting
 * and the proceed-action disabled/enabled state.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

// ---------------------------------------------------------------------------
// Phone mask formatting (Requirement 3.1)
// ---------------------------------------------------------------------------

describe('applyPhoneMask — Brazilian phone mask formatting', () => {
  it('formats a full 13-digit number as +55 (XX) XXXXX-XXXX', () => {
    const result = applyPhoneMask('5511999990000')
    assert.strictEqual(result, '+55 (11) 99999-0000')
  })

  it('formats a partial input (6 digits) progressively', () => {
    const result = applyPhoneMask('551199')
    assert.strictEqual(result, '+55 (11) 99')
  })

  it('returns empty string for empty input', () => {
    const result = applyPhoneMask('')
    assert.strictEqual(result, '')
  })

  it('strips non-digit characters before formatting', () => {
    const result = applyPhoneMask('+55 (11) 99999-0000')
    assert.strictEqual(result, '+55 (11) 99999-0000')
  })

  it('formats country code only (2 digits)', () => {
    const result = applyPhoneMask('55')
    assert.strictEqual(result, '+55')
  })

  it('formats country code + partial DDD (3 digits)', () => {
    const result = applyPhoneMask('551')
    assert.strictEqual(result, '+55 (1')
  })

  it('formats country code + full DDD (4 digits)', () => {
    const result = applyPhoneMask('5511')
    assert.strictEqual(result, '+55 (11')
  })

  it('truncates input beyond 13 digits', () => {
    const result = applyPhoneMask('55119999900001234')
    assert.strictEqual(result, '+55 (11) 99999-0000')
  })
})

// ---------------------------------------------------------------------------
// Phone completeness (Requirement 3.1)
// ---------------------------------------------------------------------------

describe('isPhoneComplete — 13-digit completeness check', () => {
  it('returns true for exactly 13 digits', () => {
    assert.strictEqual(isPhoneComplete('+55 (11) 99999-0000'), true)
  })

  it('returns false for fewer than 13 digits', () => {
    assert.strictEqual(isPhoneComplete('+55 (11) 99'), false)
  })

  it('returns false for empty string', () => {
    assert.strictEqual(isPhoneComplete(''), false)
  })

  it('returns false for more than 13 digits (raw)', () => {
    // 14 digits in the string
    assert.strictEqual(isPhoneComplete('55119999900001'), false)
  })
})

// ---------------------------------------------------------------------------
// Email validation (Requirement 3.1)
// ---------------------------------------------------------------------------

describe('isValidEmail — basic email format check', () => {
  it('returns true for a valid email', () => {
    assert.strictEqual(isValidEmail('joao@empresa.com'), true)
  })

  it('returns true for email with subdomain', () => {
    assert.strictEqual(isValidEmail('user@sub.domain.co'), true)
  })

  it('returns false for empty string', () => {
    assert.strictEqual(isValidEmail(''), false)
  })

  it('returns false for missing @ sign', () => {
    assert.strictEqual(isValidEmail('joaoempresa.com'), false)
  })

  it('returns false for missing domain', () => {
    assert.strictEqual(isValidEmail('joao@'), false)
  })

  it('returns false for missing TLD', () => {
    assert.strictEqual(isValidEmail('joao@empresa'), false)
  })

  it('returns false for email with spaces', () => {
    assert.strictEqual(isValidEmail('joao @empresa.com'), false)
  })
})

// ---------------------------------------------------------------------------
// Form validity — proceed action state (Requirements 3.3, 3.4)
// ---------------------------------------------------------------------------

describe('isFormValid — proceed action enabled/disabled logic', () => {
  const validFields = {
    nome: 'João Silva',
    telefone: '+55 (11) 99999-0000',
    empresa: 'Empresa X',
    email: 'joao@empresa.com',
    cargo: 'CTO',
    cidade: 'São Paulo',
    politicaAceita: true,
  }

  it('returns true when all fields are filled and policy is accepted', () => {
    assert.strictEqual(isFormValid(validFields), true)
  })

  it('returns false when nome is empty', () => {
    assert.strictEqual(isFormValid({ ...validFields, nome: '' }), false)
  })

  it('returns false when nome is whitespace-only', () => {
    assert.strictEqual(isFormValid({ ...validFields, nome: '   ' }), false)
  })

  it('returns false when telefone is incomplete', () => {
    assert.strictEqual(isFormValid({ ...validFields, telefone: '+55 (11) 99' }), false)
  })

  it('returns false when empresa is empty', () => {
    assert.strictEqual(isFormValid({ ...validFields, empresa: '' }), false)
  })

  it('returns false when email is invalid', () => {
    assert.strictEqual(isFormValid({ ...validFields, email: 'not-an-email' }), false)
  })

  it('returns false when cargo is empty', () => {
    assert.strictEqual(isFormValid({ ...validFields, cargo: '' }), false)
  })

  it('returns false when cidade is empty', () => {
    assert.strictEqual(isFormValid({ ...validFields, cidade: '' }), false)
  })

  it('returns false when policy checkbox is unchecked (Req 3.3)', () => {
    assert.strictEqual(isFormValid({ ...validFields, politicaAceita: false }), false)
  })

  it('returns false when multiple fields are empty', () => {
    assert.strictEqual(
      isFormValid({ ...validFields, nome: '', empresa: '', cargo: '' }),
      false
    )
  })
})
