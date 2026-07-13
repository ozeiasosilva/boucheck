import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { determineNext } from '../lib/navigation/engine.js'
import type { Question, Option, Rule, Answer } from '../lib/navigation/types.js'

/**
 * Property-based tests for determineNext
 * Property: Deterministic next-question resolution
 *
 * For any question/answer/rule-graph combination:
 * 1. `determineNext` returns `null` when the applicable rule has `finalizar: true`
 * 2. Returns `rule.next_question_id` when a rule with a non-null `next_question_id` applies
 * 3. Otherwise returns the next question by ascending `ordem`, or `null` if last
 *
 * **Validates: Requirements 5.3, 5.4, 5.5**
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const tipoArb = fc.constantFrom<'escolha_unica' | 'multipla_escolha' | 'aberta'>(
  'escolha_unica',
  'multipla_escolha',
  'aberta'
)

/** Generate a rule that finalizes (finalizar: true) */
function finalizarRuleArb(): fc.Arbitrary<Rule> {
  return fc.record({
    next_question_id: fc.constant(null),
    finalizar: fc.constant(true),
    priority: fc.integer({ min: 0, max: 10 }),
  })
}

/** Generate a rule that jumps to a specific question */
function jumpRuleArb(targetIds: number[]): fc.Arbitrary<Rule> {
  return fc.record({
    next_question_id: fc.constantFrom(...targetIds),
    finalizar: fc.constant(false),
    priority: fc.integer({ min: 0, max: 10 }),
  })
}

/** Generate a sequential rule (no jump, no finalizar) */
function sequentialRuleArb(): fc.Arbitrary<Rule> {
  return fc.record({
    next_question_id: fc.constant(null),
    finalizar: fc.constant(false),
    priority: fc.integer({ min: 0, max: 10 }),
  })
}

/**
 * Generate a sorted list of questions (by ordem) with configurable options/rules.
 */
function questionsArb(opts?: { min?: number; max?: number }): fc.Arbitrary<Question[]> {
  const min = opts?.min ?? 2
  const max = opts?.max ?? 8

  return fc.integer({ min, max }).chain((numQuestions) => {
    return fc
      .array(
        fc.record({
          tipo: tipoArb,
          obrigatoria: fc.boolean(),
          numOptions: fc.integer({ min: 1, max: 4 }),
        }),
        { minLength: numQuestions, maxLength: numQuestions }
      )
      .map((configs) => {
        let optionIdCounter = 100
        return configs.map((cfg, idx) => {
          const questionId = idx + 1
          const options: Option[] = Array.from({ length: cfg.numOptions }, (_, optIdx) => ({
            id: optionIdCounter++,
            texto: `Opção ${optIdx + 1}`,
            ordem: optIdx + 1,
            rules: [], // rules will be set by specific test scenarios
          }))

          return {
            id: questionId,
            texto: `Pergunta ${questionId}`,
            descricao: null,
            tipo: cfg.tipo,
            obrigatoria: cfg.obrigatoria,
            ordem: idx + 1,
            options,
          } satisfies Question
        })
      })
  })
}

// ---------------------------------------------------------------------------
// Property 1: finalizar=true → returns null
// ---------------------------------------------------------------------------

