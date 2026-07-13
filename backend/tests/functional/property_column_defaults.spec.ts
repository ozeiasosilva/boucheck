// Feature: foundation-data-model, Property 5: Column defaults on omission
/**
 * Property 5: Column defaults on omission
 *
 * When a row is inserted omitting columns that have database-level defaults,
 * the database applies those defaults. For each defaulted column, we insert a
 * row omitting that column, reload it, and assert the default value is applied.
 *
 * Verified defaults:
 * - admin_users.role = 'admin'
 * - admin_users.ativo = true
 * - admin_users.must_change_password = false
 * - surveys.version = 1
 * - surveys.usar_ia_no_relatorio = false
 * - question_rules.finalizar = false
 * - responses.anonimizado = false
 *
 * **Validates: Requirements 1.4, 2.4, 2.8, 4.4**
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
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE || 'boucheck',
  }
}

let client: InstanceType<typeof Client>

// Parent IDs needed for FK constraints
let categoryId: number
let adminUserId: number
let surveyId: number
let questionId: number
let questionOptionId: number

const testRunId = `cd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

before(async () => {
  client = new Client(getConnectionConfig())
  await client.connect()

  // Create parent rows needed by FK dependencies
  const catRes = await client.query(
    `INSERT INTO categories (nome) VALUES ($1) RETURNING id`,
    [`Defaults Test Category ${testRunId}`]
  )
  categoryId = Number(catRes.rows[0].id)

  // admin_users: we insert a separate admin for FK usage (surveys.created_by)
  const adminRes = await client.query(
    `INSERT INTO admin_users (nome, email, password_hash)
     VALUES ($1, $2, 'hash_placeholder') RETURNING id`,
    [`Defaults Admin ${testRunId}`, `${testRunId}-fk@test.local`]
  )
  adminUserId = Number(adminRes.rows[0].id)

  const surveyRes = await client.query(
    `INSERT INTO surveys (slug, nome, categoria_id, created_by, status)
     VALUES ($1, 'Defaults Test Survey', $2, $3, 'rascunho') RETURNING id`,
    [`defaults-test-survey-${testRunId}`, categoryId, adminUserId]
  )
  surveyId = Number(surveyRes.rows[0].id)

  const qRes = await client.query(
    `INSERT INTO questions (survey_id, texto, tipo, obrigatoria, ordem, peso)
     VALUES ($1, 'Defaults Test Question', 'escolha_unica', true, 1, 1) RETURNING id`,
    [surveyId]
  )
  questionId = Number(qRes.rows[0].id)

  const qoRes = await client.query(
    `INSERT INTO question_options (question_id, texto, pontuacao, ordem)
     VALUES ($1, 'Defaults Test Option', 5, 1) RETURNING id`,
    [questionId]
  )
  questionOptionId = Number(qoRes.rows[0].id)
})

after(async () => {
  // Clean up in reverse FK dependency order
  await client.query(`DELETE FROM question_rules WHERE question_option_id = $1`, [questionOptionId])
  await client.query(`DELETE FROM responses WHERE survey_id = $1`, [surveyId])
  await client.query(`DELETE FROM question_options WHERE question_id = $1`, [questionId])
  await client.query(`DELETE FROM questions WHERE survey_id = $1`, [surveyId])
  await client.query(`DELETE FROM surveys WHERE id = $1`, [surveyId])
  await client.query(`DELETE FROM admin_users WHERE email LIKE $1`, [`${testRunId}%`])
  await client.query(`DELETE FROM categories WHERE id = $1`, [categoryId])
  await client.end()
})

describe('Property 5: Column defaults on omission', () => {
  // ─── admin_users.role defaults to 'admin' ───

  it('admin_users.role defaults to "admin" when omitted (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 999999 }),
        async (suffix) => {
          const email = `${testRunId}-role-${suffix}@test.local`
          const res = await client.query(
            `INSERT INTO admin_users (nome, email, password_hash)
             VALUES ($1, $2, 'hash_test') RETURNING id, role`,
            [`Role Test ${suffix}`, email]
          )
          const row = res.rows[0]
          assert.strictEqual(row.role, 'admin', `Expected role='admin', got '${row.role}'`)

          // Also verify via reload
          const reload = await client.query(`SELECT role FROM admin_users WHERE id = $1`, [row.id])
          assert.strictEqual(reload.rows[0].role, 'admin')

          // Cleanup
          await client.query(`DELETE FROM admin_users WHERE id = $1`, [row.id])
        }
      ),
      { numRuns: 100 }
    )
  })

  // ─── admin_users.ativo defaults to true ───

  it('admin_users.ativo defaults to true when omitted (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 999999 }),
        async (suffix) => {
          const email = `${testRunId}-ativo-${suffix}@test.local`
          const res = await client.query(
            `INSERT INTO admin_users (nome, email, password_hash)
             VALUES ($1, $2, 'hash_test') RETURNING id, ativo`,
            [`Ativo Test ${suffix}`, email]
          )
          const row = res.rows[0]
          assert.strictEqual(row.ativo, true, `Expected ativo=true, got '${row.ativo}'`)

          // Reload to confirm persistence
          const reload = await client.query(`SELECT ativo FROM admin_users WHERE id = $1`, [row.id])
          assert.strictEqual(reload.rows[0].ativo, true)

          // Cleanup
          await client.query(`DELETE FROM admin_users WHERE id = $1`, [row.id])
        }
      ),
      { numRuns: 100 }
    )
  })

  // ─── admin_users.must_change_password defaults to false ───

  it('admin_users.must_change_password defaults to false when omitted (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 999999 }),
        async (suffix) => {
          const email = `${testRunId}-mcp-${suffix}@test.local`
          const res = await client.query(
            `INSERT INTO admin_users (nome, email, password_hash)
             VALUES ($1, $2, 'hash_test') RETURNING id, must_change_password`,
            [`MCP Test ${suffix}`, email]
          )
          const row = res.rows[0]
          assert.strictEqual(
            row.must_change_password,
            false,
            `Expected must_change_password=false, got '${row.must_change_password}'`
          )

          // Reload
          const reload = await client.query(
            `SELECT must_change_password FROM admin_users WHERE id = $1`,
            [row.id]
          )
          assert.strictEqual(reload.rows[0].must_change_password, false)

          // Cleanup
          await client.query(`DELETE FROM admin_users WHERE id = $1`, [row.id])
        }
      ),
      { numRuns: 100 }
    )
  })

  // ─── surveys.version defaults to 1 ───

  it('surveys.version defaults to 1 when omitted (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 999999 }),
        async (suffix) => {
          const slug = `${testRunId}-ver-${suffix}`
          const res = await client.query(
            `INSERT INTO surveys (slug, nome, status)
             VALUES ($1, $2, 'rascunho') RETURNING id, version`,
            [slug, `Version Test ${suffix}`]
          )
          const row = res.rows[0]
          assert.strictEqual(
            Number(row.version),
            1,
            `Expected version=1, got '${row.version}'`
          )

          // Reload
          const reload = await client.query(`SELECT version FROM surveys WHERE id = $1`, [row.id])
          assert.strictEqual(Number(reload.rows[0].version), 1)

          // Cleanup
          await client.query(`DELETE FROM surveys WHERE id = $1`, [row.id])
        }
      ),
      { numRuns: 100 }
    )
  })

  // ─── surveys.usar_ia_no_relatorio defaults to false ───

  it('surveys.usar_ia_no_relatorio defaults to false when omitted (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 999999 }),
        async (suffix) => {
          const slug = `${testRunId}-ia-${suffix}`
          const res = await client.query(
            `INSERT INTO surveys (slug, nome, status)
             VALUES ($1, $2, 'rascunho') RETURNING id, usar_ia_no_relatorio`,
            [slug, `IA Test ${suffix}`]
          )
          const row = res.rows[0]
          assert.strictEqual(
            row.usar_ia_no_relatorio,
            false,
            `Expected usar_ia_no_relatorio=false, got '${row.usar_ia_no_relatorio}'`
          )

          // Reload
          const reload = await client.query(
            `SELECT usar_ia_no_relatorio FROM surveys WHERE id = $1`,
            [row.id]
          )
          assert.strictEqual(reload.rows[0].usar_ia_no_relatorio, false)

          // Cleanup
          await client.query(`DELETE FROM surveys WHERE id = $1`, [row.id])
        }
      ),
      { numRuns: 100 }
    )
  })

  // ─── question_rules.finalizar defaults to false ───

  it('question_rules.finalizar defaults to false when omitted (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 999999 }),
        async (_suffix) => {
          // Insert a question_rule omitting `finalizar`
          const res = await client.query(
            `INSERT INTO question_rules (question_option_id, priority)
             VALUES ($1, $2) RETURNING id, finalizar`,
            [questionOptionId, _suffix % 1000]
          )
          const row = res.rows[0]
          assert.strictEqual(
            row.finalizar,
            false,
            `Expected finalizar=false, got '${row.finalizar}'`
          )

          // Reload
          const reload = await client.query(
            `SELECT finalizar FROM question_rules WHERE id = $1`,
            [row.id]
          )
          assert.strictEqual(reload.rows[0].finalizar, false)

          // Cleanup
          await client.query(`DELETE FROM question_rules WHERE id = $1`, [row.id])
        }
      ),
      { numRuns: 100 }
    )
  })

  // ─── responses.anonimizado defaults to false ───

  it('responses.anonimizado defaults to false when omitted (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 999999 }),
        async (_suffix) => {
          // Insert a response omitting `anonimizado`
          const res = await client.query(
            `INSERT INTO responses (survey_id, survey_version, status)
             VALUES ($1, 1, 'iniciado') RETURNING id, anonimizado`,
            [surveyId]
          )
          const row = res.rows[0]
          assert.strictEqual(
            row.anonimizado,
            false,
            `Expected anonimizado=false, got '${row.anonimizado}'`
          )

          // Reload
          const reload = await client.query(
            `SELECT anonimizado FROM responses WHERE id = $1`,
            [row.id]
          )
          assert.strictEqual(reload.rows[0].anonimizado, false)

          // Cleanup
          await client.query(`DELETE FROM responses WHERE id = $1`, [row.id])
        }
      ),
      { numRuns: 100 }
    )
  })
})
