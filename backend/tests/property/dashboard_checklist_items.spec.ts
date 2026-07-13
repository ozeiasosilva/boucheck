import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for Dashboard top checklist items ordering.
 * Property 23: Top checklist items ordering
 * Validates: Requirements 16.1
 *
 * Tests the pure computation logic: for each grupo, items are ordered by
 * selection count descending with a stable id tie-break (ascending).
 */

interface ChecklistItemInput {
  id: number
  nome: string
  grupo: string
  count: number
}

interface ChecklistItemOutput {
  checklistItemId: number
  nome: string
  count: number
}

/**
 * Pure function that mirrors the top checklist items logic in DashboardService.
 * Groups items by grupo, then within each group sorts by count descending
 * with tie-break on id ascending.
 */
function computeTopChecklistItems(
  items: Array<{ id: number; nome: string; grupo: string; count: number }>
): Record<string, Array<{ checklistItemId: number; nome: string; count: number }>> {
  const grouped: Record<string, Array<{ checklistItemId: number; nome: string; count: number }>> = {}

  for (const item of items) {
    if (!grouped[item.grupo]) {
      grouped[item.grupo] = []
    }
    grouped[item.grupo].push({
      checklistItemId: item.id,
      nome: item.nome,
      count: item.count,
    })
  }

  // Sort each group by count descending, tie-break by id ascending
  for (const grupo of Object.keys(grouped)) {
    grouped[grupo].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.checklistItemId - b.checklistItemId
    })
  }

  return grouped
}

// --- Generators ---

const grupoArb = fc.constantFrom('financeiro', 'operacional', 'estrategico', 'pessoas', 'marketing')

function checklistItemArb(): fc.Arbitrary<ChecklistItemInput> {
  return fc.record({
    id: fc.integer({ min: 1, max: 1000 }),
    nome: fc.string({ minLength: 1, maxLength: 30 }),
    grupo: grupoArb,
    count: fc.integer({ min: 0, max: 500 }),
  })
}

describe('Property 23: Top checklist items ordering', () => {
  it('items within each group are ordered by count descending (Req 16.1)', () => {
    /**
     * **Validates: Requirements 16.1**
     */
    fc.assert(
      fc.property(
        fc.array(checklistItemArb(), { minLength: 1, maxLength: 50 }),
        (items) => {
          const result = computeTopChecklistItems(items)

          for (const grupo of Object.keys(result)) {
            const groupItems = result[grupo]
            for (let i = 0; i < groupItems.length - 1; i++) {
              assert.ok(
                groupItems[i].count >= groupItems[i + 1].count,
                `In group '${grupo}', item at index ${i} (count=${groupItems[i].count}) should have count >= item at index ${i + 1} (count=${groupItems[i + 1].count})`
              )
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('tie-break by id ascending when counts are equal', () => {
    /**
     * **Validates: Requirements 16.1**
     */
    fc.assert(
      fc.property(
        // Generate items with unique ids to make tie-break deterministic
        fc.uniqueArray(checklistItemArb(), {
          minLength: 2,
          maxLength: 50,
          selector: (item) => item.id,
        }),
        (items) => {
          const result = computeTopChecklistItems(items)

          for (const grupo of Object.keys(result)) {
            const groupItems = result[grupo]
            for (let i = 0; i < groupItems.length - 1; i++) {
              if (groupItems[i].count === groupItems[i + 1].count) {
                assert.ok(
                  groupItems[i].checklistItemId < groupItems[i + 1].checklistItemId,
                  `In group '${grupo}', when counts are equal (${groupItems[i].count}), item at index ${i} (id=${groupItems[i].checklistItemId}) should have id < item at index ${i + 1} (id=${groupItems[i + 1].checklistItemId})`
                )
              }
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('all items appear in their correct group', () => {
    /**
     * **Validates: Requirements 16.1**
     */
    fc.assert(
      fc.property(
        // Use unique IDs since checklist_items.id is a primary key in the database
        fc.uniqueArray(checklistItemArb(), {
          minLength: 1,
          maxLength: 50,
          selector: (item) => item.id,
        }),
        (items) => {
          const result = computeTopChecklistItems(items)

          // For each input item, verify it appears only in its grupo key
          for (const item of items) {
            // The item's grupo should exist as a key
            assert.ok(
              result[item.grupo] !== undefined,
              `Group '${item.grupo}' should exist in result`
            )

            // The item should appear in its own grupo
            const inOwnGroup = result[item.grupo].some(
              (r) => r.checklistItemId === item.id
            )
            assert.ok(
              inOwnGroup,
              `Item id=${item.id} with grupo='${item.grupo}' should appear in group '${item.grupo}'`
            )

            // The item should NOT appear in any other grupo
            for (const otherGrupo of Object.keys(result)) {
              if (otherGrupo === item.grupo) continue
              const inOtherGroup = result[otherGrupo].some(
                (r) => r.checklistItemId === item.id
              )
              assert.ok(
                !inOtherGroup,
                `Item id=${item.id} with grupo='${item.grupo}' should NOT appear in group '${otherGrupo}'`
              )
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('no items are lost: sum of items across all groups equals total input count', () => {
    /**
     * **Validates: Requirements 16.1**
     */
    fc.assert(
      fc.property(
        fc.array(checklistItemArb(), { minLength: 0, maxLength: 50 }),
        (items) => {
          const result = computeTopChecklistItems(items)

          // Total items across all groups
          let totalOutputItems = 0
          for (const grupo of Object.keys(result)) {
            totalOutputItems += result[grupo].length
          }

          assert.strictEqual(
            totalOutputItems,
            items.length,
            `Total items in output (${totalOutputItems}) should equal input count (${items.length})`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('counts are non-negative', () => {
    /**
     * **Validates: Requirements 16.1**
     */
    fc.assert(
      fc.property(
        fc.array(checklistItemArb(), { minLength: 1, maxLength: 50 }),
        (items) => {
          const result = computeTopChecklistItems(items)

          for (const grupo of Object.keys(result)) {
            for (const item of result[grupo]) {
              assert.ok(
                item.count >= 0,
                `Item id=${item.checklistItemId} in group '${grupo}' has negative count: ${item.count}`
              )
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})
