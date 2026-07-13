// Feature: foundation-data-model, Property 2: ENUM domain enforcement
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import pg from 'pg'

const { Client } = pg

/**
 * Property 2: ENUM domain enforcement
 *
 * For each ENUM column (surveys.status, questions.tipo, checklist_items.grupo,
 * responses.status), an insert succeeds iff the value is in the allowed set.
 * Invalid values are rejected by the CHECK constraint.
 */

const ENUM_SPECS = [
  {
    table: 'surveys',
    column: 'status',
    allowed: ['rascunho', 'ativo', 'inativo', 'arquivado'] as const,
  },
  {
    table: 'questions',
    column: 'tipo',
    allowed: ['escolha_unica', 'multipla_escolha', 'aberta'] as const,
  },
  {
    table: 'checklist_items',
    column: 'grupo',
    allowed: ['servico_cloud', 'fabricante', 'solucao'] as const,
  },
  {
    table: 'responses',
    column: 'status',
    allowed: ['iniciado', 'completo'] as const,
  },
] as const

let client: InstanceType<typeof Client>

before(async () => {
  client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'boucheck',
  })
  await client.connect()

  // Ensure prerequisite rows exist for FK constraints
  await client.query(`
    INSERT INTO categories (nome) VALUES ('test-category')
    ON CONFLICT DO NOTHING
  `)
  await client.query(`
    INSERT INTO admin_users (nome, email, password_hash)
    VALUES ('Test Admin', 'enum-test-admin@test.local', 'hash123')
    ON CONFLICT (email) DO NOTHING
  `)

  // Get the admin user id
  const adminRes = await client.query(
    `SELECT id FROM admin_users WHERE email = 'enum-test-admin@test.local'`
  )
  const adminId = adminRes.rows[0].id

  // Get the category id
  const catRes = await client.query(`SELECT id FROM categories LIMIT 1`)
  const categoryId = catRes.rows[0].id

  // Ensure a survey exists for questions/checklist_items FK
  await client.query(
    `INSERT INTO surveys (slug, nome, categoria_id, status, created_by)
     VALUES ('enum-test-survey', 'Enum Test Survey', $1, 'rascunho', $2)
     ON CONFLICT (slug) DO NOTHING`,
    [categoryId, adminId]
  )

  // Ensure a score_range exists for responses FK
  const surveyRes = await client.query(
    `SELECT id FROM surveys WHERE slug = 'enum-test-survey'`
  )
  const surveyId = surveyRes.rows[0].id

  await client.query(
    `INSERT INTO score_ranges (survey_id, nome, "min", "max")
     SELECT $1, 'Test Range', 0, 100
     WHERE NOT EXISTS (SELECT 1 FROM score_ranges WHERE survey_id = $1 AND nome = 'Test Range')`,
    [surveyId]
  )
})

after(async () => {
  if (client) {
    // Cleanup test data in reverse dependency order
    await client.query(`DELETE FROM responses WHERE survey_id IN (SELECT id FROM surveys WHERE slug = 'enum-test-survey')`)
    await client.query(`DELETE FROM checklist_items WHERE survey_id IN (SELECT id FROM surveys WHERE slug = 'enum-test-survey')`)
    await client.query(`DELETE FROM questions WHERE survey_id IN (SELECT id FROM surveys WHERE slug = 'enum-test-survey')`)
    await client.query(`DELETE FROM score_ranges WHERE survey_id IN (SELECT id FROM surveys WHERE slug = 'enum-test-survey')`)
    await client.query(`DELETE FROM surveys WHERE slug = 'enum-test-survey'`)
    await client.query(`DELETE FROM admin_users WHERE email = 'enum-test-admin@test.local'`)
    await client.end()
  }
})

