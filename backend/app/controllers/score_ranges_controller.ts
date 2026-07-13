import type { HttpContext } from '@adonisjs/core/http'
import scoreRangeService, {
  ScoreRangeBoundsError,
  ScoreRangeOverlapError,
  ScoreRangeNotFoundError,
} from '../services/score_range_service.js'
import { scoreRangeValidator } from '../validators/score_range_validators.js'

export default class ScoreRangesController {
  /**
   * GET /api/admin/surveys/:surveyId/score-ranges
   *
   * Lists all score ranges for a survey.
   */
  async index({ params, response }: HttpContext) {
    const ranges = await scoreRangeService.list(Number(params.surveyId))
    return response.ok(ranges)
  }

  /**
   * POST /api/admin/surveys/:surveyId/score-ranges
   *
   * Creates a new score range for the survey.
   * Req 21.1 — 201 on success, 422 if bounds invalid or overlap detected.
   */
  async store({ params, request, response }: HttpContext) {
    const input = await request.validateUsing(scoreRangeValidator)

    try {
      const range = await scoreRangeService.create(Number(params.surveyId), input)
      return response.created(range)
    } catch (error) {
      if (error instanceof ScoreRangeBoundsError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof ScoreRangeOverlapError) {
        return response.unprocessableEntity({ error: error.message })
      }
      throw error
    }
  }

  /**
   * PUT /api/admin/score-ranges/:id
   *
   * Updates an existing score range.
   * Req 21.2 — 200 on success, 404 if not found, 422 if bounds invalid or overlap.
   */
  async update({ params, request, response }: HttpContext) {
    const input = await request.validateUsing(scoreRangeValidator)

    try {
      const range = await scoreRangeService.update(Number(params.id), input)
      return response.ok(range)
    } catch (error) {
      if (error instanceof ScoreRangeNotFoundError) {
        return response.notFound({ error: error.message })
      }
      if (error instanceof ScoreRangeBoundsError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof ScoreRangeOverlapError) {
        return response.unprocessableEntity({ error: error.message })
      }
      throw error
    }
  }

  /**
   * DELETE /api/admin/score-ranges/:id
   *
   * Deletes a score range.
   * Req 21.2 — 204 on success, 404 if not found.
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await scoreRangeService.delete(Number(params.id))
      return response.noContent()
    } catch (error) {
      if (error instanceof ScoreRangeNotFoundError) {
        return response.notFound({ error: error.message })
      }
      throw error
    }
  }
}
