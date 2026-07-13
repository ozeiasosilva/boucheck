/**
 * Example test: Early-termination rule row
 *
 * Validates that a `question_rules` row with `next_question_id = NULL` and
 * `finalizar = true` can be persisted and reloaded correctly, representing
 * an early-termination rule as specified in Requirement 2.9.
 *
 * **Validates: Requirements 2.9**
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
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

// IDs of prerequisite rows created during setup
let categoryId: number
let adminUserId: number
let surveyId: number
let questionId: number
let questionOptionId: number
let questionRuleId: number

const testRunId = `et-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

before(async () => {
  client = new Client(getConnectionConfig())
  await client.connect()

  // 1. Create category
  const catRes = await client.query(
    `INSERT INTO categories (nome) VALUES ($1) RETURNING id`,
    [`ET Test Category ${testRunId}`]
  )
  categoryId = Number(catRes.rows[0].id)

  // 2. Create admin user
  const adminRes = await client.query(
    `INSERT INTO admin_users (nome, email, password_hash)
     VALUES ($1, $2, 'hash_placeholder') RETURNING id`,
    [`ET Test Admin ${testRunId}`, `${testRunId}@test.local`]
  )
  adminUserId = Number(adminRes.rows[0].id)

  // 3. Create survey
  const surveyRes = await client.query(
    `INSERT INTO surveys (slug, nome, categoria_id, created_by, status)
     VALUES ($1, 'ET Test Survey', $2, $3, 'rascunho') RETURNING id`,
    [`et-test-survey-${testRunId}`, categoryId, adminUserId]
  )
  surveyId = Number(surveyRes.rows[0].id)

  // 4. Create question
  const questionRes = await client.query(
    `INSERT INTO questions (survey_id, texto, tipo, obrigatoria, ordem, peso)
     VALUES ($1, 'ET Test Question', 'escolha_unica', true, 1, 1) RETURNING id`,
    [surveyId]
  )
  questionId = Number(questionRes.rows[0].id)

  // 5. Create question option
  const optionRes = await client.query(
    `INSERT INTO question_options (question_id, texto, pontuacao, ordem)
     VALUES ($1, 'ET Test Option', 0, 1) RETURNING id`,
    [questionId]
  )
  questionOptionId = Number(optionRes.rows[0].id)
})

after(async () => {
  // Clean up in reverse FK dependency order
  if (questionRuleId) {
    await client.query(`DELETE FROM question_rules WHERE id = $1`, [questionRuleId])
  }
  await client.query(`DELETE FROM question_options WHERE id = $1`, [questionOptionId])
  await client.query(`DELETE FROM questions WHERE id = $1`, [questionId])
  await client.query(`DELETE FROM surveys WHERE id = $1`, [surveyId])
  await client.query(`DELETE FROM admin_users WHERE id = $1`, [adminUserId])
  await client.query(`DELETE FROM categories WHERE id = $1`, [categoryId])
  await client.end()
})

describe('Example: Early-termination rule row (Req 2.9)', () => {
  it('persists a question_rules row with next_question_id=NULL and finalizar=true', async () => {
    // Insert an early-termination rule: next_question_id is NULL, finalizar is true
    const insertRes = await client.query(
      `INSERT INTO question_rules (question_option_id, next_question_id, finalizar, priority)
       VALUES ($1, NULL, true, 0) RETURNING id`,
      [questionOptionId]
    )
    assert.strictEqual(insertRes.rows.length, 1, 'INSERT should return one row')
    questionRuleId = Number(insertRes.rows[0].id)

    // Reload from DB and assert both values are persisted correctly
    const reloadRes = await client.query(
      `SELECT next_question_id, finalizar FROM question_rules WHERE id = $1`,
      [questionRuleId]
    )
    assert.strictEqual(reloadRes.rows.length, 1, 'Should find the inserted rule')

    const row = reloadRes.rows[0]
    assert.strictEqual(row.next_question_id, null, 'next_question_id should be NULL')
    assert.strictEqual(row.finalizar, true, 'finalizar should be true')
  })
})
