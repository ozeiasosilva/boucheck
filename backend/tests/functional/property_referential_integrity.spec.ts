// Feature: foundation-data-model, Property 4: Referential integrity enforcement
/**
 * Property 4: Referential integrity enforcement
 *
 * For any foreign-key column, inserting a child row whose FK value does not
 * correspond to an existing parent row is rejected, and inserting a child row
 * whose FK references an existing parent (or, where the column is nullable, is NULL)
 * is accepted.
 *
 * **Validates: Requirements 2.3, 4.3**
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

// Known parent IDs inserted during setup
let categoryId: number
let adminUserId: number
let surveyId: number
let scoreRangeId: number

// Unique suffix to prevent collisions with data from prior test runs
const testRunId = `ri-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

before(async () => {
  client = new Client(getConnectionConfig())
  await client.connect()

  // Create parent rows needed by FK tests
  const catRes = await client.query(
    `INSERT INTO categories (nome) VALUES ($1) RETURNING id`,
    [`Test Category ${testRunId}`]
  )
  categoryId = Number(catRes.rows[0].id)

  const adminRes = await client.query(
    `INSERT INTO admin_users (nome, email, password_hash)
     VALUES ($1, $2, 'hash_placeholder') RETURNING id`,
    [`Test Admin ${testRunId}`, `${testRunId}@test.local`]
  )
  adminUserId = Number(adminRes.rows[0].id)

  const surveyRes = await client.query(
    `INSERT INTO surveys (slug, nome, categoria_id, created_by, status)
     VALUES ($1, 'RI Test Survey', $2, $3, 'rascunho') RETURNING id`,
    [`ri-test-survey-${testRunId}`, categoryId, adminUserId]
  )
  surveyId = Number(surveyRes.rows[0].id)

  const srRes = await client.query(
    `INSERT INTO score_ranges (survey_id, nome, min, max)
     VALUES ($1, $2, 0, 100) RETURNING id`,
    [surveyId, `RI Test Range ${testRunId}`]
  )
  scoreRangeId = Number(srRes.rows[0].id)
})

after(async () => {
  // Clean up test data in reverse FK order
  await client.query(`DELETE FROM responses WHERE survey_id = $1`, [surveyId])
  await client.query(`DELETE FROM questions WHERE survey_id = $1`, [surveyId])
  await client.query(`DELETE FROM score_ranges WHERE survey_id = $1`, [surveyId])
  await client.query(`DELETE FROM surveys WHERE id = $1`, [surveyId])
  await client.query(`DELETE FROM admin_users WHERE id = $1`, [adminUserId])
  await client.query(`DELETE FROM categories WHERE id = $1`, [categoryId])
  await client.end()
})

/**
 * Helper: attempts an INSERT and returns true if it succeeds, false if it
 * throws a foreign key violation (error code 23503).
 */
async function insertSucceeds(sql: string, params: unknown[]): Promise<boolean> {
  try {
    await client.query(sql, params)
    return true
  } catch (err: unknown) {
    const pgErr = err as { code?: string }
    if (pgErr.code === '23503') {
      // FK violation
      return false
    }
    // Re-throw unexpected errors
    throw err
  }
}

