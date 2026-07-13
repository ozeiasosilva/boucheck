// Feature: public-response-flow, Property: Whitelist membership determines acceptance
/**
 * Property: Whitelist membership determines acceptance
 *
 * For any string value passed as `tipo`, the `event_validator` accepts it
 * if and only if it is a member of the recognized public event types set.
 *
 * **Validates: Requirements 8.1, 8.3**
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { eventValidator, PUBLIC_EVENT_TYPES } from '../../app/validators/event_validator.js'

const validTypes = new Set<string>(PUBLIC_EVENT_TYPES)

describe('Property: Whitelist membership determines acceptance (event_validator)', () => {
  it('accepts any tipo that is a member of PUBLIC_EVENT_TYPES (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PUBLIC_EVENT_TYPES),
        async (tipo) => {
          const result = await eventValidator.validate({
            tipo,
            payload: {},
          })
          assert.strictEqual(result.tipo, tipo, `Validator should accept whitelisted tipo="${tipo}"`)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('rejects any tipo that is NOT a member of PUBLIC_EVENT_TYPES (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => !validTypes.has(s)),
        async (tipo) => {
          try {
            await eventValidator.validate({
              tipo,
              payload: {},
            })
            assert.fail(`Validator should reject non-whitelisted tipo="${tipo}"`)
          } catch (err: unknown) {
            const error = err as { messages?: unknown[] }
            // VineJS validation errors have a messages array
            assert.ok(
              error.messages && Array.isArray(error.messages) && error.messages.length > 0,
              `Expected a validation error for tipo="${tipo}", got: ${String(err)}`
            )
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('rejects empty string as tipo', async () => {
    try {
      await eventValidator.validate({
        tipo: '',
        payload: {},
      })
      assert.fail('Validator should reject empty string tipo')
    } catch (err: unknown) {
      const error = err as { messages?: unknown[] }
      assert.ok(
        error.messages && Array.isArray(error.messages) && error.messages.length > 0,
        `Expected a validation error for empty tipo, got: ${String(err)}`
      )
    }
  })
})