describe('Property 2: ENUM domain enforcement', () => {
  describe('surveys.status — valid values are accepted', () => {
    it('inserting any allowed status value succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...ENUM_SPECS[0].allowed),
          async (status) => {
            const slug = `enum-valid-survey-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            const res = await client.query(
              `INSERT INTO surveys (slug, nome, status)
               VALUES ($1, 'Test', $2)
               RETURNING id`,
              [slug, status]
            )
            assert.ok(res.rows.length === 1, `Insert with status '${status}' should succeed`)
            // Cleanup
            await client.query(`DELETE FROM surveys WHERE id = $1`, [res.rows[0].id])
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('surveys.status — invalid values are rejected', () => {
    it('inserting a value outside the allowed set is rejected by CHECK constraint', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(
            (s) => !(ENUM_SPECS[0].allowed as readonly string[]).includes(s)
          ),
          async (invalidStatus) => {
            const slug = `enum-invalid-survey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            try {
              await client.query(
                `INSERT INTO surveys (slug, nome, status)
                 VALUES ($1, 'Test', $2)
                 RETURNING id`,
                [slug, invalidStatus]
              )
              assert.fail(`Insert with invalid status '${invalidStatus}' should have been rejected`)
            } catch (err: unknown) {
              const pgErr = err as { code?: string }
              assert.strictEqual(
                pgErr.code,
                '23514',
                `Expected CHECK violation (23514) but got code ${pgErr.code}`
              )
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('questions.tipo — valid values are accepted', () => {
    it('inserting any allowed tipo value succeeds', async () => {
      const surveyRes = await client.query(
        `SELECT id FROM surveys WHERE slug = 'enum-test-survey'`
      )
      const surveyId = surveyRes.rows[0].id

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...ENUM_SPECS[1].allowed),
          async (tipo) => {
            const res = await client.query(
              `INSERT INTO questions (survey_id, texto, tipo)
               VALUES ($1, 'Test question', $2)
               RETURNING id`,
              [surveyId, tipo]
            )
            assert.ok(res.rows.length === 1, `Insert with tipo '${tipo}' should succeed`)
            await client.query(`DELETE FROM questions WHERE id = $1`, [res.rows[0].id])
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('questions.tipo — invalid values are rejected', () => {
    it('inserting a value outside the allowed set is rejected by CHECK constraint', async () => {
      const surveyRes = await client.query(
        `SELECT id FROM surveys WHERE slug = 'enum-test-survey'`
      )
      const surveyId = surveyRes.rows[0].id

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(
            (s) => !(ENUM_SPECS[1].allowed as readonly string[]).includes(s)
          ),
          async (invalidTipo) => {
            try {
              await client.query(
                `INSERT INTO questions (survey_id, texto, tipo)
                 VALUES ($1, 'Test question', $2)
                 RETURNING id`,
                [surveyId, invalidTipo]
              )
              assert.fail(`Insert with invalid tipo '${invalidTipo}' should have been rejected`)
            } catch (err: unknown) {
              const pgErr = err as { code?: string }
              assert.strictEqual(
                pgErr.code,
                '23514',
                `Expected CHECK violation (23514) but got code ${pgErr.code}`
              )
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('checklist_items.grupo — valid values are accepted', () => {
    it('inserting any allowed grupo value succeeds', async () => {
      const surveyRes = await client.query(
        `SELECT id FROM surveys WHERE slug = 'enum-test-survey'`
      )
      const surveyId = surveyRes.rows[0].id

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...ENUM_SPECS[2].allowed),
          async (grupo) => {
            const res = await client.query(
              `INSERT INTO checklist_items (survey_id, nome, grupo)
               VALUES ($1, 'Test item', $2)
               RETURNING id`,
              [surveyId, grupo]
            )
            assert.ok(res.rows.length === 1, `Insert with grupo '${grupo}' should succeed`)
            await client.query(`DELETE FROM checklist_items WHERE id = $1`, [res.rows[0].id])
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('checklist_items.grupo — invalid values are rejected', () => {
    it('inserting a value outside the allowed set is rejected by CHECK constraint', async () => {
      const surveyRes = await client.query(
        `SELECT id FROM surveys WHERE slug = 'enum-test-survey'`
      )
      const surveyId = surveyRes.rows[0].id

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(
            (s) => !(ENUM_SPECS[2].allowed as readonly string[]).includes(s)
          ),
          async (invalidGrupo) => {
            try {
              await client.query(
                `INSERT INTO checklist_items (survey_id, nome, grupo)
                 VALUES ($1, 'Test item', $2)
                 RETURNING id`,
                [surveyId, invalidGrupo]
              )
              assert.fail(`Insert with invalid grupo '${invalidGrupo}' should have been rejected`)
            } catch (err: unknown) {
              const pgErr = err as { code?: string }
              assert.strictEqual(
                pgErr.code,
                '23514',
                `Expected CHECK violation (23514) but got code ${pgErr.code}`
              )
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('responses.status — valid values are accepted', () => {
    it('inserting any allowed status value succeeds', async () => {
      const surveyRes = await client.query(
        `SELECT id FROM surveys WHERE slug = 'enum-test-survey'`
      )
      const surveyId = surveyRes.rows[0].id

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...ENUM_SPECS[3].allowed),
          async (status) => {
            const res = await client.query(
              `INSERT INTO responses (survey_id, status)
               VALUES ($1, $2)
               RETURNING id`,
              [surveyId, status]
            )
            assert.ok(res.rows.length === 1, `Insert with status '${status}' should succeed`)
            await client.query(`DELETE FROM responses WHERE id = $1`, [res.rows[0].id])
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('responses.status — invalid values are rejected', () => {
    it('inserting a value outside the allowed set is rejected by CHECK constraint', async () => {
      const surveyRes = await client.query(
        `SELECT id FROM surveys WHERE slug = 'enum-test-survey'`
      )
      const surveyId = surveyRes.rows[0].id

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(
            (s) => !(ENUM_SPECS[3].allowed as readonly string[]).includes(s)
          ),
          async (invalidStatus) => {
            try {
              await client.query(
                `INSERT INTO responses (survey_id, status)
                 VALUES ($1, $2)
                 RETURNING id`,
                [surveyId, invalidStatus]
              )
              assert.fail(`Insert with invalid status '${invalidStatus}' should have been rejected`)
            } catch (err: unknown) {
              const pgErr = err as { code?: string }
              assert.strictEqual(
                pgErr.code,
                '23514',
                `Expected CHECK violation (23514) but got code ${pgErr.code}`
              )
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
