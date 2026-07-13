import vine from '@vinejs/vine'

/**
 * POST /api/admin/surveys/:surveyId/checklist-items
 * Req 14.1, 14.2
 */
export const checklistItemValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(1).maxLength(255),
    grupo: vine.enum(['servico_cloud', 'fabricante', 'solucao'] as const),
  })
)

/**
 * POST /api/admin/surveys/:surveyId/checklist-items/import
 * Req 15.1
 */
export const importChecklistValidator = vine.compile(
  vine.object({
    source_survey_id: vine.number().positive(),
  })
)
