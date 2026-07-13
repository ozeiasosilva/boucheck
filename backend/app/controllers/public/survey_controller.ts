import type { HttpContext } from '@adonisjs/core/http'
import Survey from '#models/survey'
import Question from '#models/question'
import ChecklistItem from '#models/checklist_item'
import env from '#start/env'

const CDN_BASE_URL =
  env.get('CDN_BASE_URL', 'https://cdn.boucheck.beonup.com.br')

export default class SurveyController {
  /**
   * GET /api/public/surveys/:slug
   *
   * Returns landing metadata for an active survey.
   * Requirements: 1.7, 1.8
   */
  async show({ params, response }: HttpContext) {
    const survey = await Survey.query()
      .where('slug', params.slug)
      .where('status', 'ativo')
      .first()

    if (!survey) {
      return response.notFound({ error: 'survey_not_found' })
    }

    const logoUrl = survey.configVisual?.logo_s3_key
      ? survey.configVisual.logo_s3_key === '__default__'
        ? '/logo_completo.png'
        : `${CDN_BASE_URL}/${survey.configVisual.logo_s3_key}`
      : null

    return response.ok({
      id: survey.id,
      slug: survey.slug,
      nome: survey.nome,
      mensagem_objetivo: survey.mensagemObjetivo,
      tempo_estimado_min: survey.tempoEstimadoMin,
      config_visual: survey.configVisual,
      logo_url: logoUrl,
    })
  }

  /**
   * GET /api/public/surveys/:slug/structure
   *
   * Returns the full Survey_Structure (questions, options, rules)
   * for the current survey_version.
   * Requirements: 5.1
   */
  async structure({ params, response }: HttpContext) {
    const survey = await Survey.query()
      .where('slug', params.slug)
      .where('status', 'ativo')
      .first()

    if (!survey) {
      return response.notFound({ error: 'survey_not_found' })
    }

    const questions = await Question.query()
      .where('survey_id', survey.id)
      .where('survey_version', survey.version)
      .preload('options', (optionQuery) => {
        optionQuery.orderBy('ordem', 'asc').preload('rules')
      })
      .orderBy('ordem', 'asc')

    const checklistItems = await ChecklistItem.query()
      .where('survey_id', survey.id)
      .orderBy('nome', 'asc')

    return response.ok({
      survey_id: survey.id,
      survey_version: survey.version,
      questions: questions.map((q) => ({
        id: q.id,
        texto: q.texto,
        descricao: q.descricao,
        tipo: q.tipo,
        obrigatoria: q.obrigatoria,
        ordem: q.ordem,
        options: q.options.map((opt) => ({
          id: opt.id,
          texto: opt.texto,
          ordem: opt.ordem,
          rules: opt.rules.map((rule) => ({
            next_question_id: rule.nextQuestionId,
            finalizar: rule.finalizar,
            priority: rule.priority,
          })),
        })),
      })),
      has_checklist: checklistItems.length > 0,
      checklist_items: checklistItems.map((item) => ({
        id: item.id,
        nome: item.nome,
        grupo: item.grupo,
      })),
    })
  }
}
