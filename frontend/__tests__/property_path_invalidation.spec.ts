// Feature: public-response-flow, Property: Path invalidation
import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import { getInvalidatedQuestions, computeForwardPath } from '../lib/navigation/path_calculator.js'
import type { Answer, Question, Option, Rule, SurveyStructure } from '../lib/navigation/types.js'

/**
 * Property: Invalidation is exactly the unreachable tail
 * Validates: Requirements 4.9
 *
 * For any answered path and any changed answer at a point on that path,
 * `getInvalidatedQuestions` returns exactly the set of old-tail questions
 * that are absent from the newly computed forward path — no question still
 * reachable is invalidated, and no unreachable question is retained.
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generates an acyclic, forward-only survey structure with branching.
 * Each question has options that either:
 * - Have no rules (sequential advancement)
 * - Have a rule pointing to a later question (forward jump)
 * - Have a finalizar rule (end path)
 *
 * We ensure at least 3 questions to have a meaningful tail to test.
 */
function arbSurveyStructure(): fc.Arbitrary<{
  structure: SurveyStructure
  answeredPath: number[]
  answers: Map<number, Answer>
  changeIdx: number
  newAnswer: Answer
}> {
  return fc
    .integer({ min: 4, max: 10 })
    .chain((numQuestions) => {
      // Generate questions with ascending IDs and ordem
      return fc
        .tuple(
          fc.array(
            fc.integer({ min: 2, max: 4 }),
            { minLength: numQuestions, maxLength: numQuestions }
          ),
          fc.infiniteStream(fc.integer({ min: 0, max: 100 }))
        )
        .chain(([optionCounts, _rng]) => {
          // Build questions with options
          const questions: Question[] = []
          let optionIdCounter = 1000

          for (let i = 0; i < numQuestions; i++) {
            const qId = i + 1
            const numOptions = optionCounts[i]
            const options: Option[] = []

            for (let j = 0; j < numOptions; j++) {
              const optId = optionIdCounter++
              const rules: Rule[] = []

              // For branching: some options can jump forward, others sequential
              // We'll assign rules during the walk phase via a separate generator
              options.push({
                id: optId,
                texto: `Option ${j + 1}`,
                ordem: j + 1,
                rules,
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

          // Now generate rules for some options: forward jumps or no rule
          // We create branching by assigning rules to options that skip questions
          return fc
            .tuple(
              // For each question, for each option, decide if it has a rule
              fc.array(
                fc.array(
                  fc.oneof(
                    fc.constant('none' as const),
                    fc.constant('jump' as const),
                    fc.constant('finalizar' as const)
                  ),
                  { minLength: 4, maxLength: 4 }
                ),
                { minLength: numQuestions, maxLength: numQuestions }
              ),
              // Jump targets: for each question/option with a jump, pick a forward target
              fc.array(
                fc.array(
                  fc.integer({ min: 1, max: numQuestions - 1 }),
                  { minLength: 4, maxLength: 4 }
                ),
                { minLength: numQuestions, maxLength: numQuestions }
              ),
              // Which option index to select for walking the initial path
              fc.array(
                fc.integer({ min: 0, max: 3 }),
                { minLength: numQuestions, maxLength: numQuestions }
              ),
              // Which option index to select for the changed answer
              fc.array(
                fc.integer({ min: 0, max: 3 }),
                { minLength: numQuestions, maxLength: numQuestions }
              )
            )
            .map(([ruleTypes, jumpTargets, pathChoices, altChoices]) => {
              // Assign rules to options (only forward jumps allowed)
              for (let i = 0; i < numQuestions; i++) {
                const q = questions[i]
                for (let j = 0; j < q.options.length; j++) {
                  const ruleType = ruleTypes[i][j % ruleTypes[i].length]
                  const jumpOffset = jumpTargets[i][j % jumpTargets[i].length]

                  if (ruleType === 'jump' && i < numQuestions - 1) {
                    // Jump to a later question (forward only)
                    const targetIdx = Math.min(i + 1 + (jumpOffset % (numQuestions - i - 1)), numQuestions - 1)
                    q.options[j].rules = [
                      { next_question_id: questions[targetIdx].id, finalizar: false, priority: 0 },
                    ]
                  } else if (ruleType === 'finalizar' && i > 0) {
                    // Only allow finalizar on non-first questions to ensure a path exists
                    q.options[j].rules = [
                      { next_question_id: null, finalizar: true, priority: 0 },
                    ]
                  }
                  // 'none' → no rules (sequential)
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

              let currentId: number | null = questions[0].id

              while (currentId !== null) {
                const currentQ = questions.find((q) => q.id === currentId)
                if (!currentQ) break
                if (answeredPath.includes(currentId)) break // cycle guard

                answeredPath.push(currentId)

                // Pick an option for this question
                const optIdx = pathChoices[currentQ.id - 1] % currentQ.options.length
                const selectedOption = currentQ.options[optIdx]
                const answer: Answer = {
                  questionId: currentId,
                  selectedOptionIds: [selectedOption.id],
                  textoLivre: null,
                }
                answers.set(currentId, answer)

                // Determine next
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

              // We need at least 3 questions on the path to have a meaningful change point and tail
              if (answeredPath.length < 3) {
                // Ensure minimum path length by using the first valid index
                // This is a filter — fc will retry
                return null
              }

              // Pick a change index (not the last question, so there's a tail)
              const changeIdx = pathChoices[0] % (answeredPath.length - 1)
              const changedQuestionId = answeredPath[changeIdx]
              const changedQuestion = questions.find((q) => q.id === changedQuestionId)!

              // Pick a DIFFERENT option for the changed answer
              const currentAnswer = answers.get(changedQuestionId)!
              const currentOptId = currentAnswer.selectedOptionIds[0]
              let altOptIdx = altChoices[changedQuestion.id - 1] % changedQuestion.options.length
              // Try to pick a different option
              if (changedQuestion.options[altOptIdx].id === currentOptId && changedQuestion.options.length > 1) {
                altOptIdx = (altOptIdx + 1) % changedQuestion.options.length
              }
              const altOption = changedQuestion.options[altOptIdx]

              const newAnswer: Answer = {
                questionId: changedQuestionId,
                selectedOptionIds: [altOption.id],
                textoLivre: null,
              }

              return { structure, answeredPath, answers, changeIdx, newAnswer }
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
        })
    })
}

describe('Property: Invalidation is exactly the unreachable tail', () => {
  it('invalidated set equals old tail minus new forward path (100+ iterations)', () => {
    fc.assert(
      fc.property(arbSurveyStructure(), ({ structure, answeredPath, changeIdx, newAnswer }) => {
        const changedQuestionId = answeredPath[changeIdx]

        // Call the function under test
        const invalidated = getInvalidatedQuestions(
          changedQuestionId,
          newAnswer,
          answeredPath,
          structure
        )

        // Compute the expected result independently
        const tailQuestions = answeredPath.slice(changeIdx + 1)
        const newForwardPath = computeForwardPath(changedQuestionId, newAnswer, structure)
        const newForwardSet = new Set(newForwardPath)

        // Property 1: Invalidated set is a subset of the old tail
        for (const qId of invalidated) {
          assert.ok(
            tailQuestions.includes(qId),
            `Invalidated question ${qId} is not in the old tail [${tailQuestions}]`
          )
        }

        // Property 2: No question on the new forward path is invalidated
        for (const qId of invalidated) {
          assert.ok(
            !newForwardSet.has(qId),
            `Invalidated question ${qId} should not be on the new forward path`
          )
        }

        // Property 3: Every old-tail question NOT on the new forward path IS invalidated
        const invalidatedSet = new Set(invalidated)
        for (const qId of tailQuestions) {
          if (!newForwardSet.has(qId)) {
            assert.ok(
              invalidatedSet.has(qId),
              `Old-tail question ${qId} is unreachable but was NOT invalidated`
            )
          }
        }

        // Combined: invalidated === tailQuestions.filter(q => !newForwardSet.has(q))
        const expectedInvalidated = tailQuestions.filter((qId) => !newForwardSet.has(qId))
        assert.deepStrictEqual(
          [...invalidated].sort(),
          [...expectedInvalidated].sort(),
          'Invalidated set must exactly equal (old tail - new forward path)'
        )
      }),
      { numRuns: 150 }
    )
  })
})
