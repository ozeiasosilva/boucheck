import Question from '#models/question'
import ResponseAnswer from '#models/response_answer'
import type QuestionOption from '#models/question_option'
import type QuestionRule from '#models/question_rule'

// ---------------------------------------------------------------------------
// Navigation Validator (Req 5.6, 5.8, 5.9)
//
// Backend port of the frontend Navigation_Engine's deterministic
// next-question resolution (`determineNext` / `resolveMultipleRules`), plus
// `revalidateAnsweredPath` which replays that same logic server-side to
// confirm a Response_Session's persisted answers form a valid Answered_Path
// before completion (Req 5.8, 5.9).
//
// The pure graph-walking logic operates on plain `Nav*` shapes rather than
// Lucid model instances so it can be unit/property tested without a database.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavRule {
  nextQuestionId: number | null
  finalizar: boolean
  priority: number
}

export interface NavOption {
  id: number
  rules: NavRule[]
}

export interface NavQuestion {
  id: number
  tipo: 'escolha_unica' | 'multipla_escolha' | 'aberta'
  obrigatoria: boolean
  ordem: number
  options: NavOption[]
}

export interface NavAnswer {
  questionId: number
  selectedOptionIds: number[]
  textoLivre: string | null
}

/** Raw persisted answer row shape, decoupled from the Lucid model. */
export interface RawAnswerRow {
  questionId: number
  questionOptionId: number | null
  textoLivre: string | null
}

// ---------------------------------------------------------------------------
// Priority resolution for `multipla_escolha` (Req 5.6)
// ---------------------------------------------------------------------------

/**
 * Gathers the rules attached to every selected option and returns the one
 * with the numerically lowest `priority` (lower number = higher precedence).
 * Returns `null` when none of the selected options carry a rule.
 *
 * This also correctly resolves the `escolha_unica` case (a single selected
 * option): the general priority-based selection collapses to "that option's
 * lowest-priority rule" when only one option id is provided.
 */
export function resolveMultipleRules(
  selectedOptionIds: number[],
  options: NavOption[]
): NavRule | null {
  const applicableRules = selectedOptionIds
    .flatMap((optionId) => options.find((option) => option.id === optionId)?.rules ?? [])
    .sort((a, b) => a.priority - b.priority)

  return applicableRules.length > 0 ? applicableRules[0] : null
}

// ---------------------------------------------------------------------------
// Next-question determination (Req 5.3, 5.4, 5.5, 5.6)
// ---------------------------------------------------------------------------

/**
 * Returns the question immediately following `currentQuestion` in ascending
 * `ordem` order, or `undefined` when `currentQuestion` is the last question.
 */
function findNextQuestionByOrdem(
  currentQuestion: NavQuestion,
  allQuestions: NavQuestion[]
): NavQuestion | undefined {
  const currentIdx = allQuestions.findIndex((q) => q.id === currentQuestion.id)
  return allQuestions[currentIdx + 1]
}

/**
 * Determines the next question id given the current question and the
 * respondent's answer to it.
 *
 * - If the applicable rule has `finalizar: true` → returns `null` (end of
 *   path — go to checklist/completion).
 * - If the applicable rule has a non-null `next_question_id` → returns it.
 * - Otherwise → returns the next question by ascending `ordem`, or `null`
 *   when there is none.
 */
export function determineNext(
  currentQuestion: NavQuestion,
  answer: NavAnswer,
  allQuestions: NavQuestion[]
): number | null {
  const rule = resolveMultipleRules(answer.selectedOptionIds, currentQuestion.options)

  if (rule?.finalizar) {
    return null
  }

  if (rule && rule.nextQuestionId !== null) {
    return rule.nextQuestionId
  }

  return findNextQuestionByOrdem(currentQuestion, allQuestions)?.id ?? null
}

// ---------------------------------------------------------------------------
// Answer map construction
// ---------------------------------------------------------------------------

/**
 * Groups raw persisted answer rows by `questionId` into `NavAnswer`s.
 * `multipla_escolha` questions may have several rows (one per selected
 * option); `escolha_unica` has one; `aberta` has one carrying `textoLivre`.
 */
export function buildAnswerMap(rows: RawAnswerRow[]): Map<number, NavAnswer> {
  const answerMap = new Map<number, NavAnswer>()

  for (const row of rows) {
    const existing = answerMap.get(row.questionId)

    if (!existing) {
      answerMap.set(row.questionId, {
        questionId: row.questionId,
        selectedOptionIds: row.questionOptionId !== null ? [row.questionOptionId] : [],
        textoLivre: row.textoLivre,
      })
      continue
    }

    if (row.questionOptionId !== null) {
      existing.selectedOptionIds.push(row.questionOptionId)
    }
    if (row.textoLivre !== null) {
      existing.textoLivre = row.textoLivre
    }
  }

  return answerMap
}

