// Feature: foundation-data-model, Property 3: UNIQUE constraint enforcement
// **Validates: Requirements 1.3, 2.2, 4.2, 4.6, 5.2**

import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import pg from 'pg'

const { Client } = pg

/**
 * Property 3: UNIQUE constraint enforcement
 *
 * For each UNIQUE constraint in the schema, inserting a row with a duplicate
 * value in the unique column(s) MUST be rejected by the database.
 *
 * Covered constraints:
 * - admin_users.email (Req 1.3)
 * - surveys.slug (Req 2.2)
 * - responses.token (Req 4.2)
 * - reports.response_id (Req 5.2)
 * - reports.public_token (Req 5.2)
 * - composite (response_answers.response_id, question_id, question_option_id) with non-null option (Req 4.6)
 */

let client: pg.Client

before(async () => {
  client = new Client({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'boucheck',
  })
  await client.connect()
})

after(async () => {
  await client.end()
})

beforeEach(async () => {
  // Clean tables in reverse dependency order to avoid FK violations
  await client.query('DELETE FROM response_answers')
  await client.query('DELETE FROM reports')
  await client.query('DELETE FROM response_events')
  await client.query('DELETE FROM response_checklist')
  await client.query('DELETE FROM responses')
  await client.query('DELETE FROM question_rules')
  await client.query('DELETE FROM question_options')
  await client.query('DELETE FROM questions')
  await client.query('DELETE FROM checklist_items')
  await client.query('DELETE FROM score_ranges')
  await client.query('DELETE FROM ai_generation_logs')
  await client.query('DELETE FROM surveys')
  await client.query('DELETE FROM categories')
  await client.query('DELETE FROM admin_users')
})

// Helper: generate an email-like string
const arbEmail = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 50, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
    fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) })
  )
  .map(([local, domain]) => `${local}@${domain}.com`)

