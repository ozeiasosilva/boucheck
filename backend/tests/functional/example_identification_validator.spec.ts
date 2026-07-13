// Feature: public-response-flow, Example test: identification_validator
import { describe, it } from 'node:test'
import assert from 'node:assert'

/**
 * Unit tests for the identification_validator (VineJS compiled schema).
 *
 * Tests:
 * 1. Valid complete submission passes validation
 * 2. Missing required field (nome) fails with validation error
 * 3. Malformed e-mail fails validation
 * 4. Malformed Telefone (not matching BR format) fails validation
 * 5. Unchecked acceptance (aceite_politica missing/false) fails validation
 *
 * Validates: Requirements 3.9, 3.10, 3.11
 *
 * Run with: node --import=tsx --test tests/functional/example_identification_validator.spec.ts
 */

// VineJS throws a `ValidationError` (from @vinejs/vine) when validation fails.
import { identificationValidator } from '../../app/validators/identification_validator.js'

/** A valid submission payload that should pass all validation rules. */
function validPayload() {
  return {
    nome: 'João Silva',
    telefone: '+55 (11) 99999-0000',
    empresa: 'Empresa X',
    email: 'joao@empresa.com',
    cargo: 'CTO',
    cidade: 'São Paulo',
    aceite_politica: 'on',
    politica_versao: '2025-01-v1',
  }
}

describe('identificationValidator (Requirements 3.9, 3.10, 3.11)', () => {
  it('accepts a valid complete submission', async () => {
    const data = validPayload()
    const result = await identificationValidator.validate(data)

    assert.strictEqual(result.nome, 'João Silva')
    assert.strictEqual(result.email, 'joao@empresa.com')
    assert.strictEqual(result.telefone, '+55 (11) 99999-0000')
    assert.strictEqual(result.empresa, 'Empresa X')
    assert.strictEqual(result.cargo, 'CTO')
    assert.strictEqual(result.cidade, 'São Paulo')
    assert.strictEqual(result.politica_versao, '2025-01-v1')
  })

  it('rejects when a required field (nome) is missing (Req 3.11)', async () => {
    const data = validPayload()
    delete (data as any).nome

    await assert.rejects(
      () => identificationValidator.validate(data),
      (err: any) => {
        assert.strictEqual(err.constructor.name, 'ValidationError')
        const messages = err.messages as Array<{ field: string }>
        const nomeError = messages.find((m: any) => m.field === 'nome')
        assert.ok(nomeError, 'Should contain a validation error for the nome field')
        return true
      }
    )
  })

  it('rejects a malformed e-mail (Req 3.9)', async () => {
    const data = validPayload()
    data.email = 'not-an-email'

    await assert.rejects(
      () => identificationValidator.validate(data),
      (err: any) => {
        assert.strictEqual(err.constructor.name, 'ValidationError')
        const messages = err.messages as Array<{ field: string }>
        const emailError = messages.find((m: any) => m.field === 'email')
        assert.ok(emailError, 'Should contain a validation error for the email field')
        return true
      }
    )
  })

  it('rejects a malformed Telefone not matching BR format (Req 3.10)', async () => {
    const data = validPayload()
    data.telefone = '123'

    await assert.rejects(
      () => identificationValidator.validate(data),
      (err: any) => {
        assert.strictEqual(err.constructor.name, 'ValidationError')
        const messages = err.messages as Array<{ field: string }>
        const telefoneError = messages.find((m: any) => m.field === 'telefone')
        assert.ok(telefoneError, 'Should contain a validation error for the telefone field')
        return true
      }
    )
  })

  it('rejects when aceite_politica is missing (Req 3.11)', async () => {
    const data = validPayload()
    delete (data as any).aceite_politica

    await assert.rejects(
      () => identificationValidator.validate(data),
      (err: any) => {
        assert.strictEqual(err.constructor.name, 'ValidationError')
        const messages = err.messages as Array<{ field: string }>
        const aceiteError = messages.find((m: any) => m.field === 'aceite_politica')
        assert.ok(aceiteError, 'Should contain a validation error for the aceite_politica field')
        return true
      }
    )
  })
})
