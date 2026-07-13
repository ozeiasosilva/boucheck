import vine from '@vinejs/vine'
import { hexColorRule } from './shared.js'

/**
 * POST /api/admin/surveys/:surveyId/score-ranges
 * PUT  /api/admin/surveys/:surveyId/score-ranges/:id
 * Req 21.1, 21.6
 */
export const scoreRangeValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(1).maxLength(255),
    min: vine.number(),
    max: vine.number(),
    descricao: vine.string().maxLength(300).nullable().optional(),
    cor: hexColorRule.optional(),
  })
)
