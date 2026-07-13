import type { HttpContext } from '@adonisjs/core/http'
import {
  listingFiltersValidator,
  resendBodyValidator,
} from '../../validators/admin_tracking_validators.js'
import responseTrackingService from '../../services/response_tracking_service.js'
import resendService from '../../services/resend_service.js'
import anonymizationService from '../../services/anonymization_service.js'
import type { SessionListingFilters } from '../../services/session_query_builder.js'

export default class ResponsesController {
  /**
   * GET /api/admin/responses
   *
   * Validates query params, maps to SessionListingFilters, calls
   * ResponseTrackingService.list(), and transforms the result into the
   * paginated response shape the frontend expects.
   * Req 1.1, 2.1, 3.2
   */
  async index({ request, response }: HttpContext) {
    const validated = await request.validateUsing(listingFiltersValidator)

    const filters: SessionListingFilters = {
      surveyId: validated.survey_id,
      startDate: validated.start_date,
      endDate: validated.end_date,
      status: validated.status,
      nomeContains: validated.nome,
      empresaContains: validated.empresa,
      reportAction: validated.report_action,
    }

    const page = validated.page ?? 1
    const perPage = validated.per_page ?? 20

    const result = await responseTrackingService.list(filters, 'started_at_desc', {
      page,
      perPage,
    })

    // Transform to the shape the frontend expects (PaginatedResponses)
    const data = result.rows.map((row) => ({
      id: row.id,
      survey_id: 0, // not available in listing row; detail provides it
      survey: { nome: row.surveyNome, slug: '' },
      nome: row.nome ?? '',
      empresa: row.empresa ?? '',
      email: row.email ?? '',
      telefone: row.telefone ?? '',
      cargo: row.cargo ?? '',
      cidade: row.cidade ?? '',
      status: row.status,
      pontuacao: null,
      started_at: row.startedAt ?? '',
      completed_at: row.completedAt ?? null,
      anonimizado: row.nome === '[anonimizado]',
      progress_percent: row.progressPercentage ?? 0,
      fill_time_seconds: row.fillTimeSeconds,
      report_visualized: row.indicators.visualizou,
      report_email_sent: row.indicators.emailEnviado,
      report_whatsapp_sent: row.indicators.whatsappEnviado,
      consultant_requested: row.indicators.consultorSolicitado,
      report_failed: false,
    }))

    const lastPage = Math.ceil(result.total / perPage) || 1

    return response.ok({
      data,
      meta: {
        total: result.total,
        page,
        per_page: perPage,
        last_page: lastPage,
      },
    })
  }

  /**
   * GET /api/admin/responses/:id
   *
   * Returns full session detail transformed into the shape the frontend expects.
   * Catches NotFoundException → 404.
   * Req 4.1, 4.5
   */
  async show({ params, response }: HttpContext) {
    try {
      const detail = await responseTrackingService.detail(params.id)

      // Transform to the shape the frontend expects (ResponseDetail)
      const session = detail.session
      const payload = {
        id: session.id,
        survey_id: session.surveyId,
        survey: { nome: session.surveyNome, slug: '' },
        nome: session.nome ?? '',
        empresa: session.empresa ?? '',
        email: session.email ?? '',
        telefone: session.telefone ?? '',
        cargo: session.cargo ?? '',
        cidade: session.cidade ?? '',
        status: session.status,
        pontuacao: null,
        started_at: session.startedAt ?? '',
        completed_at: session.completedAt ?? null,
        anonimizado: session.nome === '[anonimizado]',
        progress_percent: session.progressPercentage ?? 0,
        fill_time_seconds: session.fillTimeSeconds,
        report_visualized: session.indicators.visualizou,
        report_email_sent: session.indicators.emailEnviado,
        report_whatsapp_sent: session.indicators.whatsappEnviado,
        consultant_requested: session.indicators.consultorSolicitado,
        report_failed: false,

        // Answers: group by question, collect optionText values into opcoes array
        answers: this.groupAnswersByQuestion(detail.answers),
        checklist: detail.checklist.map((c) => ({ nome: c.nome, grupo: c.grupo })),
        events: detail.timeline.map((e, i) => ({
          id: i + 1,
          tipo: e.tipo,
          payload: (e.payload as Record<string, unknown>) ?? null,
          created_at: e.createdAt,
        })),
        time_per_question: detail.perQuestionTime.map((t) => ({
          question_id: t.questionId,
          seconds: t.seconds,
        })),
      }

      return response.ok(payload)
    } catch (error: any) {
      if (error.status === 404) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }

  /**
   * Groups flat answer rows by question, collecting all option texts into
   * an `opcoes` array per question (for multiple-choice answers).
   */
  private groupAnswersByQuestion(
    answers: Array<{ questionId: number; questionText: string; optionText: string | null; textoLivre: string | null }>
  ) {
    const grouped = new Map<
      number,
      { question_id: number; question_texto: string; opcoes: string[]; texto_livre: string | null }
    >()

    for (const ans of answers) {
      if (!grouped.has(ans.questionId)) {
        grouped.set(ans.questionId, {
          question_id: ans.questionId,
          question_texto: ans.questionText,
          opcoes: [],
          texto_livre: ans.textoLivre,
        })
      }
      const entry = grouped.get(ans.questionId)!
      if (ans.optionText) {
        entry.opcoes.push(ans.optionText)
      }
      // Keep the latest texto_livre if present
      if (ans.textoLivre) {
        entry.texto_livre = ans.textoLivre
      }
    }

    return Array.from(grouped.values())
  }

  /**
   * POST /api/admin/responses/:id/resend
   *
   * Validates body for optional channel, calls ResendService.resend().
   * Catches NotFoundException → 404, AmbiguousChannelException → 422,
   * ChannelNotFoundException → 422.
   * Req 8.1, 8.4, 8.5
   */
  async resend({ params, request, response, auth }: HttpContext) {
    const { channel } = await request.validateUsing(resendBodyValidator)
    const adminId = auth.user?.id

    try {
      const result = await resendService.resend(params.id, channel, adminId)
      return response.ok(result)
    } catch (error: any) {
      if (error.status === 404) {
        return response.notFound({ message: error.message })
      }
      if (error.status === 422) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  /**
   * POST /api/admin/responses/:id/anonymize
   *
   * Calls AnonymizationService.anonymize(). Catches NotFoundException → 404.
   * Req 9.1
   */
  async anonymize({ params, response }: HttpContext) {
    try {
      const result = await anonymizationService.anonymize(params.id)
      return response.ok(result)
    } catch (error: any) {
      if (error.status === 404) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }
}
