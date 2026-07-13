/**
 * Smoke test for secrets sourcing (Req 11.3).
 *
 * Verifies at the code/config level that:
 * 1. The `.env` file is in `.gitignore` (not committed)
 * 2. Environment variables for secrets (DB_PASSWORD, APP_KEY, SQS_MAIL_QUEUE_URL)
 *    are referenced from process.env or env config — not hardcoded
 * 3. The `mail_queue.ts` reads `SQS_MAIL_QUEUE_URL` from process.env
 * 4. No committed source file contains actual secret values
 *
 * Validates: Requirements 11.3
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'

const BACKEND_ROOT = resolve(import.meta.dirname, '..', '..')
const PROJECT_ROOT = resolve(BACKEND_ROOT, '..')

// ─── Helper: read file as string ───

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

// ─── Helper: recursively collect source files (*.ts) ───

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip node_modules, build, tmp, .git, coverage, tests
      if (['node_modules', 'build', 'tmp', '.git', 'coverage'].includes(entry.name)) continue
      collectSourceFiles(fullPath, acc)
    } else if (entry.isFile() && extname(entry.name) === '.ts') {
      acc.push(fullPath)
    }
  }
  return acc
}

// ─── 1. .env is in .gitignore ───

describe('Secrets sourcing: .env is gitignored', () => {
  it('.env is listed in backend/.gitignore', () => {
    const gitignore = readText(join(BACKEND_ROOT, '.gitignore'))
    const lines = gitignore.split(/\r?\n/).map((l) => l.trim())
    assert.ok(
      lines.includes('.env'),
      'backend/.gitignore should contain a line with exactly ".env"'
    )
  })

  it('.env is listed in project root .gitignore', () => {
    const gitignore = readText(join(PROJECT_ROOT, '.gitignore'))
    const lines = gitignore.split(/\r?\n/).map((l) => l.trim())
    assert.ok(
      lines.includes('.env'),
      'Root .gitignore should contain a line with exactly ".env"'
    )
  })
})

// ─── 2. Secrets are referenced from process.env or env config, not hardcoded ───

describe('Secrets sourcing: config reads secrets from environment', () => {
  it('config/app.ts sources APP_KEY from env', () => {
    const content = readText(join(BACKEND_ROOT, 'config', 'app.ts'))
    assert.ok(
      content.includes("env.get('APP_KEY')") || content.includes('env.get("APP_KEY")'),
      'config/app.ts should read APP_KEY from env.get()'
    )
    // Ensure no hardcoded key value (a real key is 32+ chars of base64/hex)
    assert.ok(
      !content.match(/appKey:\s*['"][A-Za-z0-9+/=]{16,}['"]/),
      'config/app.ts should NOT contain a hardcoded APP_KEY value'
    )
  })

  it('config/database.ts sources DB_PASSWORD from env', () => {
    const content = readText(join(BACKEND_ROOT, 'config', 'database.ts'))
    assert.ok(
      content.includes("env.get('DB_PASSWORD'") || content.includes('env.get("DB_PASSWORD"'),
      'config/database.ts should read DB_PASSWORD from env.get()'
    )
    // Ensure no hardcoded password (anything longer than empty-string default)
    assert.ok(
      !content.match(/password:\s*['"][^'"]{4,}['"]/),
      'config/database.ts should NOT contain a hardcoded DB_PASSWORD value'
    )
  })

  it('start/env.ts declares APP_KEY as a required env schema string', () => {
    const content = readText(join(BACKEND_ROOT, 'start', 'env.ts'))
    assert.ok(
      content.includes('APP_KEY') && content.includes('Env.schema.string'),
      'start/env.ts should validate APP_KEY as a required string via Env.schema'
    )
  })

  it('start/env.ts declares DB_PASSWORD in env schema', () => {
    const content = readText(join(BACKEND_ROOT, 'start', 'env.ts'))
    assert.ok(
      content.includes('DB_PASSWORD'),
      'start/env.ts should declare DB_PASSWORD in the env schema'
    )
  })
})

// ─── 3. mail_queue.ts reads SQS_MAIL_QUEUE_URL from process.env ───

describe('Secrets sourcing: mail_queue reads SQS URL from environment', () => {
  it('mail_queue.ts references process.env.SQS_MAIL_QUEUE_URL', () => {
    const content = readText(join(BACKEND_ROOT, 'app', 'services', 'mail_queue.ts'))
    assert.ok(
      content.includes('process.env.SQS_MAIL_QUEUE_URL'),
      'mail_queue.ts should read SQS_MAIL_QUEUE_URL from process.env'
    )
  })

  it('mail_queue.ts does NOT hardcode an SQS queue URL', () => {
    const content = readText(join(BACKEND_ROOT, 'app', 'services', 'mail_queue.ts'))
    // Real SQS URLs look like https://sqs.<region>.amazonaws.com/<account>/<name>
    assert.ok(
      !content.match(/https:\/\/sqs\.[a-z0-9-]+\.amazonaws\.com/),
      'mail_queue.ts should NOT contain a hardcoded SQS URL'
    )
  })

  it('mail_queue.ts reads AWS_REGION from process.env', () => {
    const content = readText(join(BACKEND_ROOT, 'app', 'services', 'mail_queue.ts'))
    assert.ok(
      content.includes('process.env.AWS_REGION'),
      'mail_queue.ts should read AWS_REGION from process.env'
    )
  })
})

// ─── 4. No committed source file contains actual secret values ───

describe('Secrets sourcing: no committed source files contain secret patterns', () => {
  const sourceFiles = collectSourceFiles(join(BACKEND_ROOT, 'app'))
    .concat(collectSourceFiles(join(BACKEND_ROOT, 'config')))
    .concat(collectSourceFiles(join(BACKEND_ROOT, 'start')))

  // Patterns that would indicate committed secrets
  const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
    {
      name: 'hardcoded SQS URL',
      regex: /https:\/\/sqs\.[a-z0-9-]+\.amazonaws\.com\/\d+\//,
    },
    {
      name: 'hardcoded AWS access key',
      regex: /AKIA[0-9A-Z]{16}/,
    },
    {
      name: 'hardcoded AWS secret key (40-char base64)',
      regex: /['"][A-Za-z0-9/+=]{40}['"]/,
    },
    {
      name: 'hardcoded database connection string with password',
      regex: /postgres(ql)?:\/\/[^:]+:[^@]{4,}@/,
    },
  ]

  it('no source files in app/, config/, or start/ contain known secret patterns', () => {
    const violations: string[] = []

    for (const filePath of sourceFiles) {
      const content = readText(filePath)
      for (const { name, regex } of SECRET_PATTERNS) {
        if (regex.test(content)) {
          const relative = filePath.replace(BACKEND_ROOT, '')
          violations.push(`${relative}: matches "${name}"`)
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `No committed source files should contain secret values.\nViolations:\n${violations.join('\n')}`
    )
  })

  it('.env.example contains only placeholder/empty values for secrets', () => {
    const content = readText(join(BACKEND_ROOT, '.env.example'))
    const lines = content.split(/\r?\n/)

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const [key, ...rest] = trimmed.split('=')
      const value = rest.join('=').trim()

      // Secret-related keys should have empty or obviously-placeholder values
      if (key === 'APP_KEY' || key === 'DB_PASSWORD') {
        assert.ok(
          value === '' || value.startsWith('<') || value === 'changeme',
          `.env.example "${key}" should be empty or a placeholder, got: "${value}"`
        )
      }
    }
  })
})
