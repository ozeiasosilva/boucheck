import vine from '@vinejs/vine'

/**
 * POST /api/public/responses/{token}/checklist
 *
 * Checklist_Step submission (Req 6.5, 6.6). `checklist_item_ids` is the list
 * of selected `checklist_items` references. The controller is responsible
 * for verifying each id belongs to the Response_Session's survey and
 * rejecting with 422 otherwise (Req 6.6) — membership cannot be expressed as
 * a static VineJS schema rule since it depends on the survey in context.
 */
export const checklistValidator = vine.compile(
  vine.object({
    checklist_item_ids: vine.array(vine.number().positive()).minLength(1),
  })
)
