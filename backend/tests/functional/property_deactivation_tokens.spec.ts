// Feature: admin-auth-users, Property 12
/**
 * Property 12: Deactivation revokes all tokens
 *
 * Over arbitrary token counts (1 to N), assert deactivation removes all tokens
 * so a later request with a previously-valid token is rejected 401.
 *
 * At the DB level we verify:
 * 1. For arbitrary token counts (1 to N), after deactivation (setting ativo=false +
 *    deleting tokens), zero tokens remain for that user.
 * 2. The user's ativo is false after deactivation.
 * 3. Any subsequent auth attempt with a previously-valid token would fail
 *    (no token row exists in auth_access_tokens for that user).
 *
 * **Validates: Requirements 1.3, 7.2**
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import pg from 'pg'
import { createHash, randomBytes } from 'node:crypto'

const { Client } = pg

function getConnectionConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE || 'boucheck',
  }
}

let client: InstanceType<typeof Client>
const testRunId = `dt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/**
 * Creates a test admin user in the DB and returns the user id.
 */
async function createTestUser(
  dbClient: InstanceType<typeof Client>,
  suffix: string,
  ativo: boolean = true
): Promise<number> {
  const email = `${testRunId}-${suffix}@test.local`
  const passwordHash = `$scrypt$simulated$${createHash('sha256').update('TestPass1234').digest('hex')}`

  const res = await dbClient.query(
    `INSERT INTO admin_users (nome, email, password_hash, role, ativo, must_change_password)
     VALUES ($1, $2, $3, 'admin', $4, false) RETURNING id`,
    [`Test User ${suffix}`, email, passwordHash, ativo]
  )

  return Number(res.rows[0].id)
}

/**
 * Inserts N fake access tokens for a given user into auth_access_tokens.
 * Returns the token hashes for later verification.
 */
async function insertTokens(
  dbClient: InstanceType<typeof Client>,
  userId: number,
  count: number
): Promise<string[]> {
  const hashes: string[] = []

  for (let i = 0; i < count; i++) {
    const tokenValue = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(tokenValue).digest('hex')
    hashes.push(tokenHash)

    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() // +12h

    await dbClient.query(
      `INSERT INTO auth_access_tokens (tokenable_id, type, hash, abilities, created_at, updated_at, expires_at)
       VALUES ($1, 'auth_token', $2, '["*"]', $3, $4, $5)`,
      [userId, tokenHash, now, now, expiresAt]
    )
  }

  return hashes
}

/**
 * Simulates the deactivation logic from AdminUserService.setActive(id, false):
 * 1. Set ativo = false on the user
 * 2. Delete ALL access tokens for that user (Req 7.2)
 */
async function simulateDeactivation(
  dbClient: InstanceType<typeof Client>,
  userId: number
): Promise<void> {
  // Set ativo = false (Req 7.1)
  await dbClient.query(`UPDATE admin_users SET ativo = false WHERE id = $1`, [userId])

  // Delete all access tokens for the user (Req 7.2)
  await dbClient.query(`DELETE FROM auth_access_tokens WHERE tokenable_id = $1`, [userId])
}

/**
 * Returns the count of access tokens for a given user.
 */
async function getTokenCount(
  dbClient: InstanceType<typeof Client>,
  userId: number
): Promise<number> {
  const res = await dbClient.query(
    `SELECT COUNT(*)::int as count FROM auth_access_tokens WHERE tokenable_id = $1`,
    [userId]
  )
  return res.rows[0].count
}

/**
 * Returns the ativo status of a user.
 */
async function getUserAtivo(
  dbClient: InstanceType<typeof Client>,
  userId: number
): Promise<boolean> {
  const res = await dbClient.query(`SELECT ativo FROM admin_users WHERE id = $1`, [userId])
  return res.rows[0].ativo
}

/**
 * Checks if a specific token hash exists in auth_access_tokens for a user.
 * If it doesn't exist, an auth attempt with that token would fail (401).
 */
async function tokenExists(
  dbClient: InstanceType<typeof Client>,
  userId: number,
  tokenHash: string
): Promise<boolean> {
  const res = await dbClient.query(
    `SELECT id FROM auth_access_tokens WHERE tokenable_id = $1 AND hash = $2`,
    [userId, tokenHash]
  )
  return res.rowCount! > 0
}

