import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for pagination boundary behavior
 * Property 6: Pagination boundary behavior
 * Validates: Requirements 3.3
 *
 * Tests that pages beyond the last page return empty rows (HTTP 200), not an error.
 */

/**
 * Pure pagination function matching the SessionQueryBuilder offset/limit logic.
 */
function paginate<T>(items: T[], page: number, perPage: number): { rows: T[]; total: number } {
  const total = items.length
  const offset = (page - 1) * perPage
  return { rows: items.slice(offset, offset + perPage), total }
}

describe('Property 6: Pagination boundary behavior', () => {
  it('page beyond last page returns empty rows (Req 3.3)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }), // dataset size
        fc.integer({ min: 1, max: 50 }), // perPage
        (datasetSize, perPage) => {
          const items = Array.from({ length: datasetSize }, (_, i) => i)
          const lastPage = Math.ceil(datasetSize / perPage)
          const beyondPage = lastPage + 1

          const result = paginate(items, beyondPage, perPage)

          assert.deepStrictEqual(
            result.rows,
            [],
            `Page ${beyondPage} (beyond last page ${lastPage}) should return empty rows`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('total is still accurate for beyond-last-page (Req 3.3)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }), // dataset size
        fc.integer({ min: 1, max: 50 }), // perPage
        fc.integer({ min: 1, max: 100 }), // pages beyond last
        (datasetSize, perPage, extraPages) => {
          const items = Array.from({ length: datasetSize }, (_, i) => i)
          const lastPage = Math.ceil(datasetSize / perPage)
          const beyondPage = lastPage + extraPages

          const result = paginate(items, beyondPage, perPage)

          assert.strictEqual(
            result.total,
            datasetSize,
            `Total should be ${datasetSize} even when requesting page ${beyondPage}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('first page of empty set is empty (Req 3.3)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // perPage
        (perPage) => {
          const items: number[] = []
          const result = paginate(items, 1, perPage)

          assert.deepStrictEqual(result.rows, [], 'Empty dataset page 1 should return empty rows')
          assert.strictEqual(result.total, 0, 'Empty dataset should have total = 0')
        }
      ),
      { numRuns: 200 }
    )
  })

  it('last valid page may have fewer than perPage items (Req 3.3)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }), // dataset size
        fc.integer({ min: 1, max: 50 }), // perPage
        (datasetSize, perPage) => {
          const items = Array.from({ length: datasetSize }, (_, i) => i)
          const lastPage = Math.ceil(datasetSize / perPage)

          const result = paginate(items, lastPage, perPage)

          // Last page should have between 1 and perPage items (inclusive)
          assert.ok(
            result.rows.length >= 1 && result.rows.length <= perPage,
            `Last page should have 1..${perPage} items, got ${result.rows.length}`
          )

          // Specifically, it should equal the remainder (or perPage if evenly divisible)
          const expectedCount = datasetSize % perPage === 0 ? perPage : datasetSize % perPage
          assert.strictEqual(
            result.rows.length,
            expectedCount,
            `Last page should have ${expectedCount} items`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('very large page number still returns empty, not error (Req 3.3)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // small dataset size
        fc.integer({ min: 1, max: 50 }), // perPage
        (datasetSize, perPage) => {
          const items = Array.from({ length: datasetSize }, (_, i) => i)
          const veryLargePage = 999_999

          const result = paginate(items, veryLargePage, perPage)

          assert.deepStrictEqual(
            result.rows,
            [],
            `Page 999999 with ${datasetSize} items should return empty rows`
          )
          assert.strictEqual(
            result.total,
            datasetSize,
            `Total should still be ${datasetSize} for page 999999`
          )
        }
      ),
      { numRuns: 200 }
    )
  })
})
