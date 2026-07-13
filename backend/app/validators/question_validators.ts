import vine from '@vinejs/vine'

/**
 * POST /api/admin/surveys/:surveyId/questions
 * Req 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
 */
export const createQuestionValidator = vine.compile(
  vine.object({
    texto: vine.string().trim().minLength(1).maxLength(500),
    descricao: vine.string().maxLength(300).nullable().optional(),
    tipo: vine.enum(['escolha_unica', 'multipla_escolha', 'aberta'] as const),
    obrigatoria: vine.boolean().optional(),
    ordem: vine.number(),
    peso: vine.number(),
    dimensao: vine.string().maxLength(255).nullable().optional(),
  })
)

/**
 * PUT /api/admin/questions/:id
 * Same fields as create but all optional for partial updates
 */
export const updateQuestionValidator = vine.compile(
  vine.object({
    texto: vine.string().trim().minLength(1).maxLength(500).optional(),
    descricao: vine.string().maxLength(300).nullable().optional(),
    tipo: vine.enum(['escolha_unica', 'multipla_escolha', 'aberta'] as const).optional(),
    obrigatoria: vine.boolean().optional(),
    ordem: vine.number().optional(),
    peso: vine.number().optional(),
    dimensao: vine.string().maxLength(255).nullable().optional(),
  })
)

/**
 * PUT /api/admin/surveys/:surveyId/questions/reorder
 * Req 12.1, 12.2
 */
export const reorderQuestionsValidator = vine.compile(
  vine.object({
    ordem: vine.array(vine.object({ id: vine.number(), ordem: vine.number() })).minLength(1),
  })
)
