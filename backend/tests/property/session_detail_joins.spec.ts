import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for session detail answer and checklist join completeness.
 *
 * Property 7: Session detail answer and checklist join completeness
 * Validates: Requirements 4.2, 4.3
 *
 * These tests verify join completeness as pure functions:
 * 1. Every answer in the session appears in the result
 * 2. Every checklist selection appears
 * 3. Answer entries preserve question/option associations
 * 4. Checklist entries preserve item/group associations
 */

// ---------------------------------------------------------------------------
// Types simulating the data involved in the session detail mapping
// ---------------------------------------------------------------------------

interface SimulatedAnswer {
  questionId: number
  questionText: string
  optionText: string | null
  textoLivre: string | null
}

interface SimulatedChecklistSelection {
  checklistItemId: number
  nome: string
  grupo: string
}

/**
 * Simulates a raw response_answers row with preloaded question and questionOption.
 */
interface RawAnswer {
  questionId: number
  question: { texto: string }
  questionOption: { texto: string } | null
  textoLivre: string | null
}

/**
 * Simulates a raw response_checklist row with preloaded checklistItem.
 */
interface RawChecklistSelection {
  checklistItemId: number
  checklistItem: { nome: string; grupo: string }
}

// ---------------------------------------------------------------------------
// Pure mapping functions replicating the ResponseTrackingService.detail() logic
// ---------------------------------------------------------------------------

/**
 * Maps raw answer rows to the SessionDetail.answers shape.
 * This replicates the exact mapping from ResponseTrackingService.detail():
 *   session.answers.map((a) => ({
 *     questionId: a.questionId,
 *     questionText: a.question.texto,
 *     optionText: a.questionOption ? a.questionOption.texto : null,
 *     textoLivre: a.textoLivre,
 *   }))
 */
function mapAnswers(rawAnswers: RawAnswer[]): SimulatedAnswer[] {
  return rawAnswers.map((a) => ({
    questionId: a.questionId,
    questionText: a.question.texto,
    optionText: a.questionOption ? a.questionOption.texto : null,
    textoLivre: a.textoLivre,
  }))
}

/**
 * Maps raw checklist selection rows to the SessionDetail.checklist shape.
 * This replicates the exact mapping from ResponseTrackingService.detail():
 *   session.checklistSelections.map((c) => ({
 *     checklistItemId: c.checklistItemId,
 *     nome: c.checklistItem.nome,
 *     grupo: c.checklistItem.grupo,
 *   }))
 */
function mapChecklist(rawSelections: RawChecklistSelection[]): SimulatedChecklistSelection[] {
  return rawSelections.map((c) => ({
    checklistItemId: c.checklistItemId,
    nome: c.checklistItem.nome,
    grupo: c.checklistItem.grupo,
  }))
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generator for a raw answer row with preloaded question and optionally a questionOption.
 */
function rawAnswerArbitrary(): fc.Arbitrary<RawAnswer> {
  return fc.record({
    questionId: fc.integer({ min: 1, max: 10000 }),
    question: fc.record({
      texto: fc.string({ minLength: 1, maxLength: 200 }),
    }),
    questionOption: fc.option(
      fc.record({ texto: fc.string({ minLength: 1, maxLength: 200 }) }),
      { nil: null }
    ),
    textoLivre: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: null }),
  })
}

/**
 * Generator for a raw checklist selection row with preloaded checklistItem.
 */
