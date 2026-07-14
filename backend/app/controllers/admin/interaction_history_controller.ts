import type { HttpContext } from '@adonisjs/core/http'
import { createInteractionValidator } from '#validators/insight_validators'
import interactionHistoryService from '#services/interaction_history_service'

export default class InteractionHistoryController {
  /**
   * GET /api/admin/responses/:responseId/interactions
   *
   * Lists interaction history entries for a given response,
   * paginated and ordered by created_at DESC.
   * Req 3.1, 3.4
   */
  async index({ params, request, response }: HttpContext) {
    const responseId = params.responseId
    const page = request.input('page', 1)

    const result = await interactionHistoryService.list(responseId, page)

    return response.ok({
      data: result.data,
      meta: result.meta,
    })
  }

  /**
   * POST /api/admin/responses/:responseId/interactions
   *
   * Creates a new interaction history entry (append-only, immutable).
   * Req 3.2, 3.6, 3.7
   */
  async store({ params, request, response, auth }: HttpContext) {
    const responseId = params.responseId
    const { tipo, observacao } = await request.validateUsing(createInteractionValidator)

    const record = await interactionHistoryService.create({
      responseId,
      adminUserId: auth.user!.id,
      tipo,
      observacao,
    })

    return response.created(record)
  }
}
