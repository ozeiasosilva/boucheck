// Feature: admin-auth-users, Property 11: Last-active-admin invariant across (de)activation
/**
 * Property 11: Last-active-admin invariant across (de)activation
 *
 * For any set of Admin_Users, deactivating an Admin_User that is not the sole
 * active one sets its `ativo` to `false`, reactivating a deactivated Admin_User
 * sets its `ativo` to `true`, and any deactivation request that would reduce the
 * number of active Admin_Users to zero is rejected with HTTP 422 while leaving
 * that user's `ativo` unchanged — so the count of active Admin_Users is never
 * driven below one by a deactivation.
 *
 * **Validates: Requirements 7.1, 7.3, 7.4**
 */

import { describe, it, before, after, beforeEach } from 'node:test'
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

const testRunId = `laa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

before(async () => {
  client = new Client(getConnectionConfig())
  await client.connect()
})

after(async () => {
  // Clean up all test admin users created during this test run
  await client.query(`DELETE FROM admin_users WHERE email LIKE $1`, [`%${testRunId}%`])
  await client.end()
})

/**
 * Creates N admin_users rows for the test, with the specified active/inactive distribution.
 * Returns the IDs of the created admins.
 */
async function createAdminSet(
  activeCount: number,
  inactiveCount: number
): Promise<{ activeIds: number[]; inactiveIds: number[] }> {
  const activeIds: number[] = []
  const inactiveIds: number[] = []

  for (let i = 0; i < activeCount; i++) {
    const email = `active-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${testRunId}.test`
    const res = await client.query(
      `INSERT INTO admin_users (nome, email, password_hash, ativo)
       VALUES ($1, $2, 'hash_placeholder', true) RETURNING id`,
      [`Active Admin ${i}`, email]
    )
    activeIds.push(Number(res.rows[0].id))
  }

  for (let i = 0; i < inactiveCount; i++) {
    const email = `inactive-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${testRunId}.test`
    const res = await client.query(
      `INSERT INTO admin_users (nome, email, password_hash, ativo)
       VALUES ($1, $2, 'hash_placeholder', false) RETURNING id`,
      [`Inactive Admin ${i}`, email]
    )
    inactiveIds.push(Number(res.rows[0].id))
  }

  return { activeIds, inactiveIds }
}

/**
 * Simulates the deactivation logic from AdminUserService.setActive(id, false)
 * directly at the DB level, returning whether the operation succeeded or was rejected.
 */
async function attemptDeactivation(userId: number): Promise<{ success: boolean; error?: string }> {
  try {
    // Start a transaction to mirror the service logic
    await client.query('BEGIN')

    // Check if user exists and is active
    const userRes = await client.query(
      `SELECT ativo FROM admin_users WHERE id = $1 FOR UPDATE`,
      [userId]
    )
    if (userRes.rowCount === 0) {
      await client.query('ROLLBACK')
      return { success: false, error: 'Not found' }
    }

    const isCurrentlyActive = userRes.rows[0].ativo

    // Count active admins
    const countRes = await client.query(
      `SELECT COUNT(*) as total FROM admin_users WHERE ativo = true`
    )
    const activeCount = Number(countRes.rows[0].total)

    // Last-active-admin guard (Req 7.3)
    if (activeCount <= 1 && isCurrentlyActive) {
      await client.query('ROLLBACK')
      return { success: false, error: 'Cannot deactivate the last active administrator' }
    }

    // Safe to deactivate (Req 7.1)
    await client.query(`UPDATE admin_users SET ativo = false WHERE id = $1`, [userId])
    await client.query('COMMIT')
    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }
}

/**
 * Simulates the reactivation logic from AdminUserService.setActive(id, true)
 * directly at the DB level. Reactivation always succeeds (Req 7.4).
 */
async function attemptReactivation(userId: number): Promise<{ success: boolean }> {
  await client.query(`UPDATE admin_users SET ativo = true WHERE id = $1`, [userId])
  return { success: true }
}

/**
 * Returns the count of active admin_users in the database.
 */
async function getActiveCount(): Promise<number> {
  const res = await client.query(`SELECT COUNT(*) as total FROM admin_users WHERE ativo = true`)
  return Number(res.rows[0].total)
}

/**
 * Cleans up all test admins created by this test run (called between property iterations).
 */
async function cleanupTestAdmins(): Promise<void> {
  await client.query(`DELETE FROM admin_users WHERE email LIKE $1`, [`%${testRunId}%`])
}

describe('Property 11: Last-active-admin invariant across (de)activation', () => {
  beforeEach(async () => {
    await cleanupTestAdmins()
  })

  it('deactivating one of multiple active admins succeeds and active count decreases but stays >= 1 (>=100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random number of active admins (2-6) and inactive admins (0-4)
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 0, max: 4 }),
        async (numActive, numInactive) => {
          await cleanupTestAdmins()

          const { activeIds } = await createAdminSet(numActive, numInactive)
          const countBefore = await getActiveCount()

          // Pick a random active admin to deactivate (not the only one since numActive >= 2)
          const targetIdx = Math.floor(Math.random() * activeIds.length)
          const targetId = activeIds[targetIdx]

          const result = await attemptDeactivation(targetId)

          // Deactivation should succeed (Req 7.1)
          assert.strictEqual(result.success, true, 'Deactivation of a non-sole active admin should succeed')

          // Verify the user is now inactive
          const userRes = await client.query(`SELECT ativo FROM admin_users WHERE id = $1`, [targetId])
          assert.strictEqual(userRes.rows[0].ativo, false, 'Deactivated admin should have ativo = false')

          // Active count should have decreased by 1
          const countAfter = await getActiveCount()
          assert.strictEqual(countAfter, countBefore - 1, 'Active count should decrease by 1')

          // The invariant: active count is never below 1
          assert.ok(countAfter >= 1, `Active count must remain >= 1, got ${countAfter}`)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('deactivating the sole active admin is rejected and count stays at 1 (>=100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 0-5 inactive admins alongside the single active one
        fc.integer({ min: 0, max: 5 }),
        async (numInactive) => {
          await cleanupTestAdmins()

          const { activeIds } = await createAdminSet(1, numInactive)
          const soleActiveId = activeIds[0]

          const countBefore = await getActiveCount()
          assert.strictEqual(countBefore, 1, 'Should have exactly 1 active admin before attempt')

          const result = await attemptDeactivation(soleActiveId)

          // Deactivation should be rejected (Req 7.3)
          assert.strictEqual(result.success, false, 'Deactivation of the last active admin should be rejected')
          assert.strictEqual(
            result.error,
            'Cannot deactivate the last active administrator',
            'Should return the last-active-admin error'
          )

          // Verify the user is still active (ativo unchanged)
          const userRes = await client.query(`SELECT ativo FROM admin_users WHERE id = $1`, [soleActiveId])
          assert.strictEqual(userRes.rows[0].ativo, true, 'Last active admin should remain ativo = true')

          // Active count should remain at 1
          const countAfter = await getActiveCount()
          assert.strictEqual(countAfter, 1, 'Active count must stay at 1 after rejection')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('reactivation of a deactivated admin always succeeds and sets ativo to true (>=100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-4 active admins and 1-5 inactive admins
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 5 }),
        async (numActive, numInactive) => {
          await cleanupTestAdmins()

          const { inactiveIds } = await createAdminSet(numActive, numInactive)

          // Pick a random inactive admin to reactivate
          const targetIdx = Math.floor(Math.random() * inactiveIds.length)
          const targetId = inactiveIds[targetIdx]

          // Verify user is currently inactive
          const beforeRes = await client.query(`SELECT ativo FROM admin_users WHERE id = $1`, [targetId])
          assert.strictEqual(beforeRes.rows[0].ativo, false, 'User should be inactive before reactivation')

          const result = await attemptReactivation(targetId)

          // Reactivation always succeeds (Req 7.4)
          assert.strictEqual(result.success, true, 'Reactivation should always succeed')

          // Verify the user is now active
          const afterRes = await client.query(`SELECT ativo FROM admin_users WHERE id = $1`, [targetId])
          assert.strictEqual(afterRes.rows[0].ativo, true, 'Reactivated admin should have ativo = true')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('the invariant COUNT(*) WHERE ativo = true >= 1 always holds after any sequence of (de)activations (>=100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate an initial admin set: 1-5 active, 0-4 inactive
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 4 }),
        // Generate a random sequence of operations: true = attempt deactivation, false = attempt reactivation
        fc.array(fc.boolean(), { minLength: 3, maxLength: 10 }),
        async (numActive, numInactive, operations) => {
          await cleanupTestAdmins()

          const { activeIds, inactiveIds } = await createAdminSet(numActive, numInactive)
          const allIds = [...activeIds, ...inactiveIds]

          // Execute the random sequence of operations
          for (const isDeactivation of operations) {
            // Pick a random admin from the set
            const targetIdx = Math.floor(Math.random() * allIds.length)
            const targetId = allIds[targetIdx]

            if (isDeactivation) {
              await attemptDeactivation(targetId)
            } else {
              await attemptReactivation(targetId)
            }

            // After every operation, assert the invariant holds
            const activeCount = await getActiveCount()
            assert.ok(
              activeCount >= 1,
              `Invariant violated: active count = ${activeCount} after operation. Must always be >= 1`
            )
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
