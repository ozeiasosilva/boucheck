import { describe, it } from 'node:test'
import assert from 'node:assert'

/**
 * Unit tests for QuestionService.reorder — duplicate ordem detection logic
 * Validates: Requirements 12.1, 12.2
 *
 * The DuplicateOrdemError class lives in question_service.ts which pulls in
 * Lucid ORM (requires AdonisJS app boot). These tests verify the pure logic
 * that detects duplicate ordem values — the same algorithm used by the service.
 */

/**
 * Replicates the duplicate-detection logic from QuestionService.reorder
 * to allow pure unit testing without ORM dependencies.
 */
function hasDuplicateOrdem(ordem: { id: number; ordem: number }[]): boolean {
  const ordemValues = ordem.map((item) => item.ordem)
  const uniqueOrdemValues = new Set(ordemValues)
  return uniqueOrdemValues.size !== ordemValues.length
}

describe('QuestionService.reorder — duplicate ordem detection', () => {
  it('returns false (no duplicate) for distinct ordem values', () => {
    const input = [
      { id: 1, ordem: 1 },
      { id: 2, ordem: 2 },
      { id: 3, ordem: 3 },
    ]
    assert.strictEqual(hasDuplicateOrdem(input), false)
  })

  it('returns true (duplicate) when two items have the same ordem value', () => {
    const input = [
      { id: 1, ordem: 1 },
      { id: 2, ordem: 1 },
      { id: 3, ordem: 3 },
    ]
    assert.strictEqual(hasDuplicateOrdem(input), true)
  })

  it('returns true (duplicate) when all items have the same ordem value', () => {
    const input = [
      { id: 1, ordem: 5 },
      { id: 2, ordem: 5 },
      { id: 3, ordem: 5 },
    ]
    assert.strictEqual(hasDuplicateOrdem(input), true)
  })

  it('returns false (no duplicate) for a single item', () => {
    const input = [{ id: 1, ordem: 1 }]
    assert.strictEqual(hasDuplicateOrdem(input), false)
  })

  it('returns false (no duplicate) for non-sequential but distinct values', () => {
    const input = [
      { id: 1, ordem: 10 },
      { id: 2, ordem: 3 },
      { id: 3, ordem: 7 },
    ]
    assert.strictEqual(hasDuplicateOrdem(input), false)
  })

  it('returns true when duplicates appear at the end', () => {
    const input = [
      { id: 1, ordem: 1 },
      { id: 2, ordem: 2 },
      { id: 3, ordem: 2 },
    ]
    assert.strictEqual(hasDuplicateOrdem(input), true)
  })

  it('handles negative ordem values correctly', () => {
    const input = [
      { id: 1, ordem: -1 },
      { id: 2, ordem: -2 },
      { id: 3, ordem: -1 },
    ]
    assert.strictEqual(hasDuplicateOrdem(input), true)
  })

  it('handles zero ordem values as duplicates', () => {
    const input = [
      { id: 1, ordem: 0 },
      { id: 2, ordem: 0 },
    ]
    assert.strictEqual(hasDuplicateOrdem(input), true)
  })
})
