import vine from '@vinejs/vine'

/**
 * PUT /api/public/responses/{token}/answers/{questionId}
 *
 * Answer submission body (Req 4.3, 4.9, 4.10):
 * - `question_option_ids`: selected option id(s) for `escolha_unica` (single
 *   entry) or `multipla_escolha` (one or more entries) questions.
 * - `texto_livre`: free-text answer for `aberta` questions, capped at 2000
 *   characters (Req 4.3).
 * - Exactly one of `question_option_ids` or `texto_livre` must be present —
 *   `requiredIfMissing` on each makes the other required whenever the first
 *   is absent, so a request lacking both fails validation with 422.
 * - `invalidated_question_ids`: optional list of question ids whose
 *   previously persisted answers must be deleted because they fell off the
 *   Answered_Path after a branching change (Req 4.9).
 */
export const answerValidator = vine.compile(
  vine.object({
    question_option_ids: vine
      .array(vine.number().positive())
      .minLength(1)
      .optional()
      .requiredIfMissing('texto_livre'),
    texto_livre: vine.string().trim().maxLength(2000).optional().requiredIfMissing('question_option_ids'),
    invalidated_question_ids: vine.array(vine.number().positive()).optional(),
  })
)
