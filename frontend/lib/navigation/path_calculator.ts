import type { Answer, Question, SurveyStructure } from './types'
import { determineNext } from './engine'

// ---------------------------------------------------------------------------
// Path Calculator (Req 4.9, 5.7)
//
// Pure functions that compute the forward path from a given question and
// determine which previously-answered questions become invalidated when an
// answer changes on the conditional branching path.
// ---------------------------------------------------------------------------

/**
 * Walks forward through the survey structure starting from `startQuestionId`
 * using `startAnswer` for the starting question, then assuming sequential
 * advancement (next by `ordem`) for all subsequent questions without known
 * answers.
 *
 * If `answers` is provided, it will use those answers to determine the path
 * for questions that have already been answered. For questions without answers,
 * sequential advancement is assumed.
 *
 * Returns an array of question IDs reachable from the starting question
 * (excluding the start question itself).
 */
export function computeForwardPath(
  startQuestionId: number,
  startAnswer: Answer,
  structure: SurveyStructure,
  answers?: Map<number, Answer>
): number[] {
  const questions = [...structure.questions].sort((a, b) => a.ordem - b.ordem)
  const questionsById = new Map<number, Question>(questions.map((q) => [q.id, q]))

  const startQuestion = questionsById.get(startQuestionId)
  if (!startQuestion) return []

  // Determine the first next question from the start using the provided answer
  const firstNextId = determineNext(startQuestion, startAnswer, questions)
  if (firstNextId === null) return []

  const forwardPath: number[] = []
  const visited = new Set<number>()

  let currentId: number | null = firstNextId

  while (currentId !== null) {
    if (visited.has(currentId)) {
      // Guard against cycles (should not happen per Req 5.7, but defensive)
      break
    }

    const currentQuestion = questionsById.get(currentId)
    if (!currentQuestion) break

    visited.add(currentId)
    forwardPath.push(currentId)

    // Check if we have an answer for this question
    const answer = answers?.get(currentId)

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

  return forwardPath
}

/**
 * Given a changed answer at `changedQuestionId`, computes which questions on
 * the old answered path tail (questions after the changed one) are no longer
 * reachable under the new forward path.
 *
 * Returns the question IDs that should be invalidated (their persisted answers
 * should be deleted from the Response_Session).
 */
export function getInvalidatedQuestions(
  changedQuestionId: number,
  newAnswer: Answer,
  answeredPath: number[],
  structure: SurveyStructure
): number[] {
  const changeIdx = answeredPath.indexOf(changedQuestionId)
  if (changeIdx === -1) return []

  // Questions after the changed one on the old path
  const tailQuestions = answeredPath.slice(changeIdx + 1)

  // Compute new forward path from changedQuestion with newAnswer
  const newForwardPath = computeForwardPath(changedQuestionId, newAnswer, structure)

  // Invalidated = old tail questions that are NOT on the new forward path
  const newForwardSet = new Set(newForwardPath)
  return tailQuestions.filter((qId) => !newForwardSet.has(qId))
}
