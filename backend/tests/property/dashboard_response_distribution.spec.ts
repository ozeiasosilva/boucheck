import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for Dashboard response distribution completeness.
 * Property 21: Response distribution completeness
 * Validates: Requirements 14.1, 14.2
 *
 * Tests the pure computation logic: for every choice-type question/option pair,
 * produce the count of answers selecting that option (including zero), and
 * exclude questions with tipo='aberta'.
 */

interface Question {
  id: number
  tipo: 'escolha_unica' | 'multipla_escolha' | 'aberta'
  texto: string
  options: Array<{ id: number; texto: string }>
}

interface Answer {
  questionId: number
  optionId: number | null
}

interface ResponseDistribution {
  questionId: number
  questionText: string
  options: Array<{ optionId: number; optionText: string; count: number }>
}

/**
 * Pure function that mirrors the response distribution logic in DashboardService.
 * For each choice-type question (tipo != 'aberta'), includes every option with
 * the count of answers selecting that option among the provided answers.
 */
function computeDistribution(questions: Question[], answers: Answer[]): ResponseDistribution[] {
  const result: ResponseDistribution[] = []

  for (const question of questions) {
    // Req 14.2: exclude 'aberta' questions
    if (question.tipo === 'aberta') continue

    const optionCounts: Array<{ optionId: number; optionText: string; count: number }> = []

    for (const option of question.options) {
      // Count answers that selected this option for this question
      const count = answers.filter(
        (a) => a.questionId === question.id && a.optionId === option.id
      ).length

      optionCounts.push({
        optionId: option.id,
        optionText: option.texto,
        count,
      })
    }

    result.push({
      questionId: question.id,
      questionText: question.texto,
      options: optionCounts,
    })
  }

  return result
}

// --- Generators ---

const questionTipoArb = fc.constantFrom(
  'escolha_unica' as const,
  'multipla_escolha' as const,
  'aberta' as const
)

const choiceTipoArb = fc.constantFrom(
  'escolha_unica' as const,
  'multipla_escolha' as const
)

function questionArb(idRange: { min: number; max: number }): fc.Arbitrary<Question> {
  return fc.record({
    id: fc.integer(idRange),
    tipo: questionTipoArb,
    texto: fc.string({ minLength: 1, maxLength: 30 }),
    options: fc.array(
      fc.record({
        id: fc.integer({ min: 1, max: 500 }),
        texto: fc.string({ minLength: 1, maxLength: 20 }),
      }),
      { minLength: 1, maxLength: 5 }
    ),
  })
}

function choiceQuestionArb(idRange: { min: number; max: number }): fc.Arbitrary<Question> {
  return fc.record({
    id: fc.integer(idRange),
    tipo: choiceTipoArb,
    texto: fc.string({ minLength: 1, maxLength: 30 }),
    options: fc.array(
      fc.record({
        id: fc.integer({ min: 1, max: 500 }),
        texto: fc.string({ minLength: 1, maxLength: 20 }),
      }),
      { minLength: 1, maxLength: 5 }
    ),
  })
}

function abertaQuestionArb(idRange: { min: number; max: number }): fc.Arbitrary<Question> {
  return fc.record({
    id: fc.integer(idRange),
    tipo: fc.constant('aberta' as const),
    texto: fc.string({ minLength: 1, maxLength: 30 }),
    options: fc.constant([]), // aberta questions have no options
  })
}

