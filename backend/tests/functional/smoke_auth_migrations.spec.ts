/**
 * Smoke tests for the three new auth-related migrations and admin_users stability.
 *
 * Assumes migrations have been run against the connected PostgreSQL database.
 * Uses raw pg Client to query information_schema and pg_indexes.
 *
 * Validates: Requirements 2.2, 3.1, 5.2
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

// ─── Helper: fetch column names for a table ───

async function getColumns(tableName: string): Promise<string[]> {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  )
  return result.rows.map((r: { column_name: string }) => r.column_name)
}

// ─── Helper: check if a table exists ───

async function tableExists(tableName: string): Promise<boolean> {
  const result = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  )
  return result.rowCount === 1
}

// ─── Helper: check if an index exists ───

async function indexExists(indexName: string): Promise<boolean> {
  const result = await client.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = $1`,
    [indexName]
  )
  return result.rowCount === 1
}

// ─── auth_access_tokens table ───

describe('Migration: auth_access_tokens table', () => {
  const TABLE = 'auth_access_tokens'
  const EXPECTED_COLUMNS = [
    'id',
    'tokenable_id',
    'type',
    'name',
    'hash',
    'abilities',
    'created_at',
    'updated_at',
    'last_used_at',
    'expires_at',
  ]

  it(`table "${TABLE}" exists`, async () => {
    const exists = await tableExists(TABLE)
    assert.strictEqual(exists, true, `Table "${TABLE}" should exist in the public schema`)
  })

  it(`table "${TABLE}" has all expected columns`, async () => {
    const actualColumns = await getColumns(TABLE)
    for (const col of EXPECTED_COLUMNS) {
      assert.ok(
        actualColumns.includes(col),
        `Table "${TABLE}" should have column "${col}". Actual: ${actualColumns.join(', ')}`
      )
    }
  })
})

// ─── password_reset_tokens table ───

describe('Migration: password_reset_tokens table', () => {
  const TABLE = 'password_reset_tokens'
  const EXPECTED_COLUMNS = [
    'id',
    'admin_user_id',
    'token_hash',
    'expires_at',
    'used_at',
    'created_at',
    'updated_at',
  ]

  it(`table "${TABLE}" exists`, async () => {
    const exists = await tableExists(TABLE)
    assert.strictEqual(exists, true, `Table "${TABLE}" should exist in the public schema`)
  })

  it(`table "${TABLE}" has all expected columns`, async () => {
    const actualColumns = await getColumns(TABLE)
    for (const col of EXPECTED_COLUMNS) {
      assert.ok(
        actualColumns.includes(col),
        `Table "${TABLE}" should have column "${col}". Actual: ${actualColumns.join(', ')}`
      )
    }
  })
})

// ─── rate_limits table ───

describe('Migration: rate_limits table', () => {
  const TABLE = 'rate_limits'
  const EXPECTED_COLUMNS = ['key', 'points', 'expire']

  it(`table "${TABLE}" exists`, async () => {
    const exists = await tableExists(TABLE)
    assert.strictEqual(exists, true, `Table "${TABLE}" should exist in the public schema`)
  })

  it(`table "${TABLE}" has all expected columns`, async () => {
    const actualColumns = await getColumns(TABLE)
    for (const col of EXPECTED_COLUMNS) {
      assert.ok(
        actualColumns.includes(col),
        `Table "${TABLE}" should have column "${col}". Actual: ${actualColumns.join(', ')}`
      )
    }
  })
})

// ─── admin_users table unchanged from foundation ───

describe('Stability: admin_users table unchanged', () => {
  const TABLE = 'admin_users'
  const FOUNDATION_COLUMNS = [
    'id',
    'nome',
    'email',
    'password_hash',
    'role',
    'ativo',
    'must_change_password',
    'last_login_at',
    'created_at',
    'updated_at',
  ]

  it(`table "${TABLE}" has exactly the foundation columns (no additions or removals)`, async () => {
    const actualColumns = await getColumns(TABLE)

    // Every foundation column must be present
    for (const col of FOUNDATION_COLUMNS) {
      assert.ok(
        actualColumns.includes(col),
        `Table "${TABLE}" should still have foundation column "${col}". Actual: ${actualColumns.join(', ')}`
      )
    }

    // No extra columns should exist
    assert.strictEqual(
      actualColumns.length,
      FOUNDATION_COLUMNS.length,
      `Table "${TABLE}" should have exactly ${FOUNDATION_COLUMNS.length} columns (foundation only). ` +
        `Found ${actualColumns.length}: ${actualColumns.join(', ')}`
    )
  })
})

// ─── Indexes for the new tables ───

describe('Indexes: auth migration indexes exist', () => {
  const EXPECTED_INDEXES = [
    'auth_access_tokens_tokenable_id_index',
    'password_reset_tokens_admin_user_id_index',
    'password_reset_tokens_token_hash_index',
  ]

  for (const idx of EXPECTED_INDEXES) {
    it(`index "${idx}" exists in pg_indexes`, async () => {
      const exists = await indexExists(idx)
      assert.strictEqual(exists, true, `Index "${idx}" should exist`)
    })
  }
})
