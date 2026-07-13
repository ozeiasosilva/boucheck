import { describe, it } from 'node:test'
import assert from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Smoke tests for repository structure and build configuration.
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 14.1, 14.2, 14.3, 15.4
 */

const ROOT = resolve(import.meta.dirname, '..', '..', '..')

describe('Repository structure', () => {
  it('backend/, frontend/, infra/ directories exist', () => {
    assert.ok(existsSync(resolve(ROOT, 'backend')), 'backend/ should exist')
    assert.ok(existsSync(resolve(ROOT, 'frontend')), 'frontend/ should exist')
    assert.ok(existsSync(resolve(ROOT, 'infra')), 'infra/ should exist')
  })
})

describe('TypeScript strict mode', () => {
  it('backend tsconfig.json has strict: true', () => {
    const tsconfig = JSON.parse(
      readFileSync(resolve(ROOT, 'backend', 'tsconfig.json'), 'utf-8')
    )
    assert.strictEqual(tsconfig.compilerOptions.strict, true)
  })

  it('frontend tsconfig.json has strict: true', () => {
    const tsconfig = JSON.parse(
      readFileSync(resolve(ROOT, 'frontend', 'tsconfig.json'), 'utf-8')
    )
    assert.strictEqual(tsconfig.compilerOptions.strict, true)
  })
})

describe('ESLint configuration', () => {
  const eslintPatterns = ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json']

  for (const project of ['backend', 'frontend', 'infra']) {
    it(`${project}/ has an ESLint config file`, () => {
      const hasEslint = eslintPatterns.some((pattern) =>
        existsSync(resolve(ROOT, project, pattern))
      )
      assert.ok(hasEslint, `${project}/ should have an ESLint config file`)
    })
  }
})

describe('Prettier configuration', () => {
  for (const project of ['backend', 'frontend', 'infra']) {
    it(`${project}/ has a .prettierrc file`, () => {
      assert.ok(
        existsSync(resolve(ROOT, project, '.prettierrc')),
        `${project}/.prettierrc should exist`
      )
    })
  }
})

describe('Lint and format scripts', () => {
  for (const project of ['backend', 'frontend', 'infra']) {
    it(`${project}/package.json has lint and format:check scripts`, () => {
      const pkg = JSON.parse(
        readFileSync(resolve(ROOT, project, 'package.json'), 'utf-8')
      )
      assert.ok(pkg.scripts?.lint, `${project} should have a "lint" script`)
      assert.ok(pkg.scripts?.['format:check'], `${project} should have a "format:check" script`)
    })
  }
})

describe('README documentation', () => {
  it('README.md exists at repository root', () => {
    assert.ok(existsSync(resolve(ROOT, 'README.md')), 'README.md should exist')
  })

  it('README.md documents deploy convention (cdk deploy)', () => {
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf-8')
    assert.ok(readme.includes('cdk deploy'), 'README should mention "cdk deploy"')
  })

  it('README.md documents environment variables (DB_HOST)', () => {
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf-8')
    assert.ok(readme.includes('DB_HOST'), 'README should mention "DB_HOST"')
  })

  it('README.md documents migration convention', () => {
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf-8')
    assert.ok(
      readme.toLowerCase().includes('migration'),
      'README should mention "migration"'
    )
  })

  it('README.md documents timestamp naming convention', () => {
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf-8')
    assert.ok(readme.includes('timestamp'), 'README should mention "timestamp"')
  })
})

describe('Security: .env handling', () => {
  it('.gitignore contains .env', () => {
    const gitignore = readFileSync(resolve(ROOT, '.gitignore'), 'utf-8')
    const lines = gitignore.split('\n').map((l) => l.trim())
    assert.ok(lines.includes('.env'), '.gitignore should contain ".env"')
  })

  it('no .env file exists at root (only .env.example allowed)', () => {
    assert.ok(
      !existsSync(resolve(ROOT, '.env')),
      '.env should NOT exist at root (secrets must not be committed)'
    )
  })

  it('no .env file exists in backend/ (only .env.example allowed)', () => {
    assert.ok(
      !existsSync(resolve(ROOT, 'backend', '.env')),
      'backend/.env should NOT exist (secrets must not be committed)'
    )
  })

  it('no .env file exists in frontend/ (only .env.example allowed)', () => {
    assert.ok(
      !existsSync(resolve(ROOT, 'frontend', '.env')),
      'frontend/.env should NOT exist (secrets must not be committed)'
    )
  })

  it('no .env file exists in infra/ (only .env.example allowed)', () => {
    assert.ok(
      !existsSync(resolve(ROOT, 'infra', '.env')),
      'infra/.env should NOT exist (secrets must not be committed)'
    )
  })
})