describe('Property 4: Referential integrity enforcement', () => {
  // ─── 1. surveys.categoria_id → categories.id (nullable FK) ───

  it('surveys.categoria_id: non-existent parent is rejected (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 900000, max: 999999999 }), async (fakeId) => {
        // Ensure the ID doesn't actually exist
        const exists = await client.query(`SELECT 1 FROM categories WHERE id = $1`, [fakeId])
        if (exists.rowCount! > 0) return // skip if happens to exist

        const ok = await insertSucceeds(
          `INSERT INTO surveys (slug, nome, categoria_id, status)
           VALUES ($1, 'FK Test', $2, 'rascunho')`,
          [`ri-cat-reject-${fakeId}-${testRunId}`, fakeId]
        )
        assert.strictEqual(ok, false, `INSERT with non-existent categoria_id=${fakeId} should be rejected`)
      }),
      { numRuns: 100 }
    )
  })

  it('surveys.categoria_id: NULL is accepted (nullable FK)', async () => {
    const slug = `ri-cat-null-${testRunId}`
    const ok = await insertSucceeds(
      `INSERT INTO surveys (slug, nome, categoria_id, status) VALUES ($1, 'FK Null Test', NULL, 'rascunho')`,
      [slug]
    )
    assert.strictEqual(ok, true, 'INSERT with NULL categoria_id should be accepted')
    // cleanup
    await client.query(`DELETE FROM surveys WHERE slug = $1`, [slug])
  })

  it('surveys.categoria_id: existing parent is accepted', async () => {
    const slug = `ri-cat-existing-${testRunId}`
    const ok = await insertSucceeds(
      `INSERT INTO surveys (slug, nome, categoria_id, status) VALUES ($1, 'FK Existing Test', $2, 'rascunho')`,
      [slug, categoryId]
    )
    assert.strictEqual(ok, true, 'INSERT with existing categoria_id should be accepted')
    // cleanup
    await client.query(`DELETE FROM surveys WHERE slug = $1`, [slug])
  })

  // ─── 2. surveys.created_by → admin_users.id (nullable FK) ───

  it('surveys.created_by: non-existent parent is rejected (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 900000, max: 999999999 }), async (fakeId) => {
        const exists = await client.query(`SELECT 1 FROM admin_users WHERE id = $1`, [fakeId])
        if (exists.rowCount! > 0) return

        const ok = await insertSucceeds(
          `INSERT INTO surveys (slug, nome, created_by, status)
           VALUES ($1, 'FK Test', $2, 'rascunho')`,
          [`ri-admin-reject-${fakeId}-${testRunId}`, fakeId]
        )
        assert.strictEqual(ok, false, `INSERT with non-existent created_by=${fakeId} should be rejected`)
      }),
      { numRuns: 100 }
    )
  })

  it('surveys.created_by: NULL is accepted (nullable FK)', async () => {
    const slug = `ri-admin-null-${testRunId}`
    const ok = await insertSucceeds(
      `INSERT INTO surveys (slug, nome, created_by, status) VALUES ($1, 'FK Null Test', NULL, 'rascunho')`,
      [slug]
    )
    assert.strictEqual(ok, true, 'INSERT with NULL created_by should be accepted')
    await client.query(`DELETE FROM surveys WHERE slug = $1`, [slug])
  })

  it('surveys.created_by: existing parent is accepted', async () => {
    const slug = `ri-admin-existing-${testRunId}`
    const ok = await insertSucceeds(
      `INSERT INTO surveys (slug, nome, created_by, status) VALUES ($1, 'FK Existing Test', $2, 'rascunho')`,
      [slug, adminUserId]
    )
    assert.strictEqual(ok, true, 'INSERT with existing created_by should be accepted')
    await client.query(`DELETE FROM surveys WHERE slug = $1`, [slug])
  })

  // ─── 3. questions.survey_id → surveys.id (NOT NULL FK) ───

  it('questions.survey_id: non-existent parent is rejected (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 900000, max: 999999999 }), async (fakeId) => {
        const exists = await client.query(`SELECT 1 FROM surveys WHERE id = $1`, [fakeId])
        if (exists.rowCount! > 0) return

        const ok = await insertSucceeds(
          `INSERT INTO questions (survey_id, texto, tipo, obrigatoria, ordem, peso)
           VALUES ($1, 'FK Test Q', 'aberta', true, 1, 1)`,
          [fakeId]
        )
        assert.strictEqual(ok, false, `INSERT with non-existent survey_id=${fakeId} should be rejected`)
      }),
      { numRuns: 100 }
    )
  })

  it('questions.survey_id: existing parent is accepted', async () => {
    const ok = await insertSucceeds(
      `INSERT INTO questions (survey_id, texto, tipo, obrigatoria, ordem, peso)
       VALUES ($1, 'FK Existing Q', 'aberta', true, 999, 1)`,
      [surveyId]
    )
    assert.strictEqual(ok, true, 'INSERT with existing survey_id should be accepted')
    // cleanup
    await client.query(`DELETE FROM questions WHERE survey_id = $1 AND ordem = 999`, [surveyId])
  })

  // ─── 4. responses.survey_id → surveys.id (NOT NULL FK) ───

  it('responses.survey_id: non-existent parent is rejected (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 900000, max: 999999999 }), async (fakeId) => {
        const exists = await client.query(`SELECT 1 FROM surveys WHERE id = $1`, [fakeId])
        if (exists.rowCount! > 0) return

        const ok = await insertSucceeds(
          `INSERT INTO responses (survey_id, survey_version, status)
           VALUES ($1, 1, 'iniciado')`,
          [fakeId]
        )
        assert.strictEqual(ok, false, `INSERT with non-existent responses.survey_id=${fakeId} should be rejected`)
      }),
      { numRuns: 100 }
    )
  })

  it('responses.survey_id: existing parent is accepted', async () => {
    const res = await client.query(
      `INSERT INTO responses (survey_id, survey_version, status)
       VALUES ($1, 1, 'iniciado') RETURNING id`,
      [surveyId]
    )
    assert.ok(res.rows.length > 0, 'INSERT with existing survey_id should be accepted')
    // cleanup
    await client.query(`DELETE FROM responses WHERE id = $1`, [res.rows[0].id])
  })

  // ─── 5. responses.faixa_id → score_ranges.id (nullable FK) ───

  it('responses.faixa_id: non-existent parent is rejected (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 900000, max: 999999999 }), async (fakeId) => {
        const exists = await client.query(`SELECT 1 FROM score_ranges WHERE id = $1`, [fakeId])
        if (exists.rowCount! > 0) return

        const ok = await insertSucceeds(
          `INSERT INTO responses (survey_id, survey_version, faixa_id, status)
           VALUES ($1, 1, $2, 'iniciado')`,
          [surveyId, fakeId]
        )
        assert.strictEqual(ok, false, `INSERT with non-existent faixa_id=${fakeId} should be rejected`)
      }),
      { numRuns: 100 }
    )
  })

  it('responses.faixa_id: NULL is accepted (nullable FK)', async () => {
    const res = await client.query(
      `INSERT INTO responses (survey_id, survey_version, faixa_id, status)
       VALUES ($1, 1, NULL, 'iniciado') RETURNING id`,
      [surveyId]
    )
    assert.ok(res.rows.length > 0, 'INSERT with NULL faixa_id should be accepted')
    await client.query(`DELETE FROM responses WHERE id = $1`, [res.rows[0].id])
  })

  it('responses.faixa_id: existing parent is accepted', async () => {
    const res = await client.query(
      `INSERT INTO responses (survey_id, survey_version, faixa_id, status)
       VALUES ($1, 1, $2, 'iniciado') RETURNING id`,
      [surveyId, scoreRangeId]
    )
    assert.ok(res.rows.length > 0, 'INSERT with existing faixa_id should be accepted')
    await client.query(`DELETE FROM responses WHERE id = $1`, [res.rows[0].id])
  })
})
