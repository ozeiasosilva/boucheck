import type { HttpContext } from '@adonisjs/core/http'
import { ruleValidator } from '../validators/rule_validators.js'
import ruleService, {
  NotFoundError,
  RuleNotFoundError,
  SelfRuleError,
  BackwardRuleError,
  CyclicRuleError,
  RuleOnOpenQuestionError,
} from '../services/rule_service.js'

export default class RulesController {
  /**
   * POST /api/admin/rules
   *
   * Creates a new cascade rule attached to an answer option.
   * Req 16.1, 16.2, 16.3, 17.1, 17.2, 17.3, 20.2, 22.4
   */
  async store({ request, response }: HttpContext) {
    const input = await request.validateUsing(ruleValidator)

    try {
      const rule = await ruleService.create(input)
      return response.created(rule)
    } catch (error) {
      if (error instanceof RuleOnOpenQuestionError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof SelfRuleError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof BackwardRuleError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof CyclicRuleError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof NotFoundError) {
        return response.unprocessableEntity({ error: error.message })
      }
      throw error
    }
  }

  /**
   * GET /api/admin/rules/:id
   *
   * Returns a single rule by id.
   * Req 22.4
   */
  async show({ params, response }: HttpContext) {
    try {
      const rule = await ruleService.get(Number(params.id))
      return response.ok(rule)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Rule not found' })
      }
      throw error
    }
  }

  /**
   * PUT /api/admin/rules/:id
   *
   * Updates an existing cascade rule.
   * Req 16.1, 16.2, 17.1, 17.2, 17.3, 22.4
   */
  async update({ params, request, response }: HttpContext) {
    const input = await request.validateUsing(ruleValidator)

    try {
      const rule = await ruleService.update(Number(params.id), input)
      return response.ok(rule)
    } catch (error) {
      if (error instanceof RuleNotFoundError || error instanceof NotFoundError) {
        return response.notFound({ error: 'Rule not found' })
      }
      if (error instanceof RuleOnOpenQuestionError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof SelfRuleError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof BackwardRuleError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof CyclicRuleError) {
        return response.unprocessableEntity({ error: error.message })
      }
      throw error
    }
  }

  /**
   * DELETE /api/admin/rules/:id
   *
   * Deletes a cascade rule.
   * Req 22.4
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await ruleService.delete(Number(params.id))
      return response.noContent()
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: 'Rule not found' })
      }
      throw error
    }
  }

  /**
   * GET /api/admin/surveys/:surveyId/flow
   *
   * Returns the flow visualization for a survey.
   * Req 19.1, 19.2, 22.4
   */
  async flow({ params, response }: HttpContext) {
    const result = await ruleService.flow(Number(params.surveyId))
    return response.ok(result)
  }
}