// ---------------------------------------------------------------------------
// Deterministic path walk + validity check (Req 5.8, 5.9)
// ---------------------------------------------------------------------------

/**
 * Pure implementation of the completion revalidation algorithm. Walks the
 * survey structure deterministically from the first question (by `ordem`),
 * using `determineNext` for answered questions and sequential `ordem`
 * advancement for unanswered optional questions, then verifies:
 *
 * 1. No answered question falls outside the resulting expected path.
 * 2. Every mandatory question on the expected path has an answer.
 *
 * `allQuestions` MUST already be sorted by ascending `ordem`.
 */
export function computeAnsweredPathValidity(
  allQuestions: NavQuestion[],
  answerMap: Map<number, NavAnswer>
): boolean {
  if (allQuestions.length === 0) {
    return answerMap.size === 0
  }

  const questionsById = new Map(allQuestions.map((q) => [q.id, q]))
  const expectedPath: number[] = []
  const visited = new Set<number>()

  let current: NavQuestion | undefined = allQuestions[0]

  while (current) {
    if (visited.has(current.id)) {
      // The rule graph is assumed acyclic (Req 5.7); encountering a repeat
      // means that assumption was violated. We cannot trust the walk.
      return false
    }
    visited.add(current.id)
    expectedPath.push(current.id)

    const answer = answerMap.get(current.id)

    if (!answer) {
      if (current.obrigatoria) {
        // Mandatory question without an answer → invalid path.
        return false
      }
      // Optional skipped question — advance sequentially.
      current = findNextQuestionByOrdem(current, allQuestions)
      continue
    }

    const nextId = determineNext(current, answer, allQuestions)
    if (nextId === null) {
      // End of path (finalizar rule or last question).
      break
    }

    current = questionsById.get(nextId)
    // If `nextId` doesn't resolve within this survey/version's questions,
    // treat it as the end of the reachable path.
  }

  const expectedPathSet = new Set(expectedPath)

  // Every answered question must be on the expected path.
  for (const questionId of answerMap.keys()) {
    if (!expectedPathSet.has(questionId)) {
      return false
    }
  }

  // Every mandatory question on the expected path must have an answer.
  for (const questionId of expectedPath) {
    const question = questionsById.get(questionId)
    if (question?.obrigatoria && !answerMap.has(questionId)) {
      return false
    }
  }

  return true
}

// ---------------------------------------------------------------------------
// Lucid model → plain Nav* mapping
// ---------------------------------------------------------------------------

function toNavRule(rule: QuestionRule): NavRule {
  return {
    nextQuestionId: rule.nextQuestionId,
    finalizar: rule.finalizar,
    priority: rule.priority,
  }
}

function toNavOption(option: QuestionOption): NavOption {
  return {
    id: option.id,
    rules: (option.rules ?? []).map(toNavRule),
  }
}

function toNavQuestion(question: Question): NavQuestion {
  return {
    id: question.id,
    tipo: question.tipo,
    obrigatoria: question.obrigatoria,
    ordem: question.ordem,
    options: (question.options ?? []).map(toNavOption),
  }
}

// ---------------------------------------------------------------------------
// revalidateAnsweredPath (Req 5.8, 5.9)
// ---------------------------------------------------------------------------

/**
 * Fetches the survey structure (questions + options + rules) for the given
 * survey/version and the persisted answers for `responseId`, then verifies
 * the persisted answers form a valid Answered_Path.
 *
 * Returns `true` when the path is valid; `false` otherwise (invalid path
 * or mandatory question left unanswered).
 */
export async function revalidateAnsweredPath(
  responseId: string,
  surveyId: number,
  surveyVersion: number
): Promise<boolean> {
  const questions = await Question.query()
    .where('survey_id', surveyId)
    .where('survey_version', surveyVersion)
    .preload('options', (optionsQuery) => optionsQuery.preload('rules'))
    .orderBy('ordem', 'asc')

  const answerRows = await ResponseAnswer.query().where('response_id', responseId)

  const navQuestions = questions.map(toNavQuestion)
  const answerMap = buildAnswerMap(
    answerRows.map((row) => ({
      questionId: row.questionId,
      questionOptionId: row.questionOptionId,
      textoLivre: row.textoLivre,
    }))
  )

  return computeAnsweredPathValidity(navQuestions, answerMap)
}
