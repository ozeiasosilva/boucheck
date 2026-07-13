// ---------------------------------------------------------------------------
// ReportGenerator — Assembles the diagnostic report content
//
// Orchestrates loading of Response/Survey/Faixa data, re-derives dimension
// scores via ScoreCalculator.compute, calls RecommendationGenerator.generate,
// and builds the ReportContext passed to renderReportHtml.
//
// Requirements covered:
//   6.1 — Include Visual_Identity, nome, empresa, score, band, answers, recommendation
//   6.4 — Include BOTH choice AND open questions in the answer summary
//   4.4 — Include radar-chart data when dimension scores exist
//   4.5 — Omit radar-chart data when zero dimension scores exist
// ---------------------------------------------------------------------------

import Response from '#models/response'
import ResponseAnswer from '#models/response_answer'
import AdminUser from '#models/admin_user'
import { ScoreCalculator } from './score_calculator.js'
import { loadAnsweredChoiceRows, loadBands } from '../support/response_answer_queries.js'
import { renderReportHtml } from '../support/report_html_template.js'
import type { ReportContext } from '../support/report_html_template.js'
import type { RecommendationGenerator } from './recommendation_generator.js'

// Re-export ReportContext for consumers
export type { ReportContext } from '../support/report_html_template.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BEONUP_CONTACT = 'BeOnUp — contato@beonup.com.br'
const SYSTEM_ADMIN_EMAIL = 'system@boucheck.internal'
const DEFAULT_LINK_AGENDAMENTO = '#'
const DEFAULT_FALLBACK_TEXT = 'Parabéns por completar o diagnóstico. Entre em contato com um consultor BeOnUp para obter recomendações personalizadas.'

// ---------------------------------------------------------------------------
// ReportGenerator
// ---------------------------------------------------------------------------

export class ReportGenerator {
  constructor(private recommendationGenerator: RecommendationGenerator) {}

  /**
   * Assembles the full report context and renders the HTML for a given
   * Response_Session.
   *
   * Steps:
   * 1. Load Response (+ survey, faixa) and the full Answered_Path (choice AND
   *    open questions — Req 6.4)
   * 2. Re-derive dimension scores via ScoreCalculator.compute from choice
   *    questions only (for radar-chart data)
   * 3. Call RecommendationGenerator.generate to obtain recommendationText
   * 4. Build the ReportContext and render via renderReportHtml
   * 5. Return both the HTML and the context
   */
  async assemble(responseId: string): Promise<{ html: string; context: ReportContext }> {
    // -----------------------------------------------------------------------
    // Step 1: Load Response with survey and faixa
    // -----------------------------------------------------------------------
    const response = await Response.query()
      .where('id', responseId)
      .preload('survey')
      .preload('faixa')
      .firstOrFail()

    const survey = response.survey

    // Load the FULL Answered_Path (choice + open questions) for the answer summary (Req 6.4)
    const allAnswers = await ResponseAnswer.query()
      .where('responseId', responseId)
      .preload('question')
      .preload('questionOption')

    // -----------------------------------------------------------------------
    // Step 2: Re-derive dimension scores via ScoreCalculator
    // -----------------------------------------------------------------------
    const choiceRows = await loadAnsweredChoiceRows(responseId)
    const bands = await loadBands(responseId)
    const scoreResult = ScoreCalculator.compute(choiceRows, bands)

    // Build dimensionScores array for the ReportContext (Req 4.4, 4.5)
    const dimensionScores: Array<{ dimensao: string; normalized: number }> = []
    for (const [dimensao, data] of scoreResult.dimensionScores) {
      dimensionScores.push({ dimensao, normalized: data.normalized })
    }

    // -----------------------------------------------------------------------
    // Step 3: Build answerSummary from ALL answered questions (Req 6.4)
    // -----------------------------------------------------------------------
    const answerSummary = buildAnswerSummary(allAnswers)

    // -----------------------------------------------------------------------
    // Step 4: Call RecommendationGenerator
    // -----------------------------------------------------------------------
    // Determine fallback text: faixa descricao or a generic default
    const bandFallbackText = response.faixa?.descricao || DEFAULT_FALLBACK_TEXT

    // Load system admin user id for ai_generation_logs
    const systemAdmin = await AdminUser.query()
      .where('email', SYSTEM_ADMIN_EMAIL)
      .first()

    const recommendationText = await this.recommendationGenerator.generate({
      surveyId: survey.id,
      usarIaNoRelatorio: survey.usarIaNoRelatorio,
      answerSummary,
      bandFallbackText,
      adminUserIdForLog: systemAdmin?.id ?? null,
    })

    // -----------------------------------------------------------------------
    // Step 5: Build ReportContext and render HTML
    // -----------------------------------------------------------------------
    const configVisual = survey.configVisual

    const band: ReportContext['band'] = response.faixa
      ? { nome: response.faixa.nome, descricao: response.faixa.descricao || '' }
      : null

    const context: ReportContext = {
      response: {
        nome: response.nome,
        empresa: response.empresa,
      },
      visualIdentity: {
        corPrimaria: configVisual?.cor_primaria ?? undefined,
        corSecundaria: configVisual?.cor_secundaria ?? undefined,
        corFundo: configVisual?.cor_fundo ?? undefined,
        logoS3Key: configVisual?.logo_s3_key ?? undefined,
      },
      normalizedScore: scoreResult.normalizedScore,
      band,
      dimensionScores,
      answerSummary,
      recommendationText,
      footer: {
        contact: BEONUP_CONTACT,
        linkAgendamento: survey.linkAgendamento || DEFAULT_LINK_AGENDAMENTO,
      },
    }

    const html = renderReportHtml(context)

    return { html, context }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the answer summary from ALL response_answers (choice AND open
 * questions). For choice questions, the answer text is the selected option's
 * texto. For open questions, the answer text is the free-text response.
 *
 * Multiple selections for a multipla_escolha question are grouped into a
 * single summary entry with answers joined by "; ".
 */
function buildAnswerSummary(
  answers: ResponseAnswer[]
): Array<{ questionText: string; answerText: string }> {
  // Group answers by questionId to handle multipla_escolha
  const grouped = new Map<
    number,
    { questionText: string; answerTexts: string[]; ordem: number }
  >()

  for (const answer of answers) {
    const question = answer.question

    const existing = grouped.get(answer.questionId)
    if (existing) {
      // Additional selection for multipla_escolha
      if (answer.questionOption) {
        existing.answerTexts.push(answer.questionOption.texto)
      } else if (answer.textoLivre) {
        existing.answerTexts.push(answer.textoLivre)
      }
    } else {
      let answerText: string
      if (question.tipo === 'aberta') {
        // Open question: use the free-text response
        answerText = answer.textoLivre || ''
      } else {
        // Choice question: use the selected option text
        answerText = answer.questionOption?.texto || ''
      }

      grouped.set(answer.questionId, {
        questionText: question.texto,
        answerTexts: [answerText],
        ordem: question.ordem,
      })
    }
  }

  // Sort by question order and build the final array
  const sorted = [...grouped.values()].sort((a, b) => a.ordem - b.ordem)

  return sorted.map((entry) => ({
    questionText: entry.questionText,
    answerText: entry.answerTexts.join('; '),
  }))
}
