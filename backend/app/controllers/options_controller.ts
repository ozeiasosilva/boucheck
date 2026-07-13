import type { HttpContext } from '@adonisjs/core/http'
import { optionValidator } from '../validators/option_validators.js'
import questionService, {
  NotFoundError,
  OptionLimitError,
  OptionOnOpenQuestionError,
} from '../services/question_service.js'
import { StructureChangeRequiresConfirmationError } from '../services/survey_service.js'

export default class OptionsController {
  /**
   * POST /api/admin/questions/:questionId/options
   *
   * Adds an option to a question.
   * Req 11.1, 11.2, 11.4, 11.5
   */
  async store({ params, request, response }: HttpContext) {
    const input = await request.validateUsing(optionValidator)
    const confirmed = request.input('confirmed', false)

    try {
      const option = await questionService.addOption(Number(params.questionId), input, { confirmed })
      return response.created(option)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: error.message })
      }
      if (error instanceof OptionLimitError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof OptionOnOpenQuestionError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof StructureChangeRequiresConfirmationError) {
        return response.conflict({ error: error.message })
      }
      throw error
    }
  }

  /**
   * PUT /api/admin/options/:id
   *
   * Updates an existing option's fields.
   * Req 11.1, 11.2
   */
  async update({ params, request, response }: HttpContext) {
    const input = await request.validateUsing(optionValidator)
    const confirmed = request.input('confirmed', false)

    try {
      const option = await questionService.updateOption(Number(params.id), input, { confirmed })
      return response.ok(option)
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
   * DELETE /api/admin/options/:id
   *
   * Deletes an existing option.
   * Req 11.1
   */
  async destroy({ params, request, response }: HttpContext) {
    const confirmed = request.input('confirmed', false)

    try {
      await questionService.deleteOption(Number(params.id), { confirmed })
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
}
