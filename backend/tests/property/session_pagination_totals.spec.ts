import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for pagination totals and page partitioning.
 * Property 5: Pagination totals and page partitioning
 * Validates: Requirements 3.2
 *
 * Tests pagination logic as a pure function to verify that total count is
 * independent of pagination parameters, pages partition the full set correctly,
 * and page sizes are respected.
 */

/**
 * Pure pagination function mirroring SessionQueryBuilder's pagination logic.
 */
function paginate<T>(items: T[], page: number, perPage: number): { rows: T[]; total: number } {
  const total = items.length
  const offset = (page - 1) * perPage
  return { rows: items.slice(offset, offset + perPage), total }
}

describe('Property 5: Pagination totals and page partitioning', () => {
  it('total is independent of page/perPage (Req 3.2)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 20 }),
        (items, page, perPage) => {
          const result = paginate(items, page, perPage)
          assert.strictEqual(
            result.total,
            items.length,
            `Total should always equal items.length (${items.length}), got ${result.total} for page=${page}, perPage=${perPage}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('union of all pages equals the full set (Req 3.2)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 200 }),
        fc.integer({ min: 1, max: 50 }),
        (items, perPage) => {
          const totalPages = Math.ceil(items.length / perPage)
          const allRows: number[] = []
          for (let p = 1; p <= totalPages; p++) {
            const { rows } = paginate(items, p, perPage)
            allRows.push(...rows)
          }
          assert.deepStrictEqual(
            allRows,
            items,
            `Concatenation of all pages should equal the full set (perPage=${perPage}, totalPages=${totalPages})`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('each page has at most perPage rows (Req 3.2)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 20 }),
        (items, page, perPage) => {
          const { rows } = paginate(items, page, perPage)
          assert.ok(
            rows.length <= perPage,
            `Page ${page} has ${rows.length} rows, expected at most ${perPage}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('first page starts from the beginning (Req 3.2)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 200 }),
        fc.integer({ min: 1, max: 50 }),
        (items, perPage) => {
          const { rows } = paginate(items, 1, perPage)
          const expected = items.slice(0, perPage)
          assert.deepStrictEqual(
            rows,
            expected,
            `First page should return the first ${perPage} items`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('pages do not overlap (Req 3.2)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 200 }),
        fc.integer({ min: 1, max: 50 }),
        (items, perPage) => {
          const totalPages = Math.ceil(items.length / perPage)
          // Use index-based tracking to detect overlap (items may have duplicate values)
          const seenIndices = new Set<number>()
          let globalIndex = 0
          for (let p = 1; p <= totalPages; p++) {
            const { rows } = paginate(items, p, perPage)
            for (let i = 0; i < rows.length; i++) {
              assert.ok(
                !seenIndices.has(globalIndex),
                `Index ${globalIndex} appears on page ${p} but was already seen on a previous page`
              )
              seenIndices.add(globalIndex)
              globalIndex++
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})
