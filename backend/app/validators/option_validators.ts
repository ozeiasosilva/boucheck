import vine from '@vinejs/vine'

/**
 * POST /api/admin/questions/:questionId/options
 * PUT  /api/admin/options/:id
 * Req 11.1, 11.2
 */
export const optionValidator = vine.compile(
  vine.object({
    texto: vine.string().trim().minLength(1),
    pontuacao: vine.number(),
    ordem: vine.number(),
  })
)
