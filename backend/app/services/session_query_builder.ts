import db from '@adonisjs/lucid/services/db'
import type { RawQuery } from '@adonisjs/lucid/types/querybuilder'
import Response from '#models/response'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Report action filters correspond to specific response_events existence checks.
 * Used as a WHERE clause predicate to restrict the Session_Listing.
 */
export type ReportActionFilter = 'visualizou' | 'recebeu' | 'solicitou_consultor' | 'envio_falhou'

/**
 * Listing sort order. Default is `started_at_desc` (Req 3.1).
 */
export type SortOrder = 'started_at_asc' | 'started_at_desc'

/**
 * Combinable filters for the session listing (Req 2.1–2.7).
 * All fields are optional; when multiple are present they combine via AND (Req 2.7).
 */
export interface SessionListingFilters {
  surveyId?: number
  startDate?: string // ISO date, inclusive
  endDate?: string // ISO date, inclusive
  status?: 'iniciado' | 'completo'
  nomeContains?: string // case-insensitive substring (Req 2.4)
  empresaContains?: string // case-insensitive substring (Req 2.5)
  reportAction?: ReportActionFilter
}

/**
 * Pagination parameters for paginated queries.
 */
export interface PaginationParams {
  page: number // 1-based
  perPage: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a raw `EXISTS (SELECT 1 FROM response_events ...)` subquery
 * for the given event `tipo`, correlated to `responses.id`.
 */
export function existsEvent(tipo: string): RawQuery {
  return db.raw(
    `EXISTS (SELECT 1 FROM response_events re WHERE re.response_id = responses.id AND re.tipo = ?)`,
    [tipo]
  )
}

// ---------------------------------------------------------------------------
// Report Indicator expressions (Req 1.1 — four boolean projections)
// ---------------------------------------------------------------------------

/**
 * Correlated EXISTS subqueries for the four Report_Indicator boolean flags.
 * Each maps to a `response_events.tipo` value.
 */
export const INDICATOR_EXPRESSIONS = {
  visualizou: () => existsEvent('relatorio_visualizado'),
  email_enviado: () => existsEvent('relatorio_email_enviado'),
  whatsapp_enviado: () => existsEvent('relatorio_whatsapp_enviado'),
  consultor_solicitado: () => existsEvent('consultor_solicitado'),
} as const

// ---------------------------------------------------------------------------
// Report_Action_Filter → predicate table (Req 2.6)
// ---------------------------------------------------------------------------

/**
 * Maps each Report_Action_Filter value to a function that applies the correct
 * WHERE predicate(s) onto a query builder instance.
 *
 * | Filter               | Predicate                                                       |
 * |----------------------|-----------------------------------------------------------------|
 * | visualizou           | EXISTS event `relatorio_visualizado`                            |
 * | recebeu              | EXISTS event `relatorio_email_enviado` OR `relatorio_whatsapp_enviado` |
 * | solicitou_consultor  | EXISTS event `consultor_solicitado`                             |
 * | envio_falhou         | EXISTS event `relatorio_envio_falhou`                           |
 */
export const REPORT_ACTION_PREDICATES: Record<
  ReportActionFilter,
  (query: any) => void
> = {
  visualizou: (query) => {
    query.whereRaw(
      `EXISTS (SELECT 1 FROM response_events re WHERE re.response_id = responses.id AND re.tipo = ?)`,
      ['relatorio_visualizado']
    )
  },

  recebeu: (query) => {
    query.whereRaw(
      `(EXISTS (SELECT 1 FROM response_events re WHERE re.response_id = responses.id AND re.tipo = ?) OR EXISTS (SELECT 1 FROM response_events re WHERE re.response_id = responses.id AND re.tipo = ?))`,
      ['relatorio_email_enviado', 'relatorio_whatsapp_enviado']
    )
  },

  solicitou_consultor: (query) => {
    query.whereRaw(
      `EXISTS (SELECT 1 FROM response_events re WHERE re.response_id = responses.id AND re.tipo = ?)`,
      ['consultor_solicitado']
    )
  },

  envio_falhou: (query) => {
    query.whereRaw(
      `EXISTS (SELECT 1 FROM response_events re WHERE re.response_id = responses.id AND re.tipo = ?)`,
      ['relatorio_envio_falhou']
    )
  },
}

// ---------------------------------------------------------------------------
// SessionQueryBuilder class (stub — build/count implemented in tasks 1.2/1.3)
// ---------------------------------------------------------------------------

/**
 * Shared query builder for Session_Listing. Used by both the paginated
 * `Response_Tracking_Service.list()` and the unpaginated `CSV_Exporter.export()`.
 *
 * Construction accepts filters, sort order, and optional pagination.
 * The `.build()` and `.count()` methods will be implemented in tasks 1.2 and 1.3.
 */
export class SessionQueryBuilder {
  constructor(
    private filters: SessionListingFilters,
    private sort: SortOrder = 'started_at_desc',
    private pagination?: PaginationParams
  ) {}