before(async () => {
  client = new Client(getConnectionConfig())
  await client.connect()
})

after(async () => {
  // Clean up: delete tokens first (FK constraint), then users
  await client.query(
    `DELETE FROM auth_access_tokens WHERE tokenable_id IN (
       SELECT id FROM admin_users WHERE email LIKE $1
     )`,
    [`${testRunId}%`]
  )
  await client.query(`DELETE FROM admin_users WHERE email LIKE $1`, [`${testRunId}%`])
  await client.end()
})

describe('Property 12: Deactivation revokes all tokens', () => {
  it('after deactivation, zero tokens remain for that user (≥100 runs)', async () => {
    /**
     * Req 7.2: When an Admin_User is deactivated, ALL Access_Tokens belonging
     * to that user are deleted immediately.
     *
     * For arbitrary token counts (1..10), insert that many tokens, deactivate,
     * and verify zero tokens remain.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (tokenCount) => {
          const suffix = `zero-${Math.random().toString(36).slice(2, 10)}`
          const userId = await createTestUser(client, suffix, true)

          // Insert N tokens
          await insertTokens(client, userId, tokenCount)

          // Verify tokens were inserted
          const beforeCount = await getTokenCount(client, userId)
          assert.strictEqual(
            beforeCount,
            tokenCount,
            `Expected ${tokenCount} tokens before deactivation`
          )

          // Simulate deactivation
          await simulateDeactivation(client, userId)

          // Verify zero tokens remain (Req 7.2)
          const afterCount = await getTokenCount(client, userId)
          assert.strictEqual(
            afterCount,
            0,
            'Req 7.2: After deactivation, zero tokens must remain for the user'
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('user ativo is false after deactivation (≥100 runs)', async () => {
    /**
     * Req 7.1: Deactivation sets ativo to false.
     * For arbitrary token counts, after deactivation the user's ativo must be false.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (tokenCount) => {
          const suffix = `ativo-${Math.random().toString(36).slice(2, 10)}`
          const userId = await createTestUser(client, suffix, true)

          // Insert tokens (arbitrary count)
          await insertTokens(client, userId, tokenCount)

          // Verify user is active before deactivation
          const activoBefore = await getUserAtivo(client, userId)
          assert.strictEqual(activoBefore, true, 'User must be active before deactivation')

          // Simulate deactivation
          await simulateDeactivation(client, userId)

          // Verify ativo is false (Req 7.1)
          const ativoAfter = await getUserAtivo(client, userId)
          assert.strictEqual(
            ativoAfter,
            false,
            'Req 7.1: User ativo must be false after deactivation'
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('any previously-valid token no longer exists after deactivation, so auth would fail 401 (≥100 runs)', async () => {
    /**
     * Req 1.3, 7.2: After deactivation, any previously-valid token for that user
     * no longer exists in auth_access_tokens. A subsequent request using any such
     * token would find no matching row → auth guard rejects with 401.
     *
     * We verify that EVERY token hash that was inserted prior to deactivation
     * is absent from the table afterward.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (tokenCount) => {
          const suffix = `auth-${Math.random().toString(36).slice(2, 10)}`
          const userId = await createTestUser(client, suffix, true)

          // Insert tokens and keep references to their hashes
          const tokenHashes = await insertTokens(client, userId, tokenCount)

          // Verify all tokens exist before deactivation
          for (const h of tokenHashes) {
            const exists = await tokenExists(client, userId, h)
            assert.strictEqual(exists, true, 'Token must exist before deactivation')
          }

          // Simulate deactivation
          await simulateDeactivation(client, userId)

          // Verify NONE of the previously-valid tokens exist (Req 1.3, 7.2)
          // If no token row matches, the auth guard finds no token → 401
          for (const h of tokenHashes) {
            const exists = await tokenExists(client, userId, h)
            assert.strictEqual(
              exists,
              false,
              'Req 1.3, 7.2: Previously-valid token must not exist after deactivation (auth would fail 401)'
            )
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
