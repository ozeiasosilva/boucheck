import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { dashboardFiltersValidator } from '../../validators/admin_tracking_validators.js'
import DashboardService from '#services/dashboard_service'
import type { DashboardFilters } from '#services/dashboard_service'

export default class DashboardController {
  /**
   * GET /api/admin/dashboard
   *
   * Validates the required survey/period filters via VineJS (returns 422 on missing fields),
   * parses survey_id ('all' or numeric), and delegates to DashboardService.compute().
   * Transforms internal service result into the payload shape expected by the frontend.
   * Requirements: 17.1, 17.2, 17.3, 17.4
   */
  async index({ request, response }: HttpContext) {
    const validated = await request.validateUsing(dashboardFiltersValidator)

    // Parse survey_id: if 'all' → surveyId = 'all'; otherwise → parseInt
    const surveyId: DashboardFilters['surveyId'] =
      validated.survey_id === 'all' ? 'all' : parseInt(validated.survey_id, 10)

    const filters: DashboardFilters = {
      surveyId,
      periodStart: validated.period_start,
      periodEnd: validated.period_end,
    }

    const [result, emailWhatsappCounts] = await Promise.all([
      DashboardService.compute(filters),
      this.computeEmailWhatsappCounts(filters),
    ])

    const payload = {
      totals: {
        page_views: result.accessCount,
        started: result.startedCount,
        completed: result.completedCount,
        completion_rate: result.completionRatePercent / 100, // frontend expects 0–1 fraction
        avg_fill_seconds: result.averageFillTimeSeconds,
        report_visualized: result.funnel.viewedReport,
        email_sent: emailWhatsappCounts.emailSent,
        whatsapp_sent: emailWhatsappCounts.whatsappSent,
        consultant_requested: result.funnel.requestedConsultant,
      },
      funnel: [
        { step: 'Acessou a página', count: result.funnel.accessed },
        { step: 'Se identificou', count: result.funnel.identified },
        { step: 'Respondeu 1ª pergunta', count: result.funnel.answeredFirstQuestion },
        { step: 'Completou', count: result.funnel.completed },
        { step: 'Visualizou relatório', count: result.funnel.viewedReport },
        { step: 'Solicitou envio', count: result.funnel.requestedDelivery },
        { step: 'Solicitou consultor', count: result.funnel.requestedConsultant },
      ],
      top_dropout_question: result.highestAbandonmentQuestion
        ? {
            question_id: result.highestAbandonmentQuestion.questionId,
            texto: result.highestAbandonmentQuestion.questionText,
            count: result.highestAbandonmentQuestion.count,
          }
        : null,
      daily_series: result.dailyTimeSeries,
      answer_distribution: result.responseDistribution.map((q) => ({
        question_id: q.questionId,
        texto: q.questionText,
        options: q.options.map((o) => ({ texto: o.optionText, count: o.count })),
      })),
      top_checklist: Object.entries(result.topChecklistItems).flatMap(([grupo, items]) =>
        items.map((item) => ({ nome: item.nome, grupo, count: item.count }))
      ),
    }

    return response.ok(payload)
  }

  /**
   * Computes individual email_sent and whatsapp_sent counts by querying
   * response_events for the specific event types within the filtered sessions.
   */
  private async computeEmailWhatsappCounts(filters: DashboardFilters) {
    const conditions: string[] = []
    const bindings: (string | number)[] = []

    if (filters.surveyId !== 'all') {
      conditions.push(`r.survey_id = ?`)
      bindings.push(filters.surveyId)
    }

    conditions.push(`r.started_at >= ?`)
    bindings.push(filters.periodStart)

    conditions.push(`r.started_at < (?::date + interval '1 day')`)
    bindings.push(filters.periodEnd)

    const where = conditions.join(' AND ')

    const result = await db.rawQuery(
      `
      SELECT
        COUNT(DISTINCT CASE WHEN re.tipo = 'relatorio_email_solicitado' THEN re.response_id END)::int AS email_sent,
        COUNT(DISTINCT CASE WHEN re.tipo = 'relatorio_whatsapp_solicitado' THEN re.response_id END)::int AS whatsapp_sent
      FROM response_events re
      JOIN responses r ON r.id = re.response_id
      WHERE re.tipo IN ('relatorio_email_solicitado', 'relatorio_whatsapp_solicitado')
        AND ${where}
      `,
      bindings
    )

    const row = result.rows[0]
    return {
      emailSent: Number(row?.email_sent) || 0,
      whatsappSent: Number(row?.whatsapp_sent) || 0,
    }
  }
}
