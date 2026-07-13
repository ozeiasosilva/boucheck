import type { Question, Option, Rule, Answer, SurveyStructure } from './types'

// ---------------------------------------------------------------------------
// Priority resolution for `multipla_escolha` (Req 5.6)
// ---------------------------------------------------------------------------

/**
 * Gathers the rules attached to every selected option and returns the one
 * with the numerically lowest `priority` (lower number = higher precedence).
 * Returns `null` when none of the selected options carry a rule.
 */
export function resolveMultipleRules(
  selectedOptionIds: number[],
  options: Option[]
): Rule | null {
  const applicableRules = selectedOptionIds
    .flatMap((optId) => options.find((o) => o.id === optId)?.rules ?? [])
    .sort((a, b) => a.priority - b.priority)

  return applicableRules.length > 0 ? applicableRules[0] : null
}

// ---------------------------------------------------------------------------
// Next-question determination (Req 5.3, 5.4, 5.5, 5.6)
// ---------------------------------------------------------------------------

/**
 * Returns the next question by ascending `ordem`, or undefined if current is last.
 */
function findNextByOrdem(
  currentQuestion: Question,
  allQuestions: Question[]
): Question | undefined {
  const currentIdx = allQuestions.findIndex((q) => q.id === currentQuestion.id)
  return allQuestions[currentIdx + 1]
}

/**
 * Determines the next question id given the current question and the answer.
 *
 * - If the applicable rule has `finalizar: true` → returns `null` (end of path).
 * - If the applicable rule has a non-null `next_question_id` → returns it.
 * - Otherwise → returns the next question by ascending `ordem`, or `null`.
 */
export function determineNext(
  currentQuestion: Question,
  answer: Answer,
  allQuestions: Question[]
): number | null {
  const rule = resolveMultipleRules(answer.selectedOptionIds, currentQuestion.options)

  if (rule?.finalizar) {
    return null
  }

  if (rule && rule.next_question_id !== null) {
    return rule.next_question_id
  }

  return findNextByOrdem(currentQuestion, allQuestions)?.id ?? null
}

// ---------------------------------------------------------------------------
// NavigationEngine class (Req 5.2, 5.3, 5.4, 5.5, 5.6, 5.7)
// ---------------------------------------------------------------------------

export class NavigationEngine {
  private structure: SurveyStructure | null = null

  /** Initialize with the full survey structure */
  init(structure: SurveyStructure): void {
    this.structure = structure
  }

  /** Get the sorted questions array */
  getQuestions(): Question[] {
    if (!this.structure) throw new Error('NavigationEngine not initialized')
    return [...this.structure.questions].sort((a, b) => a.ordem - b.ordem)
  }

  /**
   * Given current question and all answers so far, determine the next question.
   * Returns null when the path ends (go to checklist/completion).
   */
  getNextQuestion(currentQuestionId: number, answers: Map<number, Answer>): number | null {
    const questions = this.getQuestions()
    const current = questions.find((q) => q.id === currentQuestionId)
    if (!current) return null

    const answer = answers.get(currentQuestionId)
    if (!answer) {
      // No answer yet — advance sequentially
      const next = questions.find((q) => q.ordem > current.ordem)
      return next?.id ?? null
    }

    return determineNext(current, answer, questions)
  }

  /** Get the previous question on the answered path */
  getPreviousQuestion(currentQuestionId: number, answeredPath: number[]): number | null {
    const idx = answeredPath.indexOf(currentQuestionId)
    if (idx <= 0) return null
    return answeredPath[idx - 1]
  }
}