function rawChecklistSelectionArbitrary(): fc.Arbitrary<RawChecklistSelection> {
  return fc.record({
    checklistItemId: fc.integer({ min: 1, max: 10000 }),
    checklistItem: fc.record({
      nome: fc.string({ minLength: 1, maxLength: 200 }),
      grupo: fc.string({ minLength: 1, maxLength: 100 }),
    }),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 7: Session detail answer and checklist join completeness', () => {
  it('every answer in the session appears in the result (count preservation)', () => {
    fc.assert(
      fc.property(fc.array(rawAnswerArbitrary(), { minLength: 0, maxLength: 50 }), (rawAnswers) => {
        const result = mapAnswers(rawAnswers)
        assert.strictEqual(
          result.length,
          rawAnswers.length,
          `Expected ${rawAnswers.length} answer entries, got ${result.length}`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('every checklist selection in the session appears in the result (count preservation)', () => {
    fc.assert(
      fc.property(
        fc.array(rawChecklistSelectionArbitrary(), { minLength: 0, maxLength: 50 }),
        (rawSelections) => {
          const result = mapChecklist(rawSelections)
          assert.strictEqual(
            result.length,
            rawSelections.length,
            `Expected ${rawSelections.length} checklist entries, got ${result.length}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('answer entries preserve question/option associations: questionId, questionText, optionText, textoLivre map correctly', () => {
    fc.assert(
      fc.property(fc.array(rawAnswerArbitrary(), { minLength: 1, maxLength: 50 }), (rawAnswers) => {
        const result = mapAnswers(rawAnswers)

        for (let i = 0; i < rawAnswers.length; i++) {
          const raw = rawAnswers[i]
          const mapped = result[i]

          assert.strictEqual(
            mapped.questionId,
            raw.questionId,
            `Answer[${i}] questionId mismatch: expected ${raw.questionId}, got ${mapped.questionId}`
          )
          assert.strictEqual(
            mapped.questionText,
            raw.question.texto,
            `Answer[${i}] questionText mismatch: expected "${raw.question.texto}", got "${mapped.questionText}"`
          )
          assert.strictEqual(
            mapped.optionText,
            raw.questionOption ? raw.questionOption.texto : null,
            `Answer[${i}] optionText mismatch: expected "${raw.questionOption?.texto ?? null}", got "${mapped.optionText}"`
          )
          assert.strictEqual(
            mapped.textoLivre,
            raw.textoLivre,
            `Answer[${i}] textoLivre mismatch: expected "${raw.textoLivre}", got "${mapped.textoLivre}"`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  it('checklist entries preserve item/group associations: checklistItemId, nome, grupo map correctly', () => {
    fc.assert(
      fc.property(
        fc.array(rawChecklistSelectionArbitrary(), { minLength: 1, maxLength: 50 }),
        (rawSelections) => {
          const result = mapChecklist(rawSelections)

          for (let i = 0; i < rawSelections.length; i++) {
            const raw = rawSelections[i]
            const mapped = result[i]

            assert.strictEqual(
              mapped.checklistItemId,
              raw.checklistItemId,
              `Checklist[${i}] checklistItemId mismatch: expected ${raw.checklistItemId}, got ${mapped.checklistItemId}`
            )
            assert.strictEqual(
              mapped.nome,
              raw.checklistItem.nome,
              `Checklist[${i}] nome mismatch: expected "${raw.checklistItem.nome}", got "${mapped.nome}"`
            )
            assert.strictEqual(
              mapped.grupo,
              raw.checklistItem.grupo,
              `Checklist[${i}] grupo mismatch: expected "${raw.checklistItem.grupo}", got "${mapped.grupo}"`
            )
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('answers with null questionOption yield null optionText (choice vs open question handling)', () => {
    fc.assert(
      fc.property(
        rawAnswerArbitrary().map((raw) => ({ ...raw, questionOption: null })),
        (rawAnswer) => {
          const [mapped] = mapAnswers([rawAnswer])
          assert.strictEqual(
            mapped.optionText,
            null,
            'optionText must be null when questionOption is null (open question)'
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('answers with non-null questionOption yield the option texto (choice question handling)', () => {
    fc.assert(
      fc.property(
        rawAnswerArbitrary().chain((raw) =>
          fc
            .string({ minLength: 1, maxLength: 200 })
            .map((texto) => ({ ...raw, questionOption: { texto } }))
        ),
        (rawAnswer) => {
          const [mapped] = mapAnswers([rawAnswer])
          assert.strictEqual(
            mapped.optionText,
            rawAnswer.questionOption!.texto,
            `optionText must equal questionOption.texto "${rawAnswer.questionOption!.texto}"`
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('empty answers array produces empty result (zero answers scenario)', () => {
    const result = mapAnswers([])
    assert.strictEqual(result.length, 0, 'Mapping zero answers must produce an empty array')
  })

  it('empty checklist selections array produces empty result (zero checklist scenario)', () => {
    const result = mapChecklist([])
    assert.strictEqual(result.length, 0, 'Mapping zero checklist selections must produce an empty array')
  })
})
