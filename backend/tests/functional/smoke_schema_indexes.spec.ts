/**
 * Smoke tests for schema, index, and migration ordering.
 *
 * Assumes migrations have been run against the connected PostgreSQL database.
 * Uses raw pg Client to query information_schema and pg_indexes.
 *
 * Validates: Requirements 1.1, 1.2, 8.1, 8.2, 8.3, 8.4, 15.1, 15.2
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
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

// ─── All 14 expected tables ───

const EXPECTED_TABLES = [
  'categories',
  'admin_users',
  'surveys',
  'questions',
  'question_options',
  'question_rules',
  'checklist_items',
  'score_ranges',
  'responses',
  'response_answers',
  'response_checklist',
  'response_events',
  'reports',
  'ai_generation_logs',
] as const

// ─── All expected named indexes ───

const EXPECTED_INDEXES = [
  'surveys_slug_index',
  'surveys_categoria_id_index',
  'surveys_created_by_index',
  'questions_survey_id_index',
  'question_options_question_id_index',
  'question_rules_question_option_id_index',
  'question_rules_next_question_id_index',
  'checklist_items_survey_id_index',
  'score_ranges_survey_id_index',
  'responses_survey_id_index',
  'responses_faixa_id_index',
  'responses_token_index',
  'response_answers_response_id_index',
  'response_answers_question_id_index',
  'response_answers_question_option_id_index',
  'response_checklist_response_id_index',
  'response_checklist_checklist_item_id_index',
  'response_events_response_id_index',
  'response_events_response_created_index',
  'reports_response_id_index',
  'reports_public_token_index',
  'ai_generation_logs_admin_user_id_index',
  'ai_generation_logs_survey_id_index',
] as const

// ─── Migration dependency order (table name extracted from filename) ───

const DEPENDENCY_ORDER = [
  'categories',
  'admin_users',
  'surveys',
  'questions',
  'question_options',
  'question_rules',
  'checklist_items',
  'score_ranges',
  'responses',
  'response_answers',
  'response_checklist',
  'response_events',
  'reports',
  'ai_generation_logs',
] as const

describe('Schema: all 14 tables exist', () => {
  for (const tableName of EXPECTED_TABLES) {
    it(`table "${tableName}" exists in information_schema`, async () => {
      const result = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
      )
      assert.strictEqual(
        result.rowCount,
        1,
        `Table "${tableName}" should exist in the public schema`
      )
    })
  }
})

describe('Schema: table columns exist', () => {
  const expectedColumns: Record<string, string[]> = {
    categories: ['id', 'nome', 'created_at', 'updated_at'],
    admin_users: [
      'id', 'nome', 'email', 'password_hash', 'role', 'ativo',
      'must_change_password', 'last_login_at', 'created_at', 'updated_at',
    ],
    surveys: [
      'id', 'slug', 'nome', 'categoria_id', 'status', 'version',
      'mensagem_objetivo', 'tempo_estimado_min', 'config_visual',
      'link_agendamento', 'email_notificacao', 'usar_ia_no_relatorio',
      'created_by', 'created_at', 'updated_at',
    ],
    questions: [
      'id', 'survey_id', 'survey_version', 'texto', 'descricao', 'tipo',
      'obrigatoria', 'ordem', 'peso', 'dimensao', 'created_at', 'updated_at',
    ],
    question_options: ['id', 'question_id', 'texto', 'pontuacao', 'ordem'],
    question_rules: ['id', 'question_option_id', 'next_question_id', 'finalizar', 'priority'],
    checklist_items: ['id', 'survey_id', 'nome', 'grupo'],
    score_ranges: ['id', 'survey_id', 'nome', 'min', 'max', 'descricao', 'cor'],
    responses: [
      'id', 'survey_id', 'survey_version', 'token', 'nome', 'telefone',
      'empresa', 'email', 'cargo', 'cidade', 'politica_versao', 'status',
      'pontuacao', 'faixa_id', 'started_at', 'completed_at', 'anonimizado',
      'created_at', 'updated_at',
    ],
    response_answers: ['id', 'response_id', 'question_id', 'question_option_id', 'texto_livre'],
    response_checklist: ['id', 'response_id', 'checklist_item_id'],
    response_events: ['id', 'response_id', 'tipo', 'payload', 'created_at'],
    reports: [
      'id', 'response_id', 'html_s3_key', 'pdf_s3_key', 'public_token',
      'expires_at', 'created_at', 'updated_at',
    ],
    ai_generation_logs: [
      'id', 'admin_user_id', 'survey_id', 'prompt', 'resultado',
      'tokens_input', 'tokens_output', 'sucesso', 'created_at',
    ],
  }

  for (const [tableName, columns] of Object.entries(expectedColumns)) {
    it(`table "${tableName}" has all expected columns`, async () => {
      const result = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
      )
      const actualColumns = result.rows.map((r: { column_name: string }) => r.column_name)

      for (const col of columns) {
        assert.ok(
          actualColumns.includes(col),
          `Table "${tableName}" should have column "${col}". Actual columns: ${actualColumns.join(', ')}`
        )
      }
    })
  }
})

describe('Indexes: all named indexes exist', () => {
  for (const indexName of EXPECTED_INDEXES) {
    it(`index "${indexName}" exists in pg_indexes`, async () => {
      const result = await client.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public' AND indexname = $1`,
        [indexName]
      )
      assert.strictEqual(
        result.rowCount,
        1,
        `Index "${indexName}" should exist`
      )
    })
  }
})

describe('Indexes: composite index on (response_events.response_id, created_at)', () => {
  it('response_events_response_created_index covers response_id and created_at', async () => {
    const result = await client.query(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'response_events_response_created_index'`
    )
    assert.strictEqual(result.rowCount, 1, 'Composite index should exist')

    const indexDef = (result.rows[0] as { indexdef: string }).indexdef.toLowerCase()
    assert.ok(
      indexDef.includes('response_id') && indexDef.includes('created_at'),
      `Composite index should reference both response_id and created_at. Got: ${indexDef}`
    )
  })
})

describe('Migration ordering: timestamp-prefixed and dependency-ordered', () => {
  const migrationsDir = resolve(
    import.meta.dirname,
    '..',
    '..',
    'database',
    'migrations'
  )

  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.ts') && !f.startsWith('.'))
    .sort()

  it('all migration filenames are timestamp-prefixed (13-digit numeric)', () => {
    for (const file of migrationFiles) {
      const match = /^(\d{13})_/.test(file)
      assert.ok(
        match,
        `Migration "${file}" should have a 13-digit timestamp prefix`
      )
    }
  })

  it('migration filenames sort into referential dependency order', () => {
    // Extract the table name from each migration filename
    // Pattern: {timestamp}_create_{table_name}_table.ts
    const tableOrder = migrationFiles.map((file) => {
      const match = file.match(/^\d{13}_create_(.+)_table\.ts$/)
      assert.ok(match, `Migration "${file}" should match the naming pattern {timestamp}_create_{name}_table.ts`)
      return match![1]
    })

    // Verify the extracted order matches expected dependency order
    assert.deepStrictEqual(
      tableOrder,
      DEPENDENCY_ORDER,
      'Migration files should sort into the correct referential dependency order'
    )
  })

  it('timestamps are monotonically increasing', () => {
    const timestamps = migrationFiles.map((file) => {
      const match = file.match(/^(\d{13})_/)
      assert.ok(match, `Migration "${file}" should have a timestamp prefix`)
      return Number(match![1])
    })

    for (let i = 1; i < timestamps.length; i++) {
      assert.ok(
        timestamps[i] > timestamps[i - 1],
        `Timestamp of migration ${migrationFiles[i]} (${timestamps[i]}) should be greater than ${migrationFiles[i - 1]} (${timestamps[i - 1]})`
      )
    }
  })
})
