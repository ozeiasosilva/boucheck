// Feature: foundation-data-model, Property 6: Survey version retention
/**
 * Property 6: Survey version retention
 *
 * Write an arbitrary positive integer `survey_version` on a response and its
 * associated question; reload both rows from the database and assert the value
 * is unchanged on both `responses` and `questions` tables.
 *
 * **Validates: Requirements 7.4**
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

// Parent IDs created during setup
let surveyId: number

const testRunId = `sv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

before(async () => {
  client = new Client(getConnectionConfig())
  await client.connect()

  // Create a parent survey for FK references
  const surveyRes = await client.query(
    `INSERT INTO surveys (slug, nome, status, version)
     VALUES ($1, 'Survey Version Test', 'rascunho', 1) RETURNING id`,
    [`sv-test-survey-${testRunId}`]
  )
  surveyId = Number(surveyRes.rows[0].id)
})

after(async () => {
  // Clean up in reverse FK order
  await client.query(`DELETE FROM responses WHERE survey_id = $1`, [surveyId])
  await client.query(`DELETE FROM questions WHERE survey_id = $1`, [surveyId])
  await client.query(`DELETE FROM surveys WHERE id = $1`, [surveyId])
  await client.end()
})

describe('Property 6: Survey version retention', () => {
  it('survey_version persists unchanged on questions table (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 2_147_483_647 }),
        async (surveyVersion) => {
          // Insert a question with the arbitrary survey_version
          const insertRes = await client.query(
            `INSERT INTO questions (survey_id, survey_version, texto, tipo, obrigatoria, ordem, peso)
             VALUES ($1, $2, $3, 'aberta', true, 0, 1) RETURNING id`,
            [surveyId, surveyVersion, `Question v${surveyVersion} ${testRunId}`]
          )
          const questionId = insertRes.rows[0].id

          // Reload and assert unchanged
          const reloadRes = await client.query(
            `SELECT survey_version FROM questions WHERE id = $1`,
            [questionId]
          )
          assert.strictEqual(
            reloadRes.rows[0].survey_version,
            surveyVersion,
            `questions.survey_version should be ${surveyVersion} after reload`
          )

          // Clean up
          await client.query(`DELETE FROM questions WHERE id = $1`, [questionId])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('survey_version persists unchanged on responses table (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 2_147_483_647 }),
        async (surveyVersion) => {
          // Insert a response with the arbitrary survey_version
          const insertRes = await client.query(
            `INSERT INTO responses (survey_id, survey_version, status)
             VALUES ($1, $2, 'iniciado') RETURNING id`,
            [surveyId, surveyVersion]
          )
          const responseId = insertRes.rows[0].id

          // Reload and assert unchanged
          const reloadRes = await client.query(
            `SELECT survey_version FROM responses WHERE id = $1`,
            [responseId]
          )
          assert.strictEqual(
            reloadRes.rows[0].survey_version,
            surveyVersion,
            `responses.survey_version should be ${surveyVersion} after reload`
          )

          // Clean up
          await client.query(`DELETE FROM responses WHERE id = $1`, [responseId])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('survey_version is consistent across both question and response for same version (≥100 runs)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 2_147_483_647 }),
        async (surveyVersion) => {
          // Insert a question with the survey_version
          const qRes = await client.query(
            `INSERT INTO questions (survey_id, survey_version, texto, tipo, obrigatoria, ordem, peso)
             VALUES ($1, $2, $3, 'escolha_unica', true, 0, 1) RETURNING id`,
            [surveyId, surveyVersion, `Q both-check v${surveyVersion} ${testRunId}`]
          )
          const questionId = qRes.rows[0].id

          // Insert a response with the same survey_version
          const rRes = await client.query(
            `INSERT INTO responses (survey_id, survey_version, status)
             VALUES ($1, $2, 'iniciado') RETURNING id`,
            [surveyId, surveyVersion]
          )
          const responseId = rRes.rows[0].id

          // Reload both and assert survey_version matches the original
          const reloadQ = await client.query(
            `SELECT survey_version FROM questions WHERE id = $1`,
            [questionId]
          )
          const reloadR = await client.query(
            `SELECT survey_version FROM responses WHERE id = $1`,
            [responseId]
          )

          assert.strictEqual(
            reloadQ.rows[0].survey_version,
            surveyVersion,
            `questions.survey_version should be ${surveyVersion}`
          )
          assert.strictEqual(
            reloadR.rows[0].survey_version,
            surveyVersion,
            `responses.survey_version should be ${surveyVersion}`
          )
          // Both should be the same value
          assert.strictEqual(
            reloadQ.rows[0].survey_version,
            reloadR.rows[0].survey_version,
            'survey_version should be consistent across question and response'
          )

          // Clean up
          await client.query(`DELETE FROM responses WHERE id = $1`, [responseId])
          await client.query(`DELETE FROM questions WHERE id = $1`, [questionId])
        }
      ),
      { numRuns: 100 }
    )
  })
})
