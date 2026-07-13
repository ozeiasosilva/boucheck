import type { HttpContext } from '@adonisjs/core/http'
import checklistService, { NotFoundError } from '../services/checklist_service.js'
import { checklistItemValidator, importChecklistValidator } from '../validators/checklist_validators.js'

export default class ChecklistItemsController {
  /**
   * GET /api/admin/surveys/:surveyId/checklist-items
   *
   * Lists all checklist items for a survey.
   * Req 14.4 — zero items is a valid configuration.
   */
  async index({ params, response }: HttpContext) {
    const items = await checklistService.list(Number(params.surveyId))
    return response.ok(items)
  }

  /**
   * POST /api/admin/surveys/:surveyId/checklist-items
   *
   * Creates a new checklist item under the survey.
   * Req 14.1, 14.2 — 201 on success, 404 if survey not found.
   */
  async store({ params, request, response }: HttpContext) {
    const { nome, grupo } = await request.validateUsing(checklistItemValidator)

    try {
      const item = await checklistService.create(Number(params.surveyId), nome, grupo)
      return response.created(item)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: error.message })
      }
      throw error
    }
  }

  /**
   * PUT /api/admin/checklist-items/:id
   *
   * Updates an existing checklist item.
   * Req 14.3 — 200 on success, 404 if not found.
   */
  async update({ params, request, response }: HttpContext) {
    const input = await request.validateUsing(checklistItemValidator)

    try {
      const item = await checklistService.update(Number(params.id), input)
      return response.ok(item)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: error.message })
      }
      throw error
    }
  }

  /**
   * DELETE /api/admin/checklist-items/:id
   *
   * Deletes a checklist item.
   * Req 14.3 — 204 on success, 404 if not found.
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await checklistService.delete(Number(params.id))
      return response.noContent()
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: error.message })
      }
      throw error
    }
  }

  /**
   * POST /api/admin/surveys/:surveyId/checklist-items/import
   *
   * Imports checklist items from a source survey into this survey.
   * Req 15 — 201 on success, 404 if source survey not found.
   */
  async import({ params, request, response }: HttpContext) {
    const { source_survey_id } = await request.validateUsing(importChecklistValidator)

    try {
      const items = await checklistService.import(Number(params.surveyId), source_survey_id)
      return response.created(items)
    } catch (error) {
      if (error instanceof NotFoundError) {
        return response.notFound({ error: error.message })
      }
      throw error
    }
  }
}
