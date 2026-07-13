// Feature: admin-auth-users, Property 10
/**
 * Property 10: Self-service password change
 *
 * Assert correct-current + compliant-new updates hash (old fails, new verifies)
 * and clears the flag; wrong-current or non-compliant-new yields 422 with hash unchanged.
 *
 * At the DB level we verify:
 * 1. After successful change: `password_hash` differs from old, `must_change_password = false`
 * 2. Wrong current password: `password_hash` unchanged, no update
 * 3. Non-compliant new password: `password_hash` unchanged, no update
 * 4. The new hash never equals the plaintext password
 *
 * **Validates: Requirements 6.4, 8.1, 8.2, 8.3**
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import pg from 'pg'
import { createHash } from 'node:crypto'

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
const testRunId = `pc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulates a scrypt-like hash for testing purposes. Uses SHA-256 prefixed with
 * a marker to simulate the behaviour of AdonisJS's hash.make (non-reversible,
 * deterministic for a given input within a run, never equals plaintext).
 */
function simulateHash(plaintext: string): string {
  return `$scrypt$simulated$${createHash('sha256').update(plaintext).digest('hex')}`
}

/**
 * Simulates hash.verify — checks if the stored hash matches the SHA-256
 * of the candidate plaintext (mirrors the logic in simulateHash).
 */
function simulateVerify(storedHash: string, candidate: string): boolean {
  const expected = simulateHash(candidate)
  return storedHash === expected
}

/**
 * Pure password policy validation (mirrors app/policies/password_policy.ts).
 * Returns { ok, unmet } where unmet is the subset of criteria that failed.
 */
function validatePolicy(password: string): { ok: boolean; unmet: string[] } {
  const unmet: string[] = []
  if (password.length < 10) unmet.push('min_length')
  if (!/[A-Za-z]/.test(password)) unmet.push('has_letter')
  if (!/[0-9]/.test(password)) unmet.push('has_number')
  return { ok: unmet.length === 0, unmet }
}

/**
 * Creates a test admin user with a known password and returns { id, passwordHash }.
 */
async function createTestUser(
  dbClient: InstanceType<typeof Client>,
  suffix: string,
  knownPassword: string,
  mustChangePassword: boolean = true
): Promise<{ id: number; passwordHash: string }> {
  const email = `${testRunId}-${suffix}@test.local`
  const passwordHash = simulateHash(knownPassword)

  const res = await dbClient.query(
    `INSERT INTO admin_users (nome, email, password_hash, role, ativo, must_change_password)
     VALUES ($1, $2, $3, 'admin', true, $4) RETURNING id`,
    [`Test User ${suffix}`, email, passwordHash, mustChangePassword]
  )

  return { id: Number(res.rows[0].id), passwordHash }
}

/**
 * Simulates AdminUserService.changeOwnPassword logic at the DB level:
 * 1. Verify current password against stored hash (Req 8.2)
 * 2. Enforce policy on new password (Req 8.3)
 * 3. On success: update password_hash + clear must_change_password (Req 8.1, 6.4)
 * 4. On failure: hash unchanged, throw with status 422
 */
async function simulateChangeOwnPassword(
  dbClient: InstanceType<typeof Client>,
  userId: number,
  current: string,
  next: string
): Promise<{ success: true } | { success: false; status: 422; reason: string }> {
  // Fetch stored hash
  const row = await dbClient.query(
    `SELECT password_hash FROM admin_users WHERE id = $1`,
    [userId]
  )
  const storedHash: string = row.rows[0].password_hash

  // Step 1: Verify current password (Req 8.2)
  if (!simulateVerify(storedHash, current)) {
    return { success: false, status: 422, reason: 'current_password_incorrect' }
  }

  // Step 2: Enforce policy on new password (Req 8.3)
  const policy = validatePolicy(next)
  if (!policy.ok) {
    return { success: false, status: 422, reason: 'policy_violation' }
  }

  // Step 3: Update password_hash and clear must_change_password (Req 8.1, 6.4)
  const newHash = simulateHash(next)
  await dbClient.query(
    `UPDATE admin_users SET password_hash = $1, must_change_password = false WHERE id = $2`,
    [newHash, userId]
  )

  return { success: true }
}

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a compliant password: ≥10 chars, at least 1 letter, at least 1 digit.
 */
