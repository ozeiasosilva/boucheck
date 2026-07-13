import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import {
  computeAnsweredPathValidity,
  determineNext,
  type NavQuestion,
  type NavAnswer,
  type NavOption,
  type NavRule,
} from '../../app/services/navigation_validator.js'

/**
 * Property-based tests for computeAnsweredPathValidity
 * Property: Revalidation soundness and completeness
 *
 * For any generated survey structure (acyclic, forward-only rule graph) and
 * any set of persisted answers, `computeAnsweredPathValidity` returns `true`
 * if and only if every answered question lies on the deterministic walk of the
 * structure and every mandatory question on that walk has an answer.
 *
 * **Validates: Requirements 5.8, 5.9**
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a tipo for a question */
const tipoArb = fc.constantFrom<'escolha_unica' | 'multipla_escolha' | 'aberta'>(
  'escolha_unica',
  'multipla_escolha',
  'aberta'
)

/**
 * Generates an acyclic, forward-only survey structure.
 * Questions are sorted by `ordem`, and rules only point to higher-ordem questions.
 * Each question gets options with rules that may jump to a later question or finalizar.
 */
function surveyStructureArb(opts?: { minQuestions?: number; maxQuestions?: number }) {
  const minQ = opts?.minQuestions ?? 1
  const maxQ = opts?.maxQuestions ?? 8

  return fc
    .record({
      numQuestions: fc.integer({ min: minQ, max: maxQ }),
      seed: fc.integer({ min: 1, max: 100000 }),
    })
    .chain(({ numQuestions }) => {
      // Generate question configs
      return fc
        .array(
          fc.record({
            tipo: tipoArb,
            obrigatoria: fc.boolean(),
            numOptions: fc.integer({ min: 1, max: 4 }),
          }),
          { minLength: numQuestions, maxLength: numQuestions }
        )
        .chain((questionConfigs) => {
          // For each question, generate rules for each option
          // Rules can only point forward (to a higher-index question) or finalizar
          const ruleArbs = questionConfigs.map((qConfig, qIdx) => {
            return fc.array(
              fc.array(
                fc.record({
                  // Rules can point to any question after the current one, or null (sequential)
                  targetType: fc.constantFrom<'forward' | 'finalizar' | 'sequential'>(
                    'forward',
                    'finalizar',
                    'sequential'
                  ),
                  targetOffset: fc.integer({ min: 1, max: Math.max(1, numQuestions - qIdx - 1) }),
                  priority: fc.integer({ min: 0, max: 10 }),
                }),
                { minLength: 0, maxLength: 2 }
              ),
              { minLength: qConfig.numOptions, maxLength: qConfig.numOptions }
            )
          })

          return fc.tuple(...ruleArbs).map((allOptionRules) => {
            let nextId = 1
            let nextOptionId = 100

            const questions: NavQuestion[] = questionConfigs.map((qConfig, qIdx) => {
              const questionId = nextId++
              const options: NavOption[] = []

              for (let optIdx = 0; optIdx < qConfig.numOptions; optIdx++) {
                const optionId = nextOptionId++
                const rawRules = (allOptionRules[qIdx] as Array<Array<{ targetType: string; targetOffset: number; priority: number }>>)[optIdx] ?? []
                const rules: NavRule[] = rawRules
                  .map((r) => {
                    if (r.targetType === 'finalizar') {
                      return { nextQuestionId: null, finalizar: true, priority: r.priority }
                    }
                    if (r.targetType === 'forward' && qIdx + r.targetOffset < numQuestions) {
                      // Point to a question further ahead (id = qIdx + targetOffset + 1 since ids start at 1)
                      return {
                        nextQuestionId: qIdx + r.targetOffset + 1,
                        finalizar: false,
                        priority: r.priority,
                      }
                    }
                    // sequential: no rule (will fall through to next by ordem)
                    return null
                  })
                  .filter((r): r is NavRule => r !== null)

                options.push({ id: optionId, rules })
              }

              return {
                id: questionId,
                tipo: qConfig.tipo,
                obrigatoria: qConfig.obrigatoria,
                ordem: qIdx + 1, // ascending ordem
                options,
              }
            })

            return questions
          })
        })
    })
}

/**
 * Walks the survey structure deterministically (mirroring the algorithm in
 * computeAnsweredPathValidity) and produces a valid set of answers — selecting
 * random options along the way.
 */
function validAnswerMapArb(questions: NavQuestion[]) {
  if (questions.length === 0) {
    return fc.constant(new Map<number, NavAnswer>())
  }

  // We need to walk the path and generate answers for questions on it
  // First, determine how many random bits we need (one per question, max)
  return fc
    .array(fc.integer({ min: 0, max: 100 }), {
      minLength: questions.length,
      maxLength: questions.length,
    })
    .map((randoms) => {
      const answerMap = new Map<number, NavAnswer>()
      const questionsById = new Map(questions.map((q) => [q.id, q]))

      let current: NavQuestion | undefined = questions[0]
      let step = 0
      const visited = new Set<number>()

      while (current && step < questions.length) {
        if (visited.has(current.id)) break
        visited.add(current.id)

        // For optional questions, we might skip them (but let's answer all to make a valid path)
        // Generate an answer for this question
        const answer = generateAnswer(current, randoms[step] ?? 0)
        answerMap.set(current.id, answer)

        // Determine next
        const nextId = determineNext(current, answer, questions)
        if (nextId === null) break

        current = questionsById.get(nextId)
        step++
      }

      return answerMap
    })
}

