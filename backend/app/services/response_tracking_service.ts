import { DateTime } from 'luxon'
import {
  SessionQueryBuilder,
  type SessionListingFilters,
  type SortOrder,
  type PaginationParams,
} from '#services/session_query_builder'
import { NotFoundException } from './anonymization_service.js'
import Response from '#models/response'
import { computePerQuestionTime } from './compute_per_question_time.js'

// Re-export so existing callers still find it here
export { computePerQuestionTime } from './compute_per_question_time.js'

// ---------------------------------------------------------------------------
// SessionListingRow interface (Req 1.1)
// ---------------------------------------------------------------------------

/**
 * Shape of a single row in the paginated Session_Listing.
 */
export interface SessionListingRow {
  id: string
  nome: string | null
  empresa: string | null
  email: string | null
  telefone: string | null
  cargo: string | null
  cidade: string | null
  surveyNome: string
  status: 'iniciado' | 'completo'
  startedAt: string | null
  completedAt: string | null
  fillTimeSeconds: number | null
  progressPercentage: number | null
  indicators: {
    visualizou: boolean
    emailEnviado: boolean
    whatsappEnviado: boolean
    consultorSolicitado: boolean
  }
}

// ---------------------------------------------------------------------------
// SessionDetail interface (Req 4, 5, 6)
// ---------------------------------------------------------------------------

/**
 * Shape of the full session detail response including answers, checklist,
 * event timeline, and per-question time computation.
 */
export interface SessionDetail {
  session: SessionListingRow & { surveyId: number }
  answers: Array<{
    questionId: number
    questionText: string
    optionText: string | null
    textoLivre: string | null
  }>
  checklist: Array<{ checklistItemId: number; nome: string; grupo: string }>
  timeline: Array<{ tipo: string; createdAt: string; payload: unknown }>
  perQuestionTime: Array<{ questionId: number; seconds: number }>
}

// ---------------------------------------------------------------------------
// ResponseTrackingService
// ---------------------------------------------------------------------------

/**
 * Service responsible for listing Response_Sessions and retrieving
 * session detail (including timeline and per-question time).
 */
export class ResponseTrackingService {
  /**
   * Returns a paginated, filtered Session_Listing (Req 1, 2, 3).
   *
   * Maps each row from `SessionQueryBuilder.build()` to the `SessionListingRow` shape.
   * - Fill_Time (seconds) is populated for `completo` rows (Req 1.2), null otherwise.
   * - Progress_Percentage is populated for `iniciado` rows (Req 1.3), null otherwise.
   * - PII fields are passed through as-is, including anonymized placeholders (Req 1.4).
   */
  async list(
    filters: SessionListingFilters,
    sort: SortOrder = 'started_at_desc',
    pagination: PaginationParams = { page: 1, perPage: 20 }
  ): Promise<{ rows: SessionListingRow[]; total: number }> {
    const builder = new SessionQueryBuilder(filters, sort, pagination)

    const [rawRows, total] = await Promise.all([builder.build(), builder.count()])

    const rows: SessionListingRow[] = rawRows.map((row) => {
      const extras = row.$extras

      // Fill_Time: populated only for 'completo' (Req 1.2)
      const fillTimeSeconds =
        row.status === 'completo' && extras.fill_time_seconds != null
          ? Number(extras.fill_time_seconds)
          : null

      // Progress_Percentage: populated only for 'iniciado' (Req 1.3)
      // TODO: Replace with Navigation_Engine path-length based computation
      // once public-response-flow's Navigation_Engine is available.
      // For now, the query returns NULL and we pass it through.
      const progressPercentage =
        row.status === 'iniciado' && extras.progress_percentage != null
          ? Number(extras.progress_percentage)
          : null

      return {
        id: row.id,
        nome: row.nome,
        empresa: row.empresa,
        email: row.email,
        telefone: row.telefone,
        cargo: row.cargo,
        cidade: row.cidade,
        surveyNome: String(extras.survey_nome),
        status: row.status as 'iniciado' | 'completo',
        startedAt: row.startedAt ? row.startedAt.toISO() : null,
        completedAt: row.completedAt ? row.completedAt.toISO() : null,
        fillTimeSeconds,
        progressPercentage,
        indicators: {
          visualizou: Boolean(extras.visualizou),
          emailEnviado: Boolean(extras.email_enviado),
          whatsappEnviado: Boolean(extras.whatsapp_enviado),
          consultorSolicitado: Boolean(extras.consultor_solicitado),
        },
      }
    })

    return { rows, total }
  }

