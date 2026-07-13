/**
 * Feature: public-response-flow, Property 6.4
 * Lowest-priority-number rule wins.
 *
 * For any `multipla_escolha` selection where more than one selected option
 * carries a rule, `resolveMultipleRules` always returns the rule with the
 * numerically lowest `priority`.
 *
 * **Validates: Requirements 5.6**
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { resolveMultipleRules } from '../lib/navigation/engine.js'
import type { Option, Rule } from '../lib/navigation/types.js'

// --- Generators ---

/** Generate a valid Rule with a given priority */
function ruleArb(priority: number): fc.Arbitrary<Rule> {
  return fc.record({
    next_question_id: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 1000 })),
    finalizar: fc.boolean(),
    priority: fc.constant(priority),
  })
}

/** Generate an Option that carries at least one rule */
function optionWithRuleArb(id: number, priority: number): fc.Arbitrary<Option> {
  return ruleArb(priority).map((rule) => ({
    id,
    texto: `Option ${id}`,
    ordem: id,
    rules: [rule],
  }))
}

/** Generate an Option with no rules */
function optionWithoutRuleArb(id: number): fc.Arbitrary<Option> {
  return fc.constant({
    id,
    texto: `Option ${id}`,
    ordem: id,
    rules: [],
  })
}

describe('Property 6.4: Lowest-priority-number rule wins', () => {
  it('resolveMultipleRules returns the rule with the minimum priority among all applicable rules (200 runs)', () => {
    // Generate 2-6 options where at least 2 have rules with distinct priorities
    const scenarioArb = fc
      .integer({ min: 2, max: 6 })
      .chain((optionCount) => {
        // Generate distinct priorities for each option that will have a rule
        return fc
          .uniqueArray(fc.integer({ min: 0, max: 1000 }), {
            minLength: 2,
            maxLength: optionCount,
          })
          .chain((priorities) => {
            // Build options: first `priorities.length` options have rules, rest don't
            const optionArbs: fc.Arbitrary<Option>[] = []
            for (let i = 0; i < optionCount; i++) {
              const optId = i + 1
              if (i < priorities.length) {
                optionArbs.push(optionWithRuleArb(optId, priorities[i]))
              } else {
                optionArbs.push(optionWithoutRuleArb(optId))
              }
            }

            return fc.tuple(
              fc.tuple(...optionArbs),
              fc.constant(priorities)
            )
          })
      })
      .map(([optionsTuple, priorities]) => {
        const options = Array.from(optionsTuple) as Option[]
        // Select at least 2 options that have rules (IDs 1..priorities.length)
        const optionIdsWithRules = options
          .filter((o) => o.rules.length > 0)
          .map((o) => o.id)
        return { options, optionIdsWithRules, priorities }
      })

    fc.assert(
      fc.property(scenarioArb, ({ options, optionIdsWithRules, priorities }) => {
        // Select all options that have rules — ensuring multiple rules are in play
        const result = resolveMultipleRules(optionIdsWithRules, options)

        // The result must not be null since we selected options that have rules
        assert.notStrictEqual(result, null, 'Expected a non-null rule result')

        // The returned rule must have the minimum priority among all applicable rules
        const expectedMinPriority = Math.min(...priorities)
        assert.strictEqual(
          result!.priority,
          expectedMinPriority,
          `Expected priority ${expectedMinPriority} but got ${result!.priority}`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('resolveMultipleRules returns null when no selected option has a rule', () => {
    const optionsArb = fc
      .integer({ min: 1, max: 5 })
      .map((count) =>
        Array.from({ length: count }, (_, i) => ({
          id: i + 1,
          texto: `Option ${i + 1}`,
          ordem: i + 1,
          rules: [] as Rule[],
        }))
      )

    fc.assert(
      fc.property(optionsArb, (options) => {
        const selectedIds = options.map((o) => o.id)
        const result = resolveMultipleRules(selectedIds, options)
        assert.strictEqual(result, null, 'Expected null when no option has a rule')
      }),
      { numRuns: 100 }
    )
  })

  it('resolveMultipleRules picks lowest priority even when options are selected in any order', () => {
    // Generate a fixed set of options with known priorities and shuffle the selected IDs
    const scenarioArb = fc
      .uniqueArray(fc.integer({ min: 0, max: 500 }), { minLength: 2, maxLength: 5 })
      .chain((priorities) => {
        const options: Option[] = priorities.map((p, i) => ({
          id: i + 1,
          texto: `Option ${i + 1}`,
          ordem: i + 1,
          rules: [{ next_question_id: i + 10, finalizar: false, priority: p }],
        }))
        const selectedIds = options.map((o) => o.id)
        // Shuffle selected IDs
        return fc.shuffledSubarray(selectedIds, { minLength: selectedIds.length }).map(
          (shuffled) => ({ options, selectedIds: shuffled, priorities })
        )
      })

    fc.assert(
      fc.property(scenarioArb, ({ options, selectedIds, priorities }) => {
        const result = resolveMultipleRules(selectedIds, options)
        assert.notStrictEqual(result, null)
        const expectedMin = Math.min(...priorities)
        assert.strictEqual(result!.priority, expectedMin)
      }),
      { numRuns: 200 }
    )
  })
})
