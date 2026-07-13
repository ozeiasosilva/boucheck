// Feature: public-response-flow, Property: Progress calculation
import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { calculateProgress } from '../lib/navigation/progress.js'
import type { Answer, Question, Option, Rule, SurveyStructure } from '../lib/navigation/types.js'

/**
 * Property: Progress stays bounded and monotonic
 * Validates: Requirements 4.1
 *
 * For any fixed survey structure, as the answered path grows by one more
 * answered question, `calculateProgress` always yields a value within [0, 100]
 * and never decreases.
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generates an acyclic, forward-only survey structure and walks it to produce
 * a full answered path. The structure has questions whose options may have
 * forward-jump rules or no rules (sequential advancement).
 *
 * Returns the structure, the full answered path, and the answers map.
 */
function arbSurveyWithPath(): fc.Arbitrary<{
  structure: SurveyStructure
  answeredPath: number[]
  answers: Map<number, Answer>
}> {
  return fc
    .integer({ min: 3, max: 12 })
    .chain((numQuestions) => {
      return fc
        .tuple(
          // Number of options per question (2-4)
          fc.array(fc.integer({ min: 2, max: 4 }), {
            minLength: numQuestions,
            maxLength: numQuestions,
          }),
          // Rule type assignment for each option of each question
          fc.array(
            fc.array(
              fc.oneof(
                { weight: 5, arbitrary: fc.constant('none' as const) },
                { weight: 2, arbitrary: fc.constant('jump' as const) }
              ),
              { minLength: 4, maxLength: 4 }
            ),
            { minLength: numQuestions, maxLength: numQuestions }
          ),
          // Jump offsets
          fc.array(
            fc.array(fc.integer({ min: 1, max: numQuestions - 1 }), {
              minLength: 4,
              maxLength: 4,
            }),
            { minLength: numQuestions, maxLength: numQuestions }
          ),
          // Which option to select when walking the path
          fc.array(fc.integer({ min: 0, max: 3 }), {
            minLength: numQuestions,
            maxLength: numQuestions,
          })
        )
        .map(([optionCounts, ruleTypes, jumpOffsets, pathChoices]) => {
          // Build questions
          const questions: Question[] = []
          let optionIdCounter = 1000

          for (let i = 0; i < numQuestions; i++) {
            const qId = i + 1
            const numOptions = optionCounts[i]
            const options: Option[] = []

            for (let j = 0; j < numOptions; j++) {
              options.push({
                id: optionIdCounter++,
                texto: `Option ${j + 1}`,
                ordem: j + 1,
                rules: [],
              })
            }

            questions.push({
              id: qId,
              texto: `Question ${qId}`,
              descricao: null,
              tipo: 'escolha_unica',
              obrigatoria: true,
              ordem: i + 1,
              options,
            })
          }

          // Assign forward-only rules to options
          for (let i = 0; i < numQuestions; i++) {
            const q = questions[i]
            for (let j = 0; j < q.options.length; j++) {
              const ruleType = ruleTypes[i][j % ruleTypes[i].length]
              const jumpOffset = jumpOffsets[i][j % jumpOffsets[i].length]

              if (ruleType === 'jump' && i < numQuestions - 1) {
                const targetIdx = Math.min(
                  i + 1 + (jumpOffset % (numQuestions - i - 1)),
                  numQuestions - 1
                )
                q.options[j].rules = [
                  { next_question_id: questions[targetIdx].id, finalizar: false, priority: 0 },
                ]
              }
              // 'none' → no rules (sequential advancement)
            }
          }

          const structure: SurveyStructure = {
            survey_id: 1,
            survey_version: 1,
            questions,
            has_checklist: false,
          }

          // Walk the structure to produce a valid answered path
          const answeredPath: number[] = []
          const answers = new Map<number, Answer>()
          const sortedQuestions = [...questions].sort((a, b) => a.ordem - b.ordem)
          const visited = new Set<number>()

          let currentId: number | null = questions[0].id

          while (currentId !== null) {
            if (visited.has(currentId)) break
            const currentQ = questions.find((q) => q.id === currentId)
            if (!currentQ) break

            visited.add(currentId)
            answeredPath.push(currentId)

            // Pick an option
            const optIdx = pathChoices[currentQ.id - 1] % currentQ.options.length
            const selectedOption = currentQ.options[optIdx]
            const answer: Answer = {
              questionId: currentId,
              selectedOptionIds: [selectedOption.id],
              textoLivre: null,
            }
            answers.set(currentId, answer)

            // Determine next question
            const rule = selectedOption.rules.length > 0 ? selectedOption.rules[0] : null
            if (rule?.finalizar) {
              currentId = null
            } else if (rule && rule.next_question_id !== null) {
              currentId = rule.next_question_id
            } else {
              const idx = sortedQuestions.findIndex((q) => q.id === currentId)
              currentId = sortedQuestions[idx + 1]?.id ?? null
            }
          }

          // Ensure at least 2 questions on the path for meaningful monotonicity checks
          if (answeredPath.length < 2) {
            return null
          }

          return { structure, answeredPath, answers }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    })
}

// ---------------------------------------------------------------------------
// Property 1: Bounded — progress is always in [0, 100]
// ---------------------------------------------------------------------------

describe('Property: Progress stays bounded [0, 100] (Req 4.1)', () => {
  it('for every prefix of the answered path, calculateProgress yields a value in [0, 100]', () => {
    fc.assert(
      fc.property(arbSurveyWithPath(), ({ structure, answeredPath, answers }) => {
        // For each prefix length (including the full path), check boundedness
        for (let i = 0; i < answeredPath.length; i++) {
          const currentQuestionId = answeredPath[i]
          // Build the path up to and including the current question
          const pathPrefix = answeredPath.slice(0, i + 1)

          // Build an answers map containing only the answers for questions on this prefix
          const prefixAnswers = new Map<number, Answer>()
          for (const qId of pathPrefix) {
            const answer = answers.get(qId)
            if (answer) prefixAnswers.set(qId, answer)
          }

          const progress = calculateProgress(
            pathPrefix,
            currentQuestionId,
            structure,
            prefixAnswers
          )

          assert.ok(
            progress >= 0 && progress <= 100,
            `Progress ${progress} is out of bounds [0, 100] at path index ${i} (question ${currentQuestionId})`
          )
        }
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 2: Monotonic — progress never decreases as path grows
// ---------------------------------------------------------------------------

describe('Property: Progress is monotonic as answered path grows (Req 4.1)', () => {
  it('for each consecutive pair of path prefixes, progress does not decrease', () => {
    fc.assert(
      fc.property(arbSurveyWithPath(), ({ structure, answeredPath, answers }) => {
        let previousProgress = -1

        for (let i = 0; i < answeredPath.length; i++) {
          const currentQuestionId = answeredPath[i]
          const pathPrefix = answeredPath.slice(0, i + 1)

          // Build answers map for this prefix
          const prefixAnswers = new Map<number, Answer>()
          for (const qId of pathPrefix) {
            const answer = answers.get(qId)
            if (answer) prefixAnswers.set(qId, answer)
          }

          const progress = calculateProgress(
            pathPrefix,
            currentQuestionId,
            structure,
            prefixAnswers
          )

          assert.ok(
            progress >= previousProgress,
            `Progress decreased from ${previousProgress} to ${progress} when advancing from path length ${i} to ${i + 1} (question ${currentQuestionId})`
          )

          previousProgress = progress
        }
      }),
      { numRuns: 200 }
    )
  })
})