// Helper: generate a slug-like string
const arbSlug = fc
  .string({ minLength: 1, maxLength: 80, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')) })
  .filter((s) => !s.startsWith('-') && !s.endsWith('-'))

describe('Property 3: UNIQUE constraint enforcement', () => {
  it('admin_users.email rejects duplicates (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(arbEmail, async (email) => {
        // Clean before each property iteration
        await client.query('DELETE FROM ai_generation_logs')
        await client.query('DELETE FROM surveys WHERE created_by IS NOT NULL')
        await client.query('DELETE FROM admin_users')

        // First insert succeeds
        await client.query(
          `INSERT INTO admin_users (nome, email, password_hash, role, ativo, must_change_password, created_at, updated_at)
           VALUES ('Test User', $1, 'hash123', 'admin', true, false, NOW(), NOW())`,
          [email]
        )

        // Duplicate insert must be rejected
        try {
          await client.query(
            `INSERT INTO admin_users (nome, email, password_hash, role, ativo, must_change_password, created_at, updated_at)
             VALUES ('Another User', $1, 'hash456', 'admin', true, false, NOW(), NOW())`,
            [email]
          )
          assert.fail('Expected UNIQUE violation for admin_users.email')
        } catch (err: unknown) {
          const pgErr = err as { code?: string }
          assert.strictEqual(pgErr.code, '23505', 'Should be a unique_violation error')
        }
      }),
      { numRuns: 100 }
    )
  })

  it('surveys.slug rejects duplicates (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(arbSlug, async (slug) => {
        // Clean before iteration
        await client.query('DELETE FROM questions')
        await client.query('DELETE FROM responses')
        await client.query('DELETE FROM checklist_items')
        await client.query('DELETE FROM score_ranges')
        await client.query('DELETE FROM surveys')

        // First insert
        await client.query(
          `INSERT INTO surveys (slug, nome, status, version, usar_ia_no_relatorio, created_at, updated_at)
           VALUES ($1, 'Test Survey', 'rascunho', 1, false, NOW(), NOW())`,
          [slug]
        )

        // Duplicate slug must be rejected
        try {
          await client.query(
            `INSERT INTO surveys (slug, nome, status, version, usar_ia_no_relatorio, created_at, updated_at)
             VALUES ($1, 'Another Survey', 'rascunho', 1, false, NOW(), NOW())`,
            [slug]
          )
          assert.fail('Expected UNIQUE violation for surveys.slug')
        } catch (err: unknown) {
          const pgErr = err as { code?: string }
          assert.strictEqual(pgErr.code, '23505', 'Should be a unique_violation error')
        }
      }),
      { numRuns: 100 }
    )
  })

  it('responses.token rejects duplicates (≥100 runs)', async () => {
    // Create prerequisite survey once
    await client.query('DELETE FROM responses')
    await client.query('DELETE FROM surveys')
    const surveyRes = await client.query(
      `INSERT INTO surveys (slug, nome, status, version, usar_ia_no_relatorio, created_at, updated_at)
       VALUES ('unique-test-survey', 'Survey', 'rascunho', 1, false, NOW(), NOW()) RETURNING id`
    )
    const surveyId = surveyRes.rows[0].id

    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (token) => {
        // Clean responses only
        await client.query('DELETE FROM response_answers')
        await client.query('DELETE FROM response_events')
        await client.query('DELETE FROM response_checklist')
        await client.query('DELETE FROM reports')
        await client.query('DELETE FROM responses')

        // First insert
        await client.query(
          `INSERT INTO responses (survey_id, survey_version, token, status, anonimizado, created_at, updated_at)
           VALUES ($1, 1, $2, 'iniciado', false, NOW(), NOW())`,
          [surveyId, token]
        )

        // Duplicate token must be rejected
        try {
          await client.query(
            `INSERT INTO responses (survey_id, survey_version, token, status, anonimizado, created_at, updated_at)
             VALUES ($1, 1, $2, 'iniciado', false, NOW(), NOW())`,
            [surveyId, token]
          )
          assert.fail('Expected UNIQUE violation for responses.token')
        } catch (err: unknown) {
          const pgErr = err as { code?: string }
          assert.strictEqual(pgErr.code, '23505', 'Should be a unique_violation error')
        }
      }),
      { numRuns: 100 }
    )
  })

  it('reports.response_id rejects duplicates (≥100 runs)', async () => {
    // Setup: survey
    await client.query('DELETE FROM reports')
    await client.query('DELETE FROM responses')
    await client.query('DELETE FROM surveys')
    const surveyRes = await client.query(
      `INSERT INTO surveys (slug, nome, status, version, usar_ia_no_relatorio, created_at, updated_at)
       VALUES ('report-test-survey', 'Survey', 'rascunho', 1, false, NOW(), NOW()) RETURNING id`
    )
    const surveyId = surveyRes.rows[0].id

    let responseCounter = 0

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 100, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
        async (publicToken) => {
          responseCounter++
          // Clean reports
          await client.query('DELETE FROM reports')
          await client.query('DELETE FROM responses')

          // Create a single response
          const resResult = await client.query(
            `INSERT INTO responses (survey_id, survey_version, status, anonimizado, created_at, updated_at)
             VALUES ($1, 1, 'iniciado', false, NOW(), NOW()) RETURNING id`,
            [surveyId]
          )
          const responseId = resResult.rows[0].id

          // First report for the response
          await client.query(
            `INSERT INTO reports (response_id, html_s3_key, public_token, created_at, updated_at)
             VALUES ($1, 'key1.html', $2, NOW(), NOW())`,
            [responseId, `token-a-${responseCounter}-${publicToken}`]
          )

          // Duplicate response_id must be rejected
          try {
            await client.query(
              `INSERT INTO reports (response_id, html_s3_key, public_token, created_at, updated_at)
               VALUES ($1, 'key2.html', $2, NOW(), NOW())`,
              [responseId, `token-b-${responseCounter}-${publicToken}`]
            )
            assert.fail('Expected UNIQUE violation for reports.response_id')
          } catch (err: unknown) {
            const pgErr = err as { code?: string }
            assert.strictEqual(pgErr.code, '23505', 'Should be a unique_violation error')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('reports.public_token rejects duplicates (≥100 runs)', async () => {
    // Setup: survey
    await client.query('DELETE FROM reports')
    await client.query('DELETE FROM responses')
    await client.query('DELETE FROM surveys')
    const surveyRes = await client.query(
      `INSERT INTO surveys (slug, nome, status, version, usar_ia_no_relatorio, created_at, updated_at)
       VALUES ('ptoken-test-survey', 'Survey', 'rascunho', 1, false, NOW(), NOW()) RETURNING id`
    )
    const surveyId = surveyRes.rows[0].id

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 100, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
        async (publicToken) => {
          // Clean
          await client.query('DELETE FROM reports')
          await client.query('DELETE FROM responses')

          // Create two separate responses
          const res1 = await client.query(
            `INSERT INTO responses (survey_id, survey_version, status, anonimizado, created_at, updated_at)
             VALUES ($1, 1, 'iniciado', false, NOW(), NOW()) RETURNING id`,
            [surveyId]
          )
          const res2 = await client.query(
            `INSERT INTO responses (survey_id, survey_version, status, anonimizado, created_at, updated_at)
             VALUES ($1, 1, 'iniciado', false, NOW(), NOW()) RETURNING id`,
            [surveyId]
          )

          // First report with this public_token
          await client.query(
            `INSERT INTO reports (response_id, html_s3_key, public_token, created_at, updated_at)
             VALUES ($1, 'key1.html', $2, NOW(), NOW())`,
            [res1.rows[0].id, publicToken]
          )

          // Duplicate public_token on different response must be rejected
          try {
            await client.query(
              `INSERT INTO reports (response_id, html_s3_key, public_token, created_at, updated_at)
               VALUES ($1, 'key2.html', $2, NOW(), NOW())`,
              [res2.rows[0].id, publicToken]
            )
            assert.fail('Expected UNIQUE violation for reports.public_token')
          } catch (err: unknown) {
            const pgErr = err as { code?: string }
            assert.strictEqual(pgErr.code, '23505', 'Should be a unique_violation error')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('response_answers composite (response_id, question_id, question_option_id) rejects duplicates when option is non-null (≥100 runs)', async () => {
    // Setup: survey → question → option, response
    await client.query('DELETE FROM response_answers')
    await client.query('DELETE FROM reports')
    await client.query('DELETE FROM response_events')
    await client.query('DELETE FROM response_checklist')
    await client.query('DELETE FROM responses')
    await client.query('DELETE FROM question_rules')
    await client.query('DELETE FROM question_options')
    await client.query('DELETE FROM questions')
    await client.query('DELETE FROM surveys')

    const surveyRes = await client.query(
      `INSERT INTO surveys (slug, nome, status, version, usar_ia_no_relatorio, created_at, updated_at)
       VALUES ('composite-test-survey', 'Survey', 'rascunho', 1, false, NOW(), NOW()) RETURNING id`
    )
    const surveyId = surveyRes.rows[0].id

    const questionRes = await client.query(
      `INSERT INTO questions (survey_id, survey_version, texto, tipo, obrigatoria, ordem, peso, created_at, updated_at)
       VALUES ($1, 1, 'Q1', 'escolha_unica', true, 1, 1.00, NOW(), NOW()) RETURNING id`,
      [surveyId]
    )
    const questionId = questionRes.rows[0].id

    const optionRes = await client.query(
      `INSERT INTO question_options (question_id, texto, pontuacao, ordem)
       VALUES ($1, 'Option A', 5.00, 1) RETURNING id`,
      [questionId]
    )
    const optionId = optionRes.rows[0].id

    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        // Clean response_answers and responses for each run
        await client.query('DELETE FROM response_answers')
        await client.query('DELETE FROM responses')

        // Create a response
        const resResult = await client.query(
          `INSERT INTO responses (survey_id, survey_version, status, anonimizado, created_at, updated_at)
           VALUES ($1, 1, 'iniciado', false, NOW(), NOW()) RETURNING id`,
          [surveyId]
        )
        const responseId = resResult.rows[0].id

        // First insert with non-null question_option_id
        await client.query(
          `INSERT INTO response_answers (response_id, question_id, question_option_id)
           VALUES ($1, $2, $3)`,
          [responseId, questionId, optionId]
        )

        // Duplicate (response_id, question_id, question_option_id) with same non-null option must be rejected
        try {
          await client.query(
            `INSERT INTO response_answers (response_id, question_id, question_option_id)
             VALUES ($1, $2, $3)`,
            [responseId, questionId, optionId]
          )
          assert.fail(
            'Expected UNIQUE violation for response_answers (response_id, question_id, question_option_id)'
          )
        } catch (err: unknown) {
          const pgErr = err as { code?: string }
          assert.strictEqual(pgErr.code, '23505', 'Should be a unique_violation error')
        }
      }),
      { numRuns: 100 }
    )
  })
})