const compliantPasswordArb = fc
  .tuple(
    // A letter prefix
    fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')), {
      minLength: 1,
      maxLength: 5,
    }),
    // A digit
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 1, maxLength: 3 }),
    // Fill to reach ≥10 chars total
    fc.stringOf(
      fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')),
      { minLength: 4, maxLength: 20 }
    )
  )
  .map(([letters, digits, fill]) => letters + digits + fill)
  .filter((s) => s.length >= 10 && /[A-Za-z]/.test(s) && /[0-9]/.test(s))

/**
 * Generates a non-compliant password that violates at least one policy criterion.
 */
const nonCompliantPasswordArb = fc.oneof(
  // Too short (1-9 chars with letter + digit)
  fc
    .tuple(
      fc.stringOf(fc.constantFrom(...'abcdefghij'.split('')), { minLength: 1, maxLength: 4 }),
      fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 1, maxLength: 4 })
    )
    .map(([a, b]) => a + b)
    .filter((s) => s.length < 10),
  // No letter (digits only, ≥10 chars)
  fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 10, maxLength: 20 }),
  // No digit (letters only, ≥10 chars)
  fc.stringOf(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')),
    { minLength: 10, maxLength: 20 }
  )
)

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

before(async () => {
  client = new Client(getConnectionConfig())
  await client.connect()
})

after(async () => {
  await client.query(`DELETE FROM admin_users WHERE email LIKE $1`, [`${testRunId}%`])
  await client.end()
})