  /**
   * Build and return the query for the Session_Listing rows.
   * Applies all active filters via AND, the four Report_Indicator EXISTS subqueries
   * as SELECT projections, the Report_Action_Filter predicate, ordering, and
   * optional pagination.
   */
  build() {
    const query = Response.query()
      .join('surveys', 'surveys.id', 'responses.survey_id')
      .select('responses.*')
      .select('surveys.nome as survey_nome')
      .select(
        db.raw(
          `(EXISTS (SELECT 1 FROM response_events re WHERE re.response_id = responses.id AND re.tipo = ?)) as visualizou`,
          ['relatorio_visualizado']
        )
      )
      .select(
        db.raw(
          `(EXISTS (SELECT 1 FROM response_events re WHERE re.response_id = responses.id AND re.tipo = ?)) as email_enviado`,
          ['relatorio_email_enviado']
        )
      )
      .select(
        db.raw(
          `(EXISTS (SELECT 1 FROM response_events re WHERE re.response_id = responses.id AND re.tipo = ?)) as whatsapp_enviado`,
          ['relatorio_whatsapp_enviado']
        )
      )
      .select(
        db.raw(
          `(EXISTS (SELECT 1 FROM response_events re WHERE re.response_id = responses.id AND re.tipo = ?)) as consultor_solicitado`,
          ['consultor_solicitado']
        )
      )
      .select(
        db.raw(
          `CASE WHEN responses.status = 'completo' THEN EXTRACT(EPOCH FROM (responses.completed_at - responses.started_at)) ELSE NULL END as fill_time_seconds`
        )
      )
      .select(db.raw(`NULL as progress_percentage`))

    // --- Apply filters via AND (Req 2.7) ---
    const { surveyId, startDate, endDate, status, nomeContains, empresaContains, reportAction } =
      this.filters

    if (surveyId !== undefined) {
      query.where('responses.survey_id', surveyId)
    }

    if (startDate !== undefined) {
      query.where('responses.started_at', '>=', startDate)
    }

    if (endDate !== undefined) {
      query.where('responses.started_at', '<=', endDate)
    }

    if (status !== undefined) {
      query.where('responses.status', status)
    }

    if (nomeContains !== undefined) {
      query.whereILike('responses.nome', `%${nomeContains}%`)
    }

    if (empresaContains !== undefined) {
      query.whereILike('responses.empresa', `%${empresaContains}%`)
    }

    if (reportAction !== undefined) {
      REPORT_ACTION_PREDICATES[reportAction](query)
    }

    // --- Sort (Req 3.1 — default started_at DESC) ---
    query.orderBy('responses.started_at', this.sort === 'started_at_asc' ? 'asc' : 'desc')

    // --- Pagination (omitted for CSV use) ---
    if (this.pagination) {
      const { page, perPage } = this.pagination
      query.offset((page - 1) * perPage).limit(perPage)
    }

    return query
  }

  /**
   * Return the total count of Response_Sessions matching `filters`, independent
   * of pagination (Req 3.2).
   */
  async count(): Promise<number> {
    const query = Response.query()
      .join('surveys', 'surveys.id', 'responses.survey_id')
      .count('* as total')

    // --- Apply filters via AND (Req 2.7) ---
    const { surveyId, startDate, endDate, status, nomeContains, empresaContains, reportAction } =
      this.filters

    if (surveyId !== undefined) {
      query.where('responses.survey_id', surveyId)
    }

    if (startDate !== undefined) {
      query.where('responses.started_at', '>=', startDate)
    }

    if (endDate !== undefined) {
      query.where('responses.started_at', '<=', endDate)
    }

    if (status !== undefined) {
      query.where('responses.status', status)
    }

    if (nomeContains !== undefined) {
      query.whereILike('responses.nome', `%${nomeContains}%`)
    }

    if (empresaContains !== undefined) {
      query.whereILike('responses.empresa', `%${empresaContains}%`)
    }

    if (reportAction !== undefined) {
      REPORT_ACTION_PREDICATES[reportAction](query)
    }

    const result = await query
    return Number(result[0].$extras.total)
  }
}
