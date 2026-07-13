import type { HttpContext } from '@adonisjs/core/http'
import { createQuestionValidator, updateQuestionValidator, reorderQuestionsValidator } from '../validators/question_validators.js'
import questionService, {
  NotFoundError,
  DuplicateOrdemError,
} from '../services/question_service.js'
import { StructureChangeRequiresConfirmationError } from '../services/survey_service.js'
import Question from '#models/question'

export default class QuestionsController {
  /**
   * GET /api/admin/surveys/:surveyId/questions
   *
   * Lists all questions for a survey, ordered by ordem, with their options.
   */
  async index({ params, response }: HttpContext) {
    const questions = await Question.query()
      .where('survey_id', Number(params.surveyId))
      .preload('options', (q) => q.orderBy('ordem', 'asc'))
      .orderBy('ordem', 'asc')

    const result = questions.map((q) => ({
      id: q.id,
      survey_id: q.surveyId,
      texto: q.texto,
      descricao: q.descricao,
      tipo: q.tipo,
      obrigatoria: q.obrigatoria,
      ordem: q.ordem,
      peso: q.peso,
      dimensao: q.dimensao,
      created_at: q.createdAt?.toISO() ?? null,
      options: q.options.map((o) => ({
        id: o.id,
        question_id: o.questionId,
        texto: o.texto,
        pontuacao: o.pontuacao,
        ordem: o.ordem,
      })),
    }))

    return response.ok(result)
  }

  /**
   * POST /api/admin/surveys/:surveyId/questions
   *
   * Creates a new question associated with the given survey.
   * Req 10.1, 10.2, 10.6, 10.7, 10.8
   */
  async store({ params, request, response }: HttpContext) {
    const input = await request.validateUsing(createQuestionValidator)
    const confirmed = request.input('confirmed', false)

    try {
      const question = await questionService.create(Number(params.surveyId), input, { confirmed })
      return response.created(question)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: error.message })
      }
      if (error instanceof StructureChangeRequiresConfirmationError) {
        return response.conflict({ error: error.message })
      }
      throw error
    }
  }

  /**
   * GET /api/admin/questions/:id
   *
   * Returns a single question by id.
   */
  async show({ params, response }: HttpContext) {
    const question = await Question.find(Number(params.id))
    if (!question) {
      return response.notFound({ error: 'Question not found' })
    }

    return response.ok({
      id: question.id,
      survey_id: question.surveyId,
      survey_version: question.surveyVersion,
      texto: question.texto,
      descricao: question.descricao,
      tipo: question.tipo,
      obrigatoria: question.obrigatoria,
      ordem: question.ordem,
      peso: question.peso,
      dimensao: question.dimensao,
      created_at: question.createdAt?.toISO() ?? null,
      updated_at: question.updatedAt?.toISO() ?? null,
    })
  }

  /**
   * PUT /api/admin/questions/:id
   *
   * Updates an existing question's fields.
   * Req 1.3, 10.1, 10.2
   */
  async update({ params, request, response }: HttpContext) {
    const input = await request.validateUsing(updateQuestionValidator)
    const confirmed = request.input('confirmed', false)

    try {
      const question = await questionService.update(Number(params.id), input, { confirmed })
      return response.ok(question)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: error.message })
      }
      if (error instanceof StructureChangeRequiresConfirmationError) {
        return response.conflict({ error: error.message })
      }
      throw error
    }
  }

  /**
   * DELETE /api/admin/questions/:id
   *
   * Deletes a question. Handles draft (physical delete) and Has_Responses (versioned) paths.
   * Req 13.1, 13.2
   */
  async destroy({ params, request, response }: HttpContext) {
    const confirmed = request.input('confirmed', false)

    try {
      await questionService.delete(Number(params.id), { confirmed })
      return response.noContent()
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: error.message })
      }
      if (error instanceof StructureChangeRequiresConfirmationError) {
        return response.conflict({ error: error.message })
      }
      throw error
    }
  }

  /**
   * PUT /api/admin/surveys/:surveyId/questions/reorder
   *
   * Reorders questions within a survey by persisting submitted ordem values.
   * Req 12.1, 12.2, 18.2
   */
  async reorder({ params, request, response }: HttpContext) {
    const { ordem } = await request.validateUsing(reorderQuestionsValidator)
    const confirmed = request.input('confirmed', false)

    try {
      const questions = await questionService.reorder(Number(params.surveyId), ordem, { confirmed })
      return response.ok(questions)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: error.message })
      }
      if (error instanceof DuplicateOrdemError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof StructureChangeRequiresConfirmationError) {
        return response.conflict({ error: error.message })
      }
      throw error
    }
  }
}
