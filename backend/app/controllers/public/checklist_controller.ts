import type { HttpContext } from '@adonisjs/core/http'
import { checklistValidator } from '#validators/checklist_validator'
import ChecklistItem from '#models/checklist_item'
import ResponseChecklist from '#models/response_checklist'

export default class ChecklistController {
  /**
   * POST /api/public/responses/:token/checklist
   *
   * Persists the Respondent's checklist selections for the current Response_Session.
   * - Validates body via `checklistValidator`.
   * - Verifies every submitted `checklist_item_id` belongs to the session's survey → 422 if not.
   * - Bulk inserts `response_checklist` rows.
   *
   * Validates: Requirements 6.5, 6.6
   */
  async handle({ request, response, response_session }: HttpContext) {
    const session = response_session!

    // Validate request body
    const payload = await request.validateUsing(checklistValidator)

    // Verify all checklist_item_ids belong to the session's survey
    const validItems = await ChecklistItem.query()
      .where('survey_id', session.surveyId)
      .whereIn('id', payload.checklist_item_ids)

    if (validItems.length !== payload.checklist_item_ids.length) {
      return response.status(422).json({
        error: 'checklist_item_not_in_survey',
        message: 'One or more checklist items do not belong to this survey',
      })
    }

    // Remove any previous checklist selections for this session (idempotent)
    await ResponseChecklist.query().where('response_id', session.id).delete()

    // Bulk insert response_checklist rows
    const rows = payload.checklist_item_ids.map((itemId: number) => ({
      responseId: session.id,
      checklistItemId: itemId,
    }))

    await ResponseChecklist.createMany(rows)

    return response.ok({ saved: true })
  }
}
