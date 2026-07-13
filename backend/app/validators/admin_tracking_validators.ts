import vine from '@vinejs/vine'

/**
 * GET /api/admin/responses (listing) and GET /api/admin/responses/export.csv
 *
 * All query params are optional. Filters combine via AND (Req 2.7).
 */
export const listingFiltersValidator = vine.compile(
  vine.object({
    survey_id: vine.number().positive().optional(),
    start_date: vine.string().trim().optional(),
    end_date: vine.string().trim().optional(),
    status: vine.enum(['iniciado', 'completo']).optional(),
    nome: vine.string().trim().optional(),
    empresa: vine.string().trim().optional(),
    report_action: vine
      .enum(['visualizou', 'recebeu', 'solicitou_consultor', 'envio_falhou'])
      .optional(),
    page: vine.number().positive().optional(),
    per_page: vine.number().positive().max(100).optional(),
  })
)

/**
 * POST /api/admin/responses/:id/resend
 *
 * Optional body field to explicitly choose the delivery channel (Req 8.2).
 */
export const resendBodyValidator = vine.compile(
  vine.object({
    channel: vine.enum(['email', 'whatsapp']).optional(),
  })
)

/**
 * GET /api/admin/dashboard
 *
 * All three fields are REQUIRED — VineJS returns 422 automatically when they're missing.
 * survey_id accepts either a positive number or the literal string 'all' (Req 17.4).
 * The controller parses the validated string as either 'all' or parseInt() for DashboardFilters.
 * period_start and period_end are required ISO date strings (Req 17.1).
 *
 * Requirements: 17.1, 17.2, 17.3
 */
export const dashboardFiltersValidator = vine.compile(
  vine.object({
    survey_id: vine.string().trim(),
    period_start: vine.string().trim(),
    period_end: vine.string().trim(),
  })
)