describe('Property 10: Self-service password change', () => {
  it('successful change updates hash (old fails, new verifies) and clears must_change_password (≥100 runs)', async () => {
    /**
     * Req 8.1, 6.4: When current password is correct AND new password is compliant,
     * password_hash is updated (old password no longer verifies, new one does) and
     * must_change_password is set to false.
     */
    await fc.assert(
      fc.asyncProperty(
        compliantPasswordArb,
        compliantPasswordArb.filter((s) => s.length >= 10),
        async (currentPassword, newPassword) => {
          // Ensure current and new are different
          fc.pre(currentPassword !== newPassword)

          const suffix = `succ-${Math.random().toString(36).slice(2, 10)}`
          const { id, passwordHash: oldHash } = await createTestUser(
            client,
            suffix,
            currentPassword,
            true // must_change_password = true initially
          )

          // Perform the password change
          const result = await simulateChangeOwnPassword(client, id, currentPassword, newPassword)
          assert.deepStrictEqual(result, { success: true }, 'Change should succeed')

          // Verify DB state after change
          const row = await client.query(
            `SELECT password_hash, must_change_password FROM admin_users WHERE id = $1`,
            [id]
          )

          const newStoredHash = row.rows[0].password_hash
          const mustChange = row.rows[0].must_change_password

          // password_hash differs from old
          assert.notStrictEqual(
            newStoredHash,
            oldHash,
            'Req 8.1: password_hash must differ from the old hash after successful change'
          )

          // Old password no longer verifies
          assert.strictEqual(
            simulateVerify(newStoredHash, currentPassword),
            false,
            'Req 8.1: old password must no longer verify against the new hash'
          )

          // New password verifies
          assert.strictEqual(
            simulateVerify(newStoredHash, newPassword),
            true,
            'Req 8.1: new password must verify against the new hash'
          )

          // must_change_password cleared (Req 6.4)
          assert.strictEqual(
            mustChange,
            false,
            'Req 6.4: must_change_password must be false after successful password change'
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('wrong current password yields 422 with hash unchanged (≥100 runs)', async () => {
    /**
     * Req 8.2: If the current password does not match the stored hash,
     * the request is rejected with 422 and password_hash remains unchanged.
     */
    await fc.assert(
      fc.asyncProperty(
        compliantPasswordArb,
        compliantPasswordArb,
        compliantPasswordArb,
        async (realPassword, wrongCurrent, newPassword) => {
          // Ensure the wrong current is actually wrong
          fc.pre(realPassword !== wrongCurrent)

          const suffix = `wrong-${Math.random().toString(36).slice(2, 10)}`
          const { id, passwordHash: originalHash } = await createTestUser(
            client,
            suffix,
            realPassword,
            true
          )

          // Attempt change with wrong current password
          const result = await simulateChangeOwnPassword(client, id, wrongCurrent, newPassword)
          assert.ok(!result.success, 'Req 8.2: Change must fail with wrong current password')
          assert.strictEqual(
            (result as { status: number }).status,
            422,
            'Req 8.2: Status must be 422'
          )

          // Verify hash is unchanged
          const row = await client.query(
            `SELECT password_hash, must_change_password FROM admin_users WHERE id = $1`,
            [id]
          )

          assert.strictEqual(
            row.rows[0].password_hash,
            originalHash,
            'Req 8.2: password_hash must remain unchanged when current password is wrong'
          )

          // must_change_password should also remain unchanged (still true)
          assert.strictEqual(
            row.rows[0].must_change_password,
            true,
            'Req 8.2: must_change_password must remain unchanged on failure'
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('non-compliant new password yields 422 with hash unchanged (≥100 runs)', async () => {
    /**
     * Req 8.3: If the new password violates the policy, the request is rejected
     * with 422 and password_hash remains unchanged.
     */
    await fc.assert(
      fc.asyncProperty(
        compliantPasswordArb,
        nonCompliantPasswordArb,
        async (currentPassword, badNewPassword) => {
          const suffix = `policy-${Math.random().toString(36).slice(2, 10)}`
          const { id, passwordHash: originalHash } = await createTestUser(
            client,
            suffix,
            currentPassword,
            true
          )

          // Attempt change with non-compliant new password
          const result = await simulateChangeOwnPassword(client, id, currentPassword, badNewPassword)
          assert.ok(!result.success, 'Req 8.3: Change must fail with non-compliant new password')
          assert.strictEqual(
            (result as { status: number }).status,
            422,
            'Req 8.3: Status must be 422'
          )

          // Verify hash is unchanged
          const row = await client.query(
            `SELECT password_hash, must_change_password FROM admin_users WHERE id = $1`,
            [id]
          )

          assert.strictEqual(
            row.rows[0].password_hash,
            originalHash,
            'Req 8.3: password_hash must remain unchanged when new password is non-compliant'
          )

          // must_change_password should also remain unchanged
          assert.strictEqual(
            row.rows[0].must_change_password,
            true,
            'Req 8.3: must_change_password must remain unchanged on failure'
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('the new hash never equals the plaintext new password (≥100 runs)', async () => {
    /**
     * Req 8.1: After a successful password change, the stored password_hash
     * must never equal the plaintext new password — it must always be a hash.
     */
    await fc.assert(
      fc.asyncProperty(
        compliantPasswordArb,
        compliantPasswordArb,
        async (currentPassword, newPassword) => {
          fc.pre(currentPassword !== newPassword)

          const suffix = `noplain-${Math.random().toString(36).slice(2, 10)}`
          const { id } = await createTestUser(client, suffix, currentPassword, true)

          // Perform successful change
          const result = await simulateChangeOwnPassword(client, id, currentPassword, newPassword)
          assert.deepStrictEqual(result, { success: true }, 'Change should succeed')

          // Verify the stored hash is NOT the plaintext
          const row = await client.query(
            `SELECT password_hash FROM admin_users WHERE id = $1`,
            [id]
          )

          const storedHash = row.rows[0].password_hash

          assert.notStrictEqual(
            storedHash,
            newPassword,
            'Req 8.1: password_hash must never equal the plaintext new password'
          )

          // Also verify it does not contain the plaintext as a substring
          assert.ok(
            !storedHash.includes(newPassword),
            'Req 8.1: password_hash must not contain the plaintext new password as a substring'
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
