// Feature: foundation-data-model, Property 8: Migration up/down reversibility
/**
 * Property 8: Migration up/down reversibility
 *
 * Running `migration:run` followed by `migration:rollback --batch=0` returns the
 * database schema to an empty state — the set of application tables is empty again
 * (up∘down is identity on schema). Only AdonisJS internal tables
 * (`adonis_schema`, `adonis_schema_versions`) may remain.
 *
 * **Validates: Requirements 15.2, 15.3**
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'
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

/** Tables managed by AdonisJS internally (not application tables) */
const ADONIS_INTERNAL_TABLES = new Set(['adonis_schema', 'adonis_schema_versions'])

/**
 * Executes an ace command in the backend directory.
 * Inherits env vars so the DB connection config is available to ace.
 */
function runAceCommand(command: string): void {
  const backendDir = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
  execSync(`node --import tsx/esm ace.js ${command}`, {
    cwd: backendDir,
    stdio: 'pipe',
    env: { ...process.env },
    timeout: 60_000,
  })
}

let client: InstanceType<typeof Client>

before(async () => {
  client = new Client(getConnectionConfig())
  await client.connect()

  // Ensure clean slate: rollback everything first in case prior runs left state
  try {
    runAceCommand('migration:rollback --batch=0')
  } catch {
    // Ignore if nothing to roll back
  }
})

after(async () => {
  await client.end()
})

/**
 * Queries the current database for all tables in the `public` schema,
 * excluding AdonisJS internal tracking tables.
 */
async function getApplicationTables(dbClient: InstanceType<typeof Client>): Promise<string[]> {
  const result = await dbClient.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  )
  return result.rows
    .map((r: { table_name: string }) => r.table_name)
    .filter((name: string) => !ADONIS_INTERNAL_TABLES.has(name))
}

describe('Property 8: Migration up/down reversibility', () => {
  it('migration:run then migration:rollback --batch=0 leaves no application tables (fc.assert, numRuns=1)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        // Step 1: Run all migrations (up)
        runAceCommand('migration:run')

        // Verify tables were actually created (sanity check)
        const tablesAfterRun = await getApplicationTables(client)
        assert.ok(
          tablesAfterRun.length > 0,
          'migration:run should have created at least one application table'
        )

        // Step 2: Rollback all migrations (down)
        runAceCommand('migration:rollback --batch=0')

        // Step 3: Assert no application tables remain
        const tablesAfterRollback = await getApplicationTables(client)
        assert.deepStrictEqual(
          tablesAfterRollback,
          [],
          `After rollback, no application tables should remain. Found: [${tablesAfterRollback.join(', ')}]`
        )
      }),
      { numRuns: 1 }
    )
  })
})
