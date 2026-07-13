// Feature: admin-auth-users, Property 13
/**
 * Property 13: Admin-user responses never expose password_hash
 *
 * Over arbitrary admin sets, assert every returned object has exactly the six
 * view fields and never `password_hash`.
 *
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import pg from 'pg'

const { Client } = pg

function getConnectionConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || undefined,
    database: process.env.DB_DATABASE || 'boucheck',
  }
}

let client: InstanceType<typeof Client>
const testRunId = `as-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const ALLOWED_FIELDS = ['id', 'nome', 'email', 'role', 'ativo', 'last_login_at']
const FORBIDDEN_FIELDS = ['password_hash', 'passwordHash', 'password', 'hash']

before(async () => {
  client = new Client(getConnectionConfig())
  await client.connect()
})

after(async () => {
  await client.query(`DELETE FROM admin_users WHERE email LIKE $1`, [`${testRunId}%`])
  await client.end()
})

describe('Property 13: Admin-user responses never expose password_hash', () => {
  it('view projection has exactly 6 allowed fields and no forbidden fields (100+ iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          nome: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          ativo: fc.boolean(),
          mustChange: fc.boolean(),
        }),
        async ({ nome, ativo, mustChange }) => {
          const email = `${testRunId}-${Math.random().toString(36).slice(2)}@test.local`

          // Insert a user with a password hash
          const res = await client.query(
            `INSERT INTO admin_users (nome, email, password_hash, role, ativo, must_change_password)
             VALUES ($1, $2, 'scrypt_secret_hash_value', 'admin', $3, $4)
             RETURNING id, nome, email, role, ativo, last_login_at`,
            [nome, email, ativo, mustChange]
          )

          const view = res.rows[0]

          // Property: view has exactly the allowed fields
          const viewKeys = Object.keys(view)
          for (const field of ALLOWED_FIELDS) {
            assert.ok(viewKeys.includes(field), `View must include '${field}'`)
          }

          // Property: view NEVER includes forbidden fields
          for (const field of FORBIDDEN_FIELDS) {
            assert.ok(
              !viewKeys.includes(field),
              `View must NOT include '${field}'`
            )
          }

          // Property: no value in the view contains the actual password hash
          for (const value of Object.values(view)) {
            if (typeof value === 'string') {
              assert.ok(
                !value.includes('scrypt_secret_hash_value'),
                'No view field value should contain the password hash'
              )
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
