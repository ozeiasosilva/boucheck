import type { Answer, Question, SurveyStructure } from './types'
import { determineNext } from './engine'

// ---------------------------------------------------------------------------
// Progress Calculation (Req 4.1)
//
// Provides a dynamic progress percentage by estimating the total number of
// questions on the current path: using known answers for answered questions
// and assuming sequential advancement for unanswered future questions.
// ---------------------------------------------------------------------------

/**
 * Walks the entire survey from the first question, using known answers where
 * available and sequential advancement for unanswered questions.
 *
 * Returns an array of all reachable question IDs on the estimated path.
 */
export function computeEstimatedPath(
  structure: SurveyStructure,
  answers: Map<number, Answer>
): number[] {
  if (!structure.questions || structure.questions.length === 0) {
    return []
  }

  const questions = [...structure.questions].sort((a, b) => a.ordem - b.ordem)
  const questionsById = new Map<number, Question>(questions.map((q) => [q.id, q]))

  const estimatedPath: number[] = []
  const visited = new Set<number>()

  let currentId: number | null = questions[0].id

  while (currentId !== null) {
    if (visited.has(currentId)) {
      // Guard against cycles (should not happen per Req 5.7, but defensive)
      break
    }

    const currentQuestion = questionsById.get(currentId)
    if (!currentQuestion) break

    visited.add(currentId)
    estimatedPath.push(currentId)

    // Check if we have an answer for this question
    const answer = answers.get(currentId)

    if (answer) {
      // Use the existing answer to determine the next question
      currentId = determineNext(currentQuestion, answer, questions)
    } else {
      // No answer available — assume sequential advancement (next by ordem)
      const currentIdx = questions.findIndex((q) => q.id === currentId)
      const next = questions[currentIdx + 1]
      currentId = next?.id ?? null
    }
  }

  return estimatedPath
}

/**
 * Calculates progress as a percentage (0-100) based on how far the respondent
 * is along the estimated path.
 *
 * - `answeredPath`: the ordered list of question IDs the respondent has visited.
 * - `currentQuestionId`: the question currently being displayed.
 * - `structure`: the full survey structure (questions + options + rules).
 * - `answers`: the respondent's answers so far.
 *
 * Edge cases:
 * - Empty structure → 0
 * - `currentQuestionId` not found in `answeredPath` → 0
 * - Result is always bounded to [0, 100]
 */
export function calculateProgress(
  answeredPath: number[],
  currentQuestionId: number,
  structure: SurveyStructure,
  answers: Map<number, Answer>
): number {
  if (!structure.questions || structure.questions.length === 0) {
    return 0
  }

  const answeredCount = answeredPath.indexOf(currentQuestionId)
  if (answeredCount === -1) {
    return 0
  }

  const estimatedTotal = computeEstimatedPath(structure, answers).length
  if (estimatedTotal === 0) {
    return 0
  }

  const progress = Math.round((answeredCount / estimatedTotal) * 100)

  // Clamp to [0, 100]
  return Math.min(100, Math.max(0, progress))
}