describe("Property 21: Response distribution completeness", () => {
  it("excludes 'aberta' questions from the result (Req 14.2)", () => {
    /**
     * **Validates: Requirements 14.2**
     */
    fc.assert(
      fc.property(
        // Mix of choice-type and 'aberta' questions with unique ids
        fc.uniqueArray(questionArb({ min: 1, max: 100 }), {
          minLength: 1,
          maxLength: 20,
          selector: (q) => q.id,
        }),
        fc.array(
          fc.record({
            questionId: fc.integer({ min: 1, max: 100 }),
            optionId: fc.oneof(fc.integer({ min: 1, max: 500 }), fc.constant(null)),
          }),
          { minLength: 0, maxLength: 50 }
        ),
        (questions, answers) => {
          const distribution = computeDistribution(questions, answers)

          // Collect all 'aberta' question ids
          const abertaIds = new Set(
            questions.filter((q) => q.tipo === 'aberta').map((q) => q.id)
          )

          // No 'aberta' question should appear in the result
          for (const entry of distribution) {
            assert.ok(
              !abertaIds.has(entry.questionId),
              `Question ${entry.questionId} with tipo='aberta' should not appear in distribution`
            )
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("includes all choice-type questions in the result (Req 14.1)", () => {
    /**
     * **Validates: Requirements 14.1**
     */
    fc.assert(
      fc.property(
        // At least one choice-type question
        fc.array(choiceQuestionArb({ min: 1, max: 100 }), { minLength: 1, maxLength: 20 }),
        // Optionally mix in some 'aberta' questions
        fc.array(abertaQuestionArb({ min: 101, max: 200 }), { minLength: 0, maxLength: 10 }),
        fc.array(
          fc.record({
            questionId: fc.integer({ min: 1, max: 200 }),
            optionId: fc.oneof(fc.integer({ min: 1, max: 500 }), fc.constant(null)),
          }),
          { minLength: 0, maxLength: 50 }
        ),
        (choiceQuestions, abertaQuestions, answers) => {
          const allQuestions = [...choiceQuestions, ...abertaQuestions]
          const distribution = computeDistribution(allQuestions, answers)

          const resultQuestionIds = new Set(distribution.map((d) => d.questionId))

          // Every choice-type question must appear
          for (const q of choiceQuestions) {
            assert.ok(
              resultQuestionIds.has(q.id),
              `Choice-type question ${q.id} (tipo='${q.tipo}') should appear in distribution`
            )
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("every option of included questions appears, even with zero answers (Req 14.1)", () => {
    /**
     * **Validates: Requirements 14.1**
     */
    fc.assert(
      fc.property(
        // Generate choice questions with unique question ids and unique option ids per question
        fc.uniqueArray(
          fc.record({
            id: fc.integer({ min: 1, max: 100 }),
            tipo: choiceTipoArb,
            texto: fc.string({ minLength: 1, maxLength: 30 }),
            options: fc.uniqueArray(
              fc.record({
                id: fc.integer({ min: 1, max: 500 }),
                texto: fc.string({ minLength: 1, maxLength: 20 }),
              }),
              { minLength: 1, maxLength: 5, selector: (o) => o.id }
            ),
          }),
          { minLength: 1, maxLength: 15, selector: (q) => q.id }
        ),
        (questions) => {
          // Pass no answers at all - all options should still appear with count 0
          const distribution = computeDistribution(questions, [])

          for (const q of questions) {
            const entry = distribution.find((d) => d.questionId === q.id)
            assert.ok(entry, `Question ${q.id} should be in distribution`)

            // Every option of this question should be listed
            for (const opt of q.options) {
              const optEntry = entry!.options.find((o) => o.optionId === opt.id)
              assert.ok(
                optEntry,
                `Option ${opt.id} of question ${q.id} should appear even with zero answers`
              )
              assert.strictEqual(
                optEntry!.count,
                0,
                `Option ${opt.id} of question ${q.id} should have count 0 when no answers exist`
              )
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("answer counts are non-negative", () => {
    /**
     * **Validates: Requirements 14.1**
     */
    fc.assert(
      fc.property(
        fc.uniqueArray(questionArb({ min: 1, max: 100 }), {
          minLength: 1,
          maxLength: 20,
          selector: (q) => q.id,
        }),
        fc.array(
          fc.record({
            questionId: fc.integer({ min: 1, max: 100 }),
            optionId: fc.oneof(fc.integer({ min: 1, max: 500 }), fc.constant(null)),
          }),
          { minLength: 0, maxLength: 100 }
        ),
        (questions, answers) => {
          const distribution = computeDistribution(questions, answers)

          for (const entry of distribution) {
            for (const opt of entry.options) {
              assert.ok(
                opt.count >= 0,
                `Count for option ${opt.optionId} of question ${entry.questionId} is negative: ${opt.count}`
              )
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("count correctness: option count equals the number of answers selecting that option", () => {
    /**
     * **Validates: Requirements 14.1, 14.2**
     */
    fc.assert(
      fc.property(
        // Generate choice questions with unique ids and unique option ids
        fc.uniqueArray(
          fc.record({
            id: fc.integer({ min: 1, max: 100 }),
            tipo: choiceTipoArb,
            texto: fc.string({ minLength: 1, maxLength: 30 }),
            options: fc.uniqueArray(
              fc.record({
                id: fc.integer({ min: 1, max: 500 }),
                texto: fc.string({ minLength: 1, maxLength: 20 }),
              }),
              { minLength: 1, maxLength: 5, selector: (o) => o.id }
            ),
          }),
          { minLength: 1, maxLength: 15, selector: (q) => q.id }
        ),
        // Generate answers that reference existing question/option pairs
        fc.array(
          fc.record({
            questionId: fc.integer({ min: 1, max: 100 }),
            optionId: fc.oneof(fc.integer({ min: 1, max: 500 }), fc.constant(null)),
          }),
          { minLength: 0, maxLength: 100 }
        ),
        (questions, answers) => {
          const distribution = computeDistribution(questions, answers)

          for (const entry of distribution) {
            for (const opt of entry.options) {
              // Manually count answers matching this question+option pair
              const expectedCount = answers.filter(
                (a) => a.questionId === entry.questionId && a.optionId === opt.optionId
              ).length

              assert.strictEqual(
                opt.count,
                expectedCount,
                `Option ${opt.optionId} of question ${entry.questionId}: expected count ${expectedCount}, got ${opt.count}`
              )
            }
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})
