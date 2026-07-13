// Feature: foundation-data-model, Property 1: JSONB attribute round-trip
// **Validates: Requirements 7.1, 7.2, 7.3, 9.5**

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import fc from 'fast-check'
import pg from 'pg'

const { Pool } = pg

/**
 * Property 1: JSONB attribute round-trip
 *
 * For each JSONB attribute (Survey.configVisual, ResponseEvent.payload,
 * AiGenerationLog.resultado), generate arbitrary JSON objects with fast-check,
 * persist to PostgreSQL, reload from the database, and assert deep equality.
 *
 * This validates that JSONB columns faithfully preserve arbitrary JSON structures
 * through a full database round-trip — confirming the prepare/consume serialization
 * pattern works correctly.
 *
 * Requires: a running PostgreSQL 16 database with migrations applied.
 * Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE env vars as needed.
 */

let pool: pg.Pool

/**
 * Arbitrary that produces JSON objects (Record<string, unknown>) suitable for JSONB columns.
 * Constrained to avoid excessively deep/large structures while still covering a broad
 * input space: strings, numbers, booleans, null, nested arrays, and nested objects.
 */
const jsonbObjectArbitrary = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  fc.oneof(
    fc.string({ maxLength: 50 }),
    fc.integer({ min: -2147483648, max: 2147483647 }),
    fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e10, max: 1e10 }),
    fc.boolean(),
    fc.constant(null),
    fc.array(
      fc.oneof(fc.string({ maxLength: 20 }), fc.integer(), fc.boolean(), fc.constant(null)),
      { maxLength: 5 }
    ),
    fc.dictionary(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.oneof(fc.string({ maxLength: 20 }), fc.integer(), fc.boolean(), fc.constant(null)),
      { minKeys: 0, maxKeys: 3 }
    )
  ),
  { minKeys: 1, maxKeys: 10 }
)

describe('Property 1: JSONB attribute round-trip', () => {
  before(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DATABASE || 'boucheck_test',
    })

    // Verify connection
    await pool.query('SELECT 1')
  })

  after(async () => {
    if (pool) {
      await pool.end()
    }
  })

  it('Survey.configVisual round-trips arbitrary JSONB objects (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(jsonbObjectArbitrary, async (configVisual) => {
        const slug = `test-cv-${Date.now()}-${randomUUID().slice(0, 8)}`

        // Insert with JSONB value
        const insertResult = await pool.query(
          `INSERT INTO surveys (slug, nome, status, version, usar_ia_no_relatorio, config_visual, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
           RETURNING id`,
          [slug, 'Test Survey', 'rascunho', 1, false, JSON.stringify(configVisual)]
        )
        const id = insertResult.rows[0].id

        // Reload from DB
        const selectResult = await pool.query(
          'SELECT config_visual FROM surveys WHERE id = $1',
          [id]
        )
        const reloaded = selectResult.rows[0].config_visual

        // Assert deep equality — PostgreSQL returns JSONB as a parsed object via pg driver
        assert.deepStrictEqual(reloaded, configVisual)

        // Cleanup
        await pool.query('DELETE FROM surveys WHERE id = $1', [id])
      }),
      { numRuns: 100 }
    )
  })

  it('ResponseEvent.payload round-trips arbitrary JSONB objects (≥100 runs)', async () => {
    // Create parent rows needed for FK constraints
    const surveySlug = `test-re-${Date.now()}-${randomUUID().slice(0, 8)}`
    const surveyResult = await pool.query(
      `INSERT INTO surveys (slug, nome, status, version, usar_ia_no_relatorio, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id`,
      [surveySlug, 'Event Test Survey', 'rascunho', 1, false]
    )
    const surveyId = surveyResult.rows[0].id

    const responseToken = randomUUID()
    const responseResult = await pool.query(
      `INSERT INTO responses (survey_id, survey_version, token, status, anonimizado, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
       RETURNING id`,
      [surveyId, 1, responseToken, 'iniciado', false]
    )
    const responseId = responseResult.rows[0].id

    try {
      await fc.assert(
        fc.asyncProperty(jsonbObjectArbitrary, async (payload) => {
          // Insert with JSONB value
          const insertResult = await pool.query(
            `INSERT INTO response_events (response_id, tipo, payload, created_at)
             VALUES ($1, $2, $3::jsonb, NOW())
             RETURNING id`,
            [responseId, 'test_event', JSON.stringify(payload)]
          )
          const id = insertResult.rows[0].id

          // Reload from DB
          const selectResult = await pool.query(
            'SELECT payload FROM response_events WHERE id = $1',
            [id]
          )
          const reloaded = selectResult.rows[0].payload

          // Assert deep equality
          assert.deepStrictEqual(reloaded, payload)

          // Cleanup
          await pool.query('DELETE FROM response_events WHERE id = $1', [id])
        }),
        { numRuns: 100 }
      )
    } finally {
      // Cleanup parent rows
      await pool.query('DELETE FROM response_events WHERE response_id = $1', [responseId])
      await pool.query('DELETE FROM responses WHERE id = $1', [responseId])
      await pool.query('DELETE FROM surveys WHERE id = $1', [surveyId])
    }
  })

  it('AiGenerationLog.resultado round-trips arbitrary JSONB objects (≥100 runs)', async () => {
    // Create admin_user parent row for FK constraint
    const adminEmail = `admin-${Date.now()}@test.local`
    const adminResult = await pool.query(
      `INSERT INTO admin_users (nome, email, password_hash, role, ativo, must_change_password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id`,
      ['Test Admin', adminEmail, '$2b$10$placeholder_hash_for_test', 'admin', true, false]
    )
    const adminUserId = adminResult.rows[0].id

    try {
      await fc.assert(
        fc.asyncProperty(jsonbObjectArbitrary, async (resultado) => {
          // Insert with JSONB value
          const insertResult = await pool.query(
            `INSERT INTO ai_generation_logs (admin_user_id, prompt, resultado, sucesso, created_at)
             VALUES ($1, $2, $3::jsonb, $4, NOW())
             RETURNING id`,
            [adminUserId, 'test prompt', JSON.stringify(resultado), true]
          )
          const id = insertResult.rows[0].id

          // Reload from DB
          const selectResult = await pool.query(
            'SELECT resultado FROM ai_generation_logs WHERE id = $1',
            [id]
          )
          const reloaded = selectResult.rows[0].resultado

          // Assert deep equality
          assert.deepStrictEqual(reloaded, resultado)

          // Cleanup
          await pool.query('DELETE FROM ai_generation_logs WHERE id = $1', [id])
        }),
        { numRuns: 100 }
      )
    } finally {
      // Cleanup parent row
      await pool.query('DELETE FROM ai_generation_logs WHERE admin_user_id = $1', [adminUserId])
      await pool.query('DELETE FROM admin_users WHERE id = $1', [adminUserId])
    }
  })
})
