// ---------------------------------------------------------------------------
// Response Answer Query Helpers
//
// Loads answered choice rows and maturity bands for a given Response_Session.
// These helpers bridge the ORM/database layer with the pure ScoreCalculator
// by mapping persisted response_answers (joined to questions/question_options)
// into the AnsweredChoice[] interface and score_ranges into MaturityBandDef[].
//
// Requirement 1.1: Load Answered_Path answers
// Requirement 2.2: Exclude Open_Questions (tipo = 'aberta') from scoring
// Requirement 2.4: Restrict to the Response_Session's Answered_Path
// ---------------------------------------------------------------------------

import ResponseAnswer from '#models/response_answer'
import Response from '#models/response'
import ScoreRange from '#models/score_range'
import type { AnsweredChoice, MaturityBandDef } from '../services/score_calculator.js'

/**
 * Loads the answered choice rows for a Response_Session, excluding open
 * questions (tipo = 'aberta'), and maps them to the AnsweredChoice[] shape
 * expected by ScoreCalculator.compute.
 *
 * For multipla_escolha questions with multiple selected options, all selected
 * pontuacoes are aggregated into a single AnsweredChoice entry (Req 2.3).
 *
 * @param responseId - The Response_Session identifier
 * @returns AnsweredChoice[] ready for ScoreCalculator.compute
 */
export async function loadAnsweredChoiceRows(responseId: string): Promise<AnsweredChoice[]> {
  // Load all response_answers for this response, preloading the question
  // (for peso, dimensao, tipo) and the selected question_option (for pontuacao).
  // Also preload all options on the question to determine maxOptionPontuacao.
  const answers = await ResponseAnswer.query()
    .where('responseId', responseId)
    .preload('question', (qb) => {
      qb.preload('options')
    })
    .preload('questionOption')

  // Group answers by questionId to handle multipla_escolha with multiple selections
  const byQuestion = new Map<
    number,
    {
      peso: number
      dimensao: string | null
      selectedPontuacoes: number[]
      maxOptionPontuacao: number
    }
  >()

  for (const answer of answers) {
    const question = answer.question

    // Exclude open questions from scoring (Req 2.2)
    if (question.tipo === 'aberta') {
      continue
    }

    // Skip answers without a selected option (shouldn't happen for choice questions
    // but guard defensively)
    if (answer.questionOptionId === null || !answer.questionOption) {
      continue
    }

    const existing = byQuestion.get(answer.questionId)
    if (existing) {
      // multipla_escolha: aggregate additional selected pontuacao (Req 2.3)
      existing.selectedPontuacoes.push(answer.questionOption.pontuacao)
    } else {
      // First (or only) selection for this question
      const maxOptionPontuacao = Math.max(...question.options.map((o) => o.pontuacao))

      byQuestion.set(answer.questionId, {
        peso: question.peso,
        dimensao: question.dimensao,
        selectedPontuacoes: [answer.questionOption.pontuacao],
        maxOptionPontuacao,
      })
    }
  }

  // Map to AnsweredChoice[]
  const result: AnsweredChoice[] = []
  for (const [questionId, data] of byQuestion) {
    result.push({
      questionId,
      peso: data.peso,
      dimensao: data.dimensao,
      selectedPontuacoes: data.selectedPontuacoes,
      maxOptionPontuacao: data.maxOptionPontuacao,
    })
  }

  return result
}

/**
 * Loads the maturity band definitions (score_ranges) for the survey associated
 * with a given Response_Session.
 *
 * @param responseId - The Response_Session identifier
 * @returns MaturityBandDef[] for the response's survey
 */
export async function loadBands(responseId: string): Promise<MaturityBandDef[]> {
  // Load the response to get the survey_id
  const response = await Response.query().where('id', responseId).firstOrFail()

  // Load score_ranges for that survey
  const ranges = await ScoreRange.query().where('surveyId', response.surveyId)

  return ranges.map((r) => ({
    id: r.id,
    min: r.min,
    max: r.max,
  }))
}
