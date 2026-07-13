import vine from '@vinejs/vine'

/**
 * Recognized public event types (Req 8.1, 8.3). Any `tipo` outside this set
 * is rejected with HTTP 422.
 */
export const PUBLIC_EVENT_TYPES = [
  'pagina_acessada',
  'privacidade_aceita',
  'pergunta_respondida',
  'concluido',
  'relatorio_visualizado',
  'relatorio_email_solicitado',
  'relatorio_whatsapp_solicitado',
  'consultor_solicitado',
] as const

/**
 * POST /api/public/responses/{token}/events
 *
 * Response_Event logging submission (Req 8.1, 8.3):
 * - `tipo` must be a member of `PUBLIC_EVENT_TYPES`.
 * - `payload` is an optional free-form JSON object carrying event-specific
 *   context (e.g. `question_id`, timestamps).
 */
export const eventValidator = vine.compile(
  vine.object({
    tipo: vine.enum(PUBLIC_EVENT_TYPES),
    payload: vine.object({}).allowUnknownProperties(),
  })
)
