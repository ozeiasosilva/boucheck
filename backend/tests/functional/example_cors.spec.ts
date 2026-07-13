// Feature: admin-auth-users, CORS configuration example tests
/**
 * Validates: Requirements 11.2
 *
 * Verifies that the CORS configuration allows only the expected frontend origin
 * (https://boucheck.beonup.com.br) and denies other origins. These are config-level
 * assertions that do not require a running server.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import corsConfig from '../../config/cors.js'

describe('CORS configuration (Requirement 11.2)', () => {
  it('origin contains https://boucheck.beonup.com.br', () => {
    const origin = corsConfig.origin as string[]
    assert.ok(
      origin.includes('https://boucheck.beonup.com.br'),
      'CORS origin must include https://boucheck.beonup.com.br'
    )
  })

  it('origin does not contain wildcard (*)', () => {
    const origin = corsConfig.origin as string[]
    assert.ok(
      !origin.includes('*'),
      'CORS origin must not include wildcard (*)'
    )
  })

  it('credentials is true', () => {
    assert.strictEqual(corsConfig.credentials, true, 'CORS credentials must be true')
  })

  it('allowed methods include GET, POST, PUT, DELETE', () => {
    const methods = corsConfig.methods as string[]
    const required = ['GET', 'POST', 'PUT', 'DELETE']
    for (const method of required) {
      assert.ok(
        methods.includes(method),
        `CORS methods must include ${method}`
      )
    }
  })
})
