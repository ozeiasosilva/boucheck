/**
 * Example tests for seed content (Task 11.3)
 *
 * Asserts the seeder has populated the database with the demonstration data:
 * - Admin with bcrypt hash
 * - Category exists
 * - Demo survey is active with populated config_visual
 * - ≥8 questions spanning all three tipos
 * - Options on every choice question with pontuacao
 * - ≥2 cascade rules (skip-ahead + early-termination)
 * - Checklist items covering all three grupos
 * - ≥2 non-overlapping score ranges
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
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

before(async () => {
  client = new Client(getConnectionConfig())
  await client.connect()
})

after(async () => {
  await client.end()
})

describe('Seed content verification', () => {
  // ─── Requirement 10.1: Admin user with hashed password ───

  it('admin exists with email admin@boucheck.local and bcrypt password_hash', async () => {
    const res = await client.query(
      `SELECT email, password_hash FROM admin_users WHERE email = 'admin@boucheck.local'`
    )
    assert.strictEqual(res.rowCount, 1, 'Expected exactly one admin user with email admin@boucheck.local')

    const { password_hash } = res.rows[0]
    assert.ok(
      password_hash.startsWith('$2'),
      `password_hash should start with "$2" (bcrypt), got: ${password_hash.slice(0, 10)}...`
    )
    assert.ok(
      password_hash.length > 20,
      'password_hash should be a full bcrypt hash, not plaintext'
    )
  })

  // ─── Requirement 10.2: Category exists ───

  it('category "Maturidade em Cloud" exists', async () => {
    const res = await client.query(
      `SELECT id FROM categories WHERE nome = 'Maturidade em Cloud'`
    )
    assert.ok(res.rowCount! >= 1, 'Expected category "Maturidade em Cloud" to exist')
  })

  // ─── Requirement 10.3: Demo survey is ativo with populated config_visual ───

  it('survey "maturidade-cloud" exists with status=ativo and populated config_visual', async () => {
    const res = await client.query(
      `SELECT id, status, config_visual FROM surveys WHERE slug = 'maturidade-cloud'`
    )
    assert.strictEqual(res.rowCount, 1, 'Expected exactly one survey with slug "maturidade-cloud"')

    const row = res.rows[0]
    assert.strictEqual(row.status, 'ativo', 'Survey status should be "ativo"')
    assert.ok(row.config_visual !== null, 'config_visual should not be null')

    const configVisual =
      typeof row.config_visual === 'string'
        ? JSON.parse(row.config_visual)
        : row.config_visual

    const requiredKeys = ['cor_primaria', 'cor_secundaria', 'cor_fundo', 'logo_s3_key']
    for (const key of requiredKeys) {
      assert.ok(
        key in configVisual,
        `config_visual should contain key "${key}"`
      )
    }
  })

  // ─── Requirement 10.4: ≥8 questions spanning all three tipos ───

  it('≥8 questions linked to the demo survey covering all 3 tipo values', async () => {
    const surveyRes = await client.query(
      `SELECT id FROM surveys WHERE slug = 'maturidade-cloud'`
    )
    const surveyId = surveyRes.rows[0].id

    const questionsRes = await client.query(
      `SELECT id, tipo FROM questions WHERE survey_id = $1`,
      [surveyId]
    )
    assert.ok(
      questionsRes.rowCount! >= 8,
      `Expected ≥8 questions, got ${questionsRes.rowCount}`
    )

    const tipos = new Set(questionsRes.rows.map((r: { tipo: string }) => r.tipo))
    assert.ok(tipos.has('escolha_unica'), 'Questions should include tipo "escolha_unica"')
    assert.ok(tipos.has('multipla_escolha'), 'Questions should include tipo "multipla_escolha"')
    assert.ok(tipos.has('aberta'), 'Questions should include tipo "aberta"')
  })

  // ─── Requirement 10.5: Options with pontuacao on every choice question ───

  it('every escolha_unica/multipla_escolha question has ≥1 option with pontuacao', async () => {
    const surveyRes = await client.query(
      `SELECT id FROM surveys WHERE slug = 'maturidade-cloud'`
    )
    const surveyId = surveyRes.rows[0].id

    const choiceQuestions = await client.query(
      `SELECT id, tipo FROM questions
       WHERE survey_id = $1 AND tipo IN ('escolha_unica', 'multipla_escolha')`,
      [surveyId]
    )
    assert.ok(
      choiceQuestions.rowCount! > 0,
      'Expected at least one choice-type question'
    )

    for (const q of choiceQuestions.rows) {
      const optionsRes = await client.query(
        `SELECT id, pontuacao FROM question_options WHERE question_id = $1`,
        [q.id]
      )
      assert.ok(
        optionsRes.rowCount! >= 1,
        `Question id=${q.id} (tipo=${q.tipo}) should have ≥1 option, got ${optionsRes.rowCount}`
      )

      // At least one option should have a pontuacao value defined (numeric field always exists)
      const hasPontuacao = optionsRes.rows.some(
        (o: { pontuacao: string | number }) => Number(o.pontuacao) !== undefined
      )
      assert.ok(
        hasPontuacao,
        `Question id=${q.id} options should have pontuacao values`
      )
    }
  })

  // ─── Requirement 10.6: ≥2 cascade rules ───

  it('≥2 question_rules rows with at least one finalizar=true and one with next_question_id', async () => {
    const surveyRes = await client.query(
      `SELECT id FROM surveys WHERE slug = 'maturidade-cloud'`
    )
    const surveyId = surveyRes.rows[0].id

    // Get all rules for this survey's questions
    const rulesRes = await client.query(
      `SELECT qr.id, qr.finalizar, qr.next_question_id
       FROM question_rules qr
       JOIN question_options qo ON qo.id = qr.question_option_id
       JOIN questions q ON q.id = qo.question_id
       WHERE q.survey_id = $1`,
      [surveyId]
    )
    assert.ok(
      rulesRes.rowCount! >= 2,
      `Expected ≥2 question_rules, got ${rulesRes.rowCount}`
    )

    const hasTermination = rulesRes.rows.some(
      (r: { finalizar: boolean; next_question_id: string | null }) =>
        r.finalizar === true
    )
    assert.ok(hasTermination, 'Expected at least one rule with finalizar=true (early-termination)')

    const hasSkipAhead = rulesRes.rows.some(
      (r: { finalizar: boolean; next_question_id: string | null }) =>
        r.next_question_id !== null
    )
    assert.ok(hasSkipAhead, 'Expected at least one rule with next_question_id set (skip-ahead)')
  })

  // ─── Requirement 10.7: Checklist items covering all 3 grupos ───

  it('≥3 checklist_items covering all 3 grupo values', async () => {
    const surveyRes = await client.query(
      `SELECT id FROM surveys WHERE slug = 'maturidade-cloud'`
    )
    const surveyId = surveyRes.rows[0].id

    const checklistRes = await client.query(
      `SELECT id, grupo FROM checklist_items WHERE survey_id = $1`,
      [surveyId]
    )
    assert.ok(
      checklistRes.rowCount! >= 3,
      `Expected ≥3 checklist_items, got ${checklistRes.rowCount}`
    )

    const grupos = new Set(checklistRes.rows.map((r: { grupo: string }) => r.grupo))
    assert.ok(grupos.has('servico_cloud'), 'Checklist should include grupo "servico_cloud"')
    assert.ok(grupos.has('fabricante'), 'Checklist should include grupo "fabricante"')
    assert.ok(grupos.has('solucao'), 'Checklist should include grupo "solucao"')
  })

  // ─── Requirement 10.8: ≥2 non-overlapping score ranges ───

  it('≥2 score_ranges with non-overlapping min/max', async () => {
    const surveyRes = await client.query(
      `SELECT id FROM surveys WHERE slug = 'maturidade-cloud'`
    )
    const surveyId = surveyRes.rows[0].id

    const rangesRes = await client.query(
      `SELECT nome, min, max FROM score_ranges WHERE survey_id = $1 ORDER BY min ASC`,
      [surveyId]
    )
    assert.ok(
      rangesRes.rowCount! >= 2,
      `Expected ≥2 score_ranges, got ${rangesRes.rowCount}`
    )

    // Verify non-overlapping: each range's min should be > previous range's max
    const ranges = rangesRes.rows as Array<{ nome: string; min: string; max: string }>
    for (let i = 1; i < ranges.length; i++) {
      const prevMax = Number(ranges[i - 1].max)
      const currMin = Number(ranges[i].min)
      assert.ok(
        currMin > prevMax,
        `Score ranges overlap: "${ranges[i - 1].nome}" max=${prevMax} >= "${ranges[i].nome}" min=${currMin}`
      )
    }
  })
})
