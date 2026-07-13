/**
 * Smoke test for the scrypt hash driver configuration.
 *
 * Verifies that:
 * 1. The AdonisJS hash_provider is registered (which defaults to scrypt).
 * 2. No config/hash.ts overrides the default driver away from scrypt.
 * 3. Using the scrypt driver directly produces a PHC-formatted hash starting
 *    with `$scrypt$` that differs from the plaintext input.
 *
 * Validates: Requirements 4.1
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const backendRoot = resolve(__dirname, '../..')

describe('Smoke: scrypt hash driver', () => {
  it('hash_provider is registered in adonisrc.ts', () => {
    const adonisrcPath = resolve(backendRoot, 'adonisrc.ts')
    const content = readFileSync(adonisrcPath, 'utf-8')

    assert.ok(
      content.includes('@adonisjs/core/providers/hash_provider'),
      'adonisrc.ts should register the hash_provider from @adonisjs/core'
    )
  })

  it('no config/hash.ts overrides the default scrypt driver', () => {
    // AdonisJS 6 defaults to scrypt when no config/hash.ts is present.
    // If a config/hash.ts exists, it must explicitly set scrypt as the default driver.
    const hashConfigPath = resolve(backendRoot, 'config', 'hash.ts')

    if (existsSync(hashConfigPath)) {
      const content = readFileSync(hashConfigPath, 'utf-8')
      assert.ok(
        content.includes('scrypt'),
        'config/hash.ts exists but does not reference scrypt — the default driver may have been changed'
      )
    } else {
      // No config/hash.ts means the framework default (scrypt) is in effect
      assert.ok(true, 'No config/hash.ts found — framework defaults to scrypt')
    }
  })

  it('scrypt driver produces a $scrypt$ prefixed hash that differs from plaintext', async () => {
    // Import the Scrypt driver directly from @adonisjs/hash to verify output format
    const { Scrypt } = await import('@adonisjs/hash/drivers/scrypt')
    const scrypt = new Scrypt({})

    const plaintext = 'TestP@ssw0rd123'
    const hash = await scrypt.make(plaintext)

    // Hash must differ from plaintext
    assert.notStrictEqual(
      hash,
      plaintext,
      'The scrypt hash must differ from the plaintext password'
    )

    // Hash must be in PHC format starting with $scrypt$
    assert.ok(
      hash.startsWith('$scrypt$'),
      `Hash should start with "$scrypt$" (PHC format). Got: ${hash.slice(0, 20)}...`
    )

    // Hash must be recognized as valid by the driver
    assert.strictEqual(
      scrypt.isValidHash(hash),
      true,
      'The produced hash must be recognized as a valid scrypt hash'
    )

    // Verification must succeed for the same plaintext
    const verified = await scrypt.verify(hash, plaintext)
    assert.strictEqual(verified, true, 'Verifying the hash with the original plaintext must succeed')

    // Verification must fail for a different plaintext
    const wrongVerify = await scrypt.verify(hash, 'WrongPassword999')
    assert.strictEqual(wrongVerify, false, 'Verifying the hash with a wrong plaintext must fail')
  })
})