describe('Property: determineNext returns null when applicable rule has finalizar=true (Req 5.5)', () => {
  it('always returns null when the selected option has a finalizar rule', () => {
    fc.assert(
      fc.property(
        questionsArb({ min: 2, max: 6 }).chain((questions) =>
          fc.record({
            questions: fc.constant(questions),
            questionIdx: fc.integer({ min: 0, max: questions.length - 1 }),
            priority: fc.integer({ min: 0, max: 10 }),
          })
        ),
        ({ questions, questionIdx, priority }) => {
          const currentQuestion = questions[questionIdx]

          // Attach a finalizar rule to the first option
          const targetOption = currentQuestion.options[0]
          targetOption.rules = [
            { next_question_id: null, finalizar: true, priority },
          ]

          // Create an answer selecting that option
          const answer: Answer = {
            questionId: currentQuestion.id,
            selectedOptionIds: [targetOption.id],
            textoLivre: null,
          }

          const result = determineNext(currentQuestion, answer, questions)
          assert.strictEqual(
            result,
            null,
            `Expected null when finalizar=true, got ${result}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('returns null even when finalizar rule competes with jump rules via priority (lowest priority wins)', () => {
    fc.assert(
      fc.property(
        questionsArb({ min: 3, max: 6 }).chain((questions) => {
          // Pick a question that is not the last (so jump targets exist)
          const maxIdx = questions.length - 2
          if (maxIdx < 0) return fc.constant(null)
          return fc.integer({ min: 0, max: maxIdx }).map((qIdx) => ({ questions, qIdx }))
        }),
        (data) => {
          if (!data) return // skip degenerate case

          const { questions, qIdx } = data
          const currentQuestion = questions[qIdx]
          const forwardIds = questions.slice(qIdx + 1).map((q) => q.id)

          // multipla_escolha so we can select multiple options with different rules
          currentQuestion.tipo = 'multipla_escolha'

          // First option: finalizar with priority 0 (highest precedence)
          currentQuestion.options[0].rules = [
            { next_question_id: null, finalizar: true, priority: 0 },
          ]

          // Second option (if exists): jump rule with lower priority (higher number)
          if (currentQuestion.options.length > 1) {
            currentQuestion.options[1].rules = [
              { next_question_id: forwardIds[0], finalizar: false, priority: 5 },
            ]
          }

          // Select both options — finalizar rule wins because priority 0 < 5
          const selectedIds = currentQuestion.options.slice(0, 2).map((o) => o.id)
          const answer: Answer = {
            questionId: currentQuestion.id,
            selectedOptionIds: selectedIds,
            textoLivre: null,
          }

          const result = determineNext(currentQuestion, answer, questions)
          assert.strictEqual(
            result,
            null,
            `Expected null when finalizar rule has lowest priority number`
          )
        }
      ),
      { numRuns: 150 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 2: non-null next_question_id → returns that ID
// ---------------------------------------------------------------------------

describe('Property: determineNext returns rule.next_question_id when applicable rule has a non-null target (Req 5.3)', () => {
  it('returns the jump target from the applicable rule', () => {
    fc.assert(
      fc.property(
        questionsArb({ min: 3, max: 8 }).chain((questions) => {
          // Pick a question that is not the last, so there's at least one forward target
          const maxIdx = questions.length - 2
          if (maxIdx < 0) return fc.constant(null)
          return fc
            .record({
              qIdx: fc.integer({ min: 0, max: maxIdx }),
              priority: fc.integer({ min: 0, max: 10 }),
            })
            .map(({ qIdx, priority }) => {
              const forwardIds = questions.slice(qIdx + 1).map((q) => q.id)
              return { questions, qIdx, forwardIds, priority }
            })
        }),
        (data) => {
          if (!data) return

          const { questions, qIdx, forwardIds, priority } = data

          // Pick a random forward target
          const targetId = forwardIds[Math.floor(Math.random() * forwardIds.length)]
          const currentQuestion = questions[qIdx]
          const targetOption = currentQuestion.options[0]

          // Attach a jump rule
          targetOption.rules = [
            { next_question_id: targetId, finalizar: false, priority },
          ]

          const answer: Answer = {
            questionId: currentQuestion.id,
            selectedOptionIds: [targetOption.id],
            textoLivre: null,
          }

          const result = determineNext(currentQuestion, answer, questions)
          assert.strictEqual(
            result,
            targetId,
            `Expected jump to ${targetId}, got ${result}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('returns the target of the highest-precedence (lowest priority number) rule in multipla_escolha', () => {
    fc.assert(
      fc.property(
        questionsArb({ min: 4, max: 8 }).chain((questions) => {
          const maxIdx = questions.length - 3
          if (maxIdx < 0) return fc.constant(null)
          return fc
            .record({
              qIdx: fc.integer({ min: 0, max: maxIdx }),
              lowPriority: fc.integer({ min: 0, max: 4 }),
              highPriority: fc.integer({ min: 5, max: 10 }),
            })
            .map(({ qIdx, lowPriority, highPriority }) => ({
              questions,
              qIdx,
              lowPriority,
              highPriority,
            }))
        }),
        (data) => {
          if (!data) return

          const { questions, qIdx, lowPriority, highPriority } = data
          const currentQuestion = questions[qIdx]
          currentQuestion.tipo = 'multipla_escolha'

          const forwardIds = questions.slice(qIdx + 1).map((q) => q.id)
          if (forwardIds.length < 2 || currentQuestion.options.length < 2) return

          const winnerTarget = forwardIds[0]
          const loserTarget = forwardIds[1]

          // Option 0: rule with lower priority number (wins)
          currentQuestion.options[0].rules = [
            { next_question_id: winnerTarget, finalizar: false, priority: lowPriority },
          ]
          // Option 1: rule with higher priority number (loses)
          currentQuestion.options[1].rules = [
            { next_question_id: loserTarget, finalizar: false, priority: highPriority },
          ]

          const answer: Answer = {
            questionId: currentQuestion.id,
            selectedOptionIds: [currentQuestion.options[0].id, currentQuestion.options[1].id],
            textoLivre: null,
          }

          const result = determineNext(currentQuestion, answer, questions)
          assert.strictEqual(
            result,
            winnerTarget,
            `Expected winner target ${winnerTarget} (priority ${lowPriority}), got ${result}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 3: no applicable rule → next by ascending ordem, or null if last
// ---------------------------------------------------------------------------

describe('Property: determineNext returns next question by ascending ordem when no rule applies (Req 5.4)', () => {
  it('returns the next question by ordem when selected option has no rules', () => {
    fc.assert(
      fc.property(
        questionsArb({ min: 2, max: 8 }).chain((questions) => {
          // Pick a question that is not the last
          const maxIdx = questions.length - 2
          return fc.integer({ min: 0, max: maxIdx }).map((qIdx) => ({ questions, qIdx }))
        }),
        ({ questions, qIdx }) => {
          const currentQuestion = questions[qIdx]

          // Ensure selected option has no rules
          currentQuestion.options.forEach((opt) => {
            opt.rules = []
          })

          const answer: Answer = {
            questionId: currentQuestion.id,
            selectedOptionIds: [currentQuestion.options[0].id],
            textoLivre: null,
          }

          const result = determineNext(currentQuestion, answer, questions)
          const expectedNext = questions[qIdx + 1].id

          assert.strictEqual(
            result,
            expectedNext,
            `Expected next question ${expectedNext} (by ordem), got ${result}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('returns null when current question is the last and no rule applies', () => {
    fc.assert(
      fc.property(
        questionsArb({ min: 1, max: 8 }),
        (questions) => {
          const lastQuestion = questions[questions.length - 1]

          // Ensure no rules on last question's options
          lastQuestion.options.forEach((opt) => {
            opt.rules = []
          })

          const answer: Answer = {
            questionId: lastQuestion.id,
            selectedOptionIds: [lastQuestion.options[0].id],
            textoLivre: null,
          }

          const result = determineNext(lastQuestion, answer, questions)
          assert.strictEqual(
            result,
            null,
            `Expected null for last question, got ${result}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('returns next by ordem when selected options carry only sequential rules (null next_question_id, finalizar=false)', () => {
    fc.assert(
      fc.property(
        questionsArb({ min: 2, max: 6 }).chain((questions) => {
          const maxIdx = questions.length - 2
          return fc
            .record({
              qIdx: fc.integer({ min: 0, max: maxIdx }),
              priority: fc.integer({ min: 0, max: 10 }),
            })
            .map(({ qIdx, priority }) => ({ questions, qIdx, priority }))
        }),
        ({ questions, qIdx, priority }) => {
          const currentQuestion = questions[qIdx]

          // Attach a "sequential" rule (next_question_id=null, finalizar=false)
          currentQuestion.options[0].rules = [
            { next_question_id: null, finalizar: false, priority },
          ]

          const answer: Answer = {
            questionId: currentQuestion.id,
            selectedOptionIds: [currentQuestion.options[0].id],
            textoLivre: null,
          }

          const result = determineNext(currentQuestion, answer, questions)
          const expectedNext = questions[qIdx + 1].id

          assert.strictEqual(
            result,
            expectedNext,
            `Expected next question ${expectedNext} (sequential rule fallthrough), got ${result}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })
})
