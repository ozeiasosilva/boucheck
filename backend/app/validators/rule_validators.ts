import vine from '@vinejs/vine'

/**
 * POST /api/admin/rules
 * PUT  /api/admin/rules/{id}
 *
 * Cascade rule creation/update (Req 16.1, 16.2, 20.2).
 * `question_option_id` identifies the option this rule is attached to.
 * `next_question_id` is the forward-reference destination (nullable for early termination).
 * `finalizar` marks the rule as an early-termination rule.
 * `priority` defaults to the owning option's `ordem` when omitted (Req 20.2).
 */
export const ruleValidator = vine.compile(
  vine.object({
    question_option_id: vine.number().positive(),
    next_question_id: vine.number().positive().nullable().optional(),
    finalizar: vine.boolean().optional(),
    priority: vine.number().optional(),
  })
)
