import vine from '@vinejs/vine'
import { INTERACTION_TYPES } from '#models/interaction_history'

/**
 * POST /api/admin/insights/survey
 * Req 1.1
 */
export const generateSurveyInsightValidator = vine.compile(
  vine.object({
    survey_id: vine.number().positive(),
  })
)

/**
 * POST /api/admin/insights/client
 * Req 2.1
 */
export const generateClientInsightValidator = vine.compile(
  vine.object({
    response_id: vine.string().uuid(),
  })
)

/**
 * POST /api/admin/responses/:responseId/interactions
 * Req 3.2, 3.3
 */
export const createInteractionValidator = vine.compile(
  vine.object({
    tipo: vine.enum(INTERACTION_TYPES),
    observacao: vine.string().maxLength(500).optional(),
  })
)

/**
 * PUT /api/admin/ai-config/prompts
 * Req 4.1, 4.4
 */
export const updatePromptsValidator = vine.compile(
  vine.object({
    survey_agent_prompt: vine.string().maxLength(10000).optional(),
    client_agent_prompt: vine.string().maxLength(10000).optional(),
  })
)