  /**
   * Returns the full Session_Detail for a given response id,
   * including answers, checklist, event timeline, and per-question time.
   * (Req 4, 5, 6)
   */
  async detail(id: string): Promise<SessionDetail> {
    // 1. Load session — throw 404 if missing (Req 4.5)
    const session = await Response.find(id)
    if (!session) throw new NotFoundException()

    // 2. Preload survey (Req 4.1 — survey identification)
    await session.load('survey')

    // 3. Load answers with question and option (Req 4.2)
    await session.load('answers', (q) => q.preload('question').preload('questionOption'))

    // 4. Load checklist with item (Req 4.3)
    await session.load('checklistSelections', (q) => q.preload('checklistItem'))

    // 5. Load events ordered by created_at asc (Req 5.1)
    await session.load('events', (q) => q.orderBy('created_at', 'asc'))

    // 6. Map answers (Req 4.2)
    const answers = session.answers.map((a) => ({
      questionId: a.questionId,
      questionText: a.question.texto,
      optionText: a.questionOption ? a.questionOption.texto : null,
      textoLivre: a.textoLivre,
    }))

    // 7. Map checklist (Req 4.3)
    const checklist = session.checklistSelections.map((c) => ({
      checklistItemId: c.checklistItemId,
      nome: c.checklistItem.nome,
      grupo: c.checklistItem.grupo,
    }))

    // 8. Map events to timeline (Req 5.1, 5.2)
    const timeline = session.events.map((event) => ({
      tipo: event.tipo,
      createdAt: event.createdAt.toISO()!,
      payload: event.payload,
    }))

    // 9. Compute per-question time (Req 6.1, 6.2, 6.3, 6.4)
    const perguntaRespondidaEvents = session.events
      .filter((e) => e.tipo === 'pergunta_respondida')
      .map((e) => ({
        questionId: (e.payload as Record<string, unknown>)?.question_id as number,
        createdAt: e.createdAt,
      }))

    const perQuestionTime = session.startedAt
      ? computePerQuestionTime(session.startedAt, perguntaRespondidaEvents)
      : []

    // 10. Compose and return SessionDetail
    const fillTimeSeconds =
      session.status === 'completo' && session.startedAt && session.completedAt
        ? session.completedAt.diff(session.startedAt, 'seconds').seconds
        : null

    const sessionRow: SessionDetail['session'] = {
      id: session.id,
      nome: session.nome,
      empresa: session.empresa,
      email: session.email,
      telefone: session.telefone,
      cargo: session.cargo,
      cidade: session.cidade,
      surveyNome: session.survey.nome,
      surveyId: session.surveyId,
      status: session.status as 'iniciado' | 'completo',
      startedAt: session.startedAt ? session.startedAt.toISO() : null,
      completedAt: session.completedAt ? session.completedAt.toISO() : null,
      fillTimeSeconds,
      progressPercentage: null, // Computed separately for listing; not needed in detail
      indicators: {
        visualizou: session.events.some((e) => e.tipo === 'relatorio_visualizado'),
        emailEnviado: session.events.some((e) => e.tipo === 'relatorio_email_enviado'),
        whatsappEnviado: session.events.some((e) => e.tipo === 'relatorio_whatsapp_enviado'),
        consultorSolicitado: session.events.some((e) => e.tipo === 'consultor_solicitado'),
      },
    }

    return {
      session: sessionRow,
      answers,
      checklist,
      timeline,
      perQuestionTime,
    }
  }
}

export default new ResponseTrackingService()