/**
 * Generates a NavAnswer for a given question using a seed value for option selection.
 */
function generateAnswer(question: NavQuestion, seed: number): NavAnswer {
  if (question.tipo === 'aberta') {
    return {
      questionId: question.id,
      selectedOptionIds: [],
      textoLivre: `answer-${seed}`,
    }
  }

  if (question.options.length === 0) {
    return {
      questionId: question.id,
      selectedOptionIds: [],
      textoLivre: null,
    }
  }

  if (question.tipo === 'escolha_unica') {
    const idx = seed % question.options.length
    return {
      questionId: question.id,
      selectedOptionIds: [question.options[idx].id],
      textoLivre: null,
    }
  }

  // multipla_escolha: select 1 or more options
  const numSelected = (seed % question.options.length) + 1
  const selected = question.options.slice(0, numSelected).map((o) => o.id)
  return {
    questionId: question.id,
    selectedOptionIds: selected,
    textoLivre: null,
  }
}

/**
 * Computes the expected path by walking the structure with the given answer map
 * (same logic as computeAnsweredPathValidity uses internally).
 */
function computeExpectedPath(
  questions: NavQuestion[],
  answerMap: Map<number, NavAnswer>
): number[] {
  if (questions.length === 0) return []

  const questionsById = new Map(questions.map((q) => [q.id, q]))
  const path: number[] = []
  const visited = new Set<number>()

  let current: NavQuestion | undefined = questions[0]

  while (current) {
    if (visited.has(current.id)) break
    visited.add(current.id)
    path.push(current.id)

    const answer = answerMap.get(current.id)

    if (!answer) {
      // Advance sequentially
      const currentIdx = questions.findIndex((q) => q.id === current!.id)
      current = questions[currentIdx + 1]
      continue
    }

    const nextId = determineNext(current, answer, questions)
    if (nextId === null) break

    current = questionsById.get(nextId)
  }

  return path
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property: Revalidation soundness and completeness (Req 5.8, 5.9)', () => {
  it('returns true for any valid answered path (soundness)', () => {
    fc.assert(
      fc.property(
        surveyStructureArb().chain((questions) =>
          validAnswerMapArb(questions).map((answerMap) => ({ questions, answerMap }))
        ),
        ({ questions, answerMap }) => {
          const result = computeAnsweredPathValidity(questions, answerMap)
          assert.strictEqual(
            result,
            true,
            `Valid path should return true. Questions: ${JSON.stringify(questions.map((q) => q.id))}, Answers: ${JSON.stringify([...answerMap.keys()])}`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('returns false when an answer exists for a question not on the path (completeness — off-path answer)', () => {
    fc.assert(
      fc.property(
        surveyStructureArb({ minQuestions: 3 }).chain((questions) =>
          validAnswerMapArb(questions).map((answerMap) => ({ questions, answerMap }))
        ),
        ({ questions, answerMap }) => {
          // Find a question NOT on the expected path
          const expectedPath = computeExpectedPath(questions, answerMap)
          const expectedPathSet = new Set(expectedPath)
          const offPathQuestions = questions.filter((q) => !expectedPathSet.has(q.id))

          if (offPathQuestions.length === 0) return // skip if all questions are on path

          // Add an answer for an off-path question
          const offPathQ = offPathQuestions[0]
          const fakeAnswer: NavAnswer = {
            questionId: offPathQ.id,
            selectedOptionIds: offPathQ.options.length > 0 ? [offPathQ.options[0].id] : [],
            textoLivre: offPathQ.tipo === 'aberta' ? 'fake' : null,
          }

          const corruptedMap = new Map(answerMap)
          corruptedMap.set(offPathQ.id, fakeAnswer)

          const result = computeAnsweredPathValidity(questions, corruptedMap)
          assert.strictEqual(
            result,
            false,
            `Off-path answer for question ${offPathQ.id} should make validation fail`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('returns false when a mandatory question on the path is missing an answer (completeness — missing mandatory)', () => {
    fc.assert(
      fc.property(
        surveyStructureArb({ minQuestions: 2 }).chain((questions) =>
          validAnswerMapArb(questions).map((answerMap) => ({ questions, answerMap }))
        ),
        ({ questions, answerMap }) => {
          // Find a mandatory question on the expected path that has an answer
          const expectedPath = computeExpectedPath(questions, answerMap)
          const mandatoryOnPath = expectedPath.filter((qId) => {
            const q = questions.find((qu) => qu.id === qId)
            return q?.obrigatoria && answerMap.has(qId)
          })

          if (mandatoryOnPath.length === 0) return // skip if no mandatory questions with answers

          // Remove the answer for the first mandatory question
          const targetId = mandatoryOnPath[0]
          const corruptedMap = new Map(answerMap)
          corruptedMap.delete(targetId)

          const result = computeAnsweredPathValidity(questions, corruptedMap)
          assert.strictEqual(
            result,
            false,
            `Missing answer for mandatory question ${targetId} should make validation fail`
          )
        }
      ),
      { numRuns: 200 }
    )
  })

  it('returns true for empty structure with empty answers', () => {
    const result = computeAnsweredPathValidity([], new Map())
    assert.strictEqual(result, true)
  })

  it('returns false for empty structure with non-empty answers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        (qId) => {
          const answerMap = new Map<number, NavAnswer>([
            [qId, { questionId: qId, selectedOptionIds: [], textoLivre: 'test' }],
          ])
          const result = computeAnsweredPathValidity([], answerMap)
          assert.strictEqual(result, false, 'Non-empty answers with empty structure should fail')
        }
      ),
      { numRuns: 50 }
    )
  })

  it('allows optional questions on the path to be skipped (no answer) without failing', () => {
    fc.assert(
      fc.property(
        surveyStructureArb({ minQuestions: 2 }).chain((questions) =>
          validAnswerMapArb(questions).map((answerMap) => ({ questions, answerMap }))
        ),
        ({ questions, answerMap }) => {
          // Find an optional question on the expected path that has an answer
          const expectedPath = computeExpectedPath(questions, answerMap)
          const optionalOnPath = expectedPath.filter((qId) => {
            const q = questions.find((qu) => qu.id === qId)
            return q && !q.obrigatoria && answerMap.has(qId)
          })

          if (optionalOnPath.length === 0) return // skip if no optional answered questions

          // Remove the answer for an optional question — path may change but should still be valid
          // Actually we need to be careful: removing an answer changes the walk.
          // The correct property is: if we skip an optional question, the walk advances sequentially.
          // Let's just verify the function doesn't crash and returns a boolean.
          const targetId = optionalOnPath[0]
          const reducedMap = new Map(answerMap)
          reducedMap.delete(targetId)

          // After removing an optional answer, the path walk changes (advances sequentially
          // from that question). We need to ensure the remaining answers are still valid
          // for the NEW path. So let's just re-check: removing answers for questions that
          // are also not on the new path.
          const newExpectedPath = computeExpectedPath(questions, reducedMap)
          const newPathSet = new Set(newExpectedPath)

          // Remove answers that are now off-path
          for (const qId of reducedMap.keys()) {
            if (!newPathSet.has(qId)) {
              reducedMap.delete(qId)
            }
          }

          // Now ensure all mandatory questions on the new path have answers
          let allMandatorySatisfied = true
          for (const qId of newExpectedPath) {
            const q = questions.find((qu) => qu.id === qId)
            if (q?.obrigatoria && !reducedMap.has(qId)) {
              allMandatorySatisfied = false
              break
            }
          }

          if (allMandatorySatisfied) {
            const result = computeAnsweredPathValidity(questions, reducedMap)
            assert.strictEqual(
              result,
              true,
              'Skipping optional questions with consistent remaining answers should be valid'
            )
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('biconditional: result is true iff all path answers are on-path AND all mandatory on-path are answered', () => {
    fc.assert(
      fc.property(
        surveyStructureArb({ minQuestions: 2, maxQuestions: 6 }).chain((questions) => {
          // Generate a possibly-corrupted answer map
          return fc
            .record({
              validAnswers: validAnswerMapArb(questions),
              corruption: fc.constantFrom<'none' | 'add_off_path' | 'remove_mandatory'>(
                'none',
                'add_off_path',
                'remove_mandatory'
              ),
            })
            .map(({ validAnswers, corruption }) => ({ questions, validAnswers, corruption }))
        }),
        ({ questions, validAnswers, corruption }) => {
          let answerMap = new Map(validAnswers)
          let expectedValid = true

          if (corruption === 'add_off_path') {
            const expectedPath = computeExpectedPath(questions, answerMap)
            const expectedPathSet = new Set(expectedPath)
            const offPathQuestions = questions.filter((q) => !expectedPathSet.has(q.id))

            if (offPathQuestions.length > 0) {
              const offQ = offPathQuestions[0]
              answerMap.set(offQ.id, {
                questionId: offQ.id,
                selectedOptionIds: offQ.options.length > 0 ? [offQ.options[0].id] : [],
                textoLivre: offQ.tipo === 'aberta' ? 'x' : null,
              })
              expectedValid = false
            }
          } else if (corruption === 'remove_mandatory') {
            const expectedPath = computeExpectedPath(questions, answerMap)
            const mandatoryOnPath = expectedPath.filter((qId) => {
              const q = questions.find((qu) => qu.id === qId)
              return q?.obrigatoria && answerMap.has(qId)
            })

            if (mandatoryOnPath.length > 0) {
              answerMap.delete(mandatoryOnPath[0])
              expectedValid = false
            }
          }

          const result = computeAnsweredPathValidity(questions, answerMap)
          assert.strictEqual(
            result,
            expectedValid,
            `Expected ${expectedValid} for corruption=${corruption}`
          )
        }
      ),
      { numRuns: 300 }
    )
  })
})
