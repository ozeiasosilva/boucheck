import db from '@adonisjs/lucid/services/db'

// --- Interfaces ---

export interface DashboardFilters {
  surveyId: number | 'all' // Req 17.4
  periodStart: string // ISO date, inclusive
  periodEnd: string // ISO date, inclusive
}

export interface DashboardResult {
  accessCount: number
  startedCount: number
  completedCount: number
  completionRatePercent: number
  funnel: {
    accessed: number
    identified: number
    answeredFirstQuestion: number
    completed: number
    viewedReport: number
    requestedDelivery: number
    requestedConsultant: number
  }
  averageFillTimeSeconds: number | null
  highestAbandonmentQuestion: {
    questionId: number
    questionText: string
    count: number
  } | null
  responseDistribution: Array<{
    questionId: number
    questionText: string
    options: Array<{ optionId: number; optionText: string; count: number }>
  }>
  dailyTimeSeries: Array<{ date: string; count: number }>
  topChecklistItems: Record<string, Array<{ checklistItemId: number; nome: string; count: number }>>
}

// --- Service ---

export class DashboardService {
  /**
   * Builds the reusable WHERE clause components for the survey/period predicate.
   * Returns the SQL fragment and corresponding bindings array.
   */
  private buildPredicate(filters: DashboardFilters, tableAlias: string = 'r'): {
    sql: string
    bindings: (string | number)[]
  } {
    const conditions: string[] = []
    const bindings: (string | number)[] = []

    // Survey filter — omit when 'all' (Req 17.4)
    if (filters.surveyId !== 'all') {
      conditions.push(`${tableAlias}.survey_id = ?`)
      bindings.push(filters.surveyId)
    }

    // Period filter — inclusive on started_at (use < next day for end to include full day)
    conditions.push(`${tableAlias}.started_at >= ?`)
    bindings.push(filters.periodStart)

    conditions.push(`${tableAlias}.started_at < (?::date + interval '1 day')`)
    bindings.push(filters.periodEnd)

    return {
      sql: conditions.join(' AND '),
      bindings,
    }
  }

  /**
   * Computes the top-line counts: Access_Count, Started_Count, Completed_Count,
   * and the completion rate with a divide-by-zero guard (Req 10.1–10.5).
   */
  async computeTopLineCounts(
    filters: DashboardFilters
  ): Promise<{
    accessCount: number
    startedCount: number
    completedCount: number
    completionRatePercent: number
  }> {
    const predicate = this.buildPredicate(filters)

    // Build the access_count subquery predicate using the same filters on the joined responses table
    const accessPredicate = this.buildPredicate(filters, 'r2')

    const query = `
      SELECT
        (SELECT COUNT(*)::int FROM response_events re
           JOIN responses r2 ON r2.id = re.response_id
           WHERE re.tipo = 'pagina_acessada' AND ${accessPredicate.sql}) AS access_count,
        COUNT(*)::int AS started_count,
        COUNT(*) FILTER (WHERE r.status = 'completo')::int AS completed_count
      FROM responses r
      WHERE ${predicate.sql}
    `

    const result = await db.rawQuery(query, [...accessPredicate.bindings, ...predicate.bindings])

    const row = result.rows[0]
    const accessCount = Number(row.access_count) || 0
    const startedCount = Number(row.started_count) || 0
    const completedCount = Number(row.completed_count) || 0

    // Req 10.5 — divide-by-zero guard: return 0 when startedCount is zero
    const completionRatePercent = startedCount === 0 ? 0 : (completedCount / startedCount) * 100

    return { accessCount, startedCount, completedCount, completionRatePercent }
  }

  /**
   * Computes the seven Funnel_Stage counts (Req 11.1–11.8).
   * Uses COUNT(*) FILTER (WHERE EXISTS ...) for event-based stages,
   * and COUNT(*) FILTER (WHERE status = 'completo') for the completed stage.
   */
  async computeFunnel(
    filters: DashboardFilters
  ): Promise<DashboardResult['funnel']> {
    const predicate = this.buildPredicate(filters)

    const query = `
      SELECT
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM response_events e WHERE e.response_id = r.id AND e.tipo = 'pagina_acessada'))::int AS accessed,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM response_events e WHERE e.response_id = r.id AND e.tipo = 'privacidade_aceita'))::int AS identified,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM response_events e WHERE e.response_id = r.id AND e.tipo = 'pergunta_respondida'))::int AS answered_first_question,
        COUNT(*) FILTER (WHERE r.status = 'completo')::int AS completed,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM response_events e WHERE e.response_id = r.id AND e.tipo = 'relatorio_visualizado'))::int AS viewed_report,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM response_events e WHERE e.response_id = r.id AND e.tipo = 'relatorio_email_solicitado') OR EXISTS (SELECT 1 FROM response_events e WHERE e.response_id = r.id AND e.tipo = 'relatorio_whatsapp_solicitado'))::int AS requested_delivery,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM response_events e WHERE e.response_id = r.id AND e.tipo = 'consultor_solicitado'))::int AS requested_consultant
      FROM responses r
      WHERE ${predicate.sql}
    `

    const result = await db.rawQuery(query, predicate.bindings)
    const row = result.rows[0]

    return {
      accessed: Number(row.accessed) || 0,
      identified: Number(row.identified) || 0,
      answeredFirstQuestion: Number(row.answered_first_question) || 0,
      completed: Number(row.completed) || 0,
      viewedReport: Number(row.viewed_report) || 0,
      requestedDelivery: Number(row.requested_delivery) || 0,
      requestedConsultant: Number(row.requested_consultant) || 0,
    }
  }

  /**
   * Computes the average fill time (in seconds) across completed sessions
   * matching the active dashboard filters (Req 12.1, 12.2, 12.3).
   * PostgreSQL returns NULL for AVG over zero rows, so null is returned directly.
   */
  async computeAverageFillTime(filters: DashboardFilters): Promise<number | null> {
    const predicate = this.buildPredicate(filters)

    const query = `
      SELECT AVG(EXTRACT(EPOCH FROM (r.completed_at - r.started_at))) AS avg_fill_time_seconds
      FROM responses r
      WHERE ${predicate.sql} AND r.status = 'completo'
    `

    const result = await db.rawQuery(query, predicate.bindings)
    const row = result.rows[0]

    if (row.avg_fill_time_seconds === null || row.avg_fill_time_seconds === undefined) {
      return null
    }

    return Number(row.avg_fill_time_seconds)
  }

  /**
   * Computes the highest-abandonment question: among `iniciado` sessions matching
   * the filters, finds the last-answered question (most recent `pergunta_respondida`
   * event per session), groups by question, and returns the one with the highest count.
   * Tie-break: lowest question_id. Returns null when no `iniciado` sessions match.
   * (Req 13.1, 13.2, 13.3)
   */
  async computeHighestAbandonmentQuestion(
    filters: DashboardFilters
  ): Promise<DashboardResult['highestAbandonmentQuestion']> {
    const predicate = this.buildPredicate(filters)

    const query = `
      WITH last_answered AS (
        SELECT DISTINCT ON (re.response_id)
          re.response_id,
          (re.payload->>'question_id')::int AS question_id
        FROM response_events re
        JOIN responses r ON r.id = re.response_id
        WHERE re.tipo = 'pergunta_respondida'
          AND r.status = 'iniciado'
          AND ${predicate.sql}
        ORDER BY re.response_id, re.created_at DESC
      )
      SELECT la.question_id, q.texto AS question_text, COUNT(*)::int AS count
      FROM last_answered la
      JOIN questions q ON q.id = la.question_id
      GROUP BY la.question_id, q.texto
      ORDER BY count DESC, la.question_id ASC
      LIMIT 1
    `

    const result = await db.rawQuery(query, predicate.bindings)

    if (!result.rows || result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      questionId: Number(row.question_id),
      questionText: String(row.question_text),
      count: Number(row.count),
    }
  }

  /**
   * Computes the daily time series for the Dashboard_Period using generate_series,
   * LEFT JOINed to per-day session counts so days with no matching sessions are
   * zero-filled (Req 15.1, 15.2).
   * Returns an array of { date: string (YYYY-MM-DD); count: number } ordered by date ASC.
   */
  async computeDailyTimeSeries(
    filters: DashboardFilters
  ): Promise<DashboardResult['dailyTimeSeries']> {
    // Build the ON clause predicate for the LEFT JOIN — date equality plus survey filter.
    // The generate_series already constrains to the period range, so we only need survey_id here.
    const joinConditions: string[] = [`r.started_at::date = d.date`]
    const joinBindings: (string | number)[] = []

    if (filters.surveyId !== 'all') {
      joinConditions.push(`r.survey_id = ?`)
      joinBindings.push(filters.surveyId)
    }

    const joinOn = joinConditions.join(' AND ')

    const query = `
      SELECT d.date::date AS date, COALESCE(COUNT(r.id), 0)::int AS count
      FROM generate_series(?::date, ?::date, interval '1 day') AS d(date)
      LEFT JOIN responses r ON ${joinOn}
      GROUP BY d.date
      ORDER BY d.date ASC
    `

    const result = await db.rawQuery(query, [
      filters.periodStart,
      filters.periodEnd,
      ...joinBindings,
    ])

    return result.rows.map((row: { date: Date | string; count: string | number }) => ({
      date:
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date).slice(0, 10),
      count: Number(row.count) || 0,
    }))
  }

  /**
   * Computes the response distribution per question (Req 14.1, 14.2).
   * LEFT JOINs from question_options to response_answers (scoped to matching sessions)
   * excluding questions with tipo = 'aberta', so every choice-type question/option pair
   * appears with a zero-defaulted count.
   */
  async computeResponseDistribution(
    filters: DashboardFilters
  ): Promise<DashboardResult['responseDistribution']> {
    const predicate = this.buildPredicate(filters)

    // Build survey filter for questions table
    const questionConditions: string[] = [`q.tipo != 'aberta'`]
    const questionBindings: (string | number)[] = []

    if (filters.surveyId !== 'all') {
      questionConditions.push(`q.survey_id = ?`)
      questionBindings.push(filters.surveyId)
    }

    const questionWhere = questionConditions.join(' AND ')

    const query = `
      SELECT q.id AS question_id, q.texto AS question_text,
             qo.id AS option_id, qo.texto AS option_text,
             COUNT(ra.id)::int AS count
      FROM questions q
      JOIN question_options qo ON qo.question_id = q.id
      LEFT JOIN response_answers ra ON ra.question_option_id = qo.id
        AND ra.response_id IN (SELECT r.id FROM responses r WHERE ${predicate.sql})
      WHERE ${questionWhere}
      GROUP BY q.id, q.texto, qo.id, qo.texto
      ORDER BY q.id, qo.id
    `

    const result = await db.rawQuery(query, [...predicate.bindings, ...questionBindings])

    // Group flat rows by questionId into the nested array structure
    const distributionMap = new Map<
      number,
      { questionId: number; questionText: string; options: Array<{ optionId: number; optionText: string; count: number }> }
    >()

    for (const row of result.rows) {
      const questionId = Number(row.question_id)
      const questionText = String(row.question_text)
      const optionId = Number(row.option_id)
      const optionText = String(row.option_text)
      const count = Number(row.count) || 0

      if (!distributionMap.has(questionId)) {
        distributionMap.set(questionId, { questionId, questionText, options: [] })
      }

      distributionMap.get(questionId)!.options.push({ optionId, optionText, count })
    }

    return Array.from(distributionMap.values())
  }

  /**
   * Computes the top checklist items by group (Req 16.1).
   * LEFT JOINs from checklist_items to response_checklist (scoped to matching sessions),
   * grouped by grupo, ordered by selection count descending with a stable id tie-break,
   * then reshaped into the Record<grupo, [...]> view.
   */
  async computeTopChecklistItems(
    filters: DashboardFilters
  ): Promise<DashboardResult['topChecklistItems']> {
    const predicate = this.buildPredicate(filters)

    // Build the survey filter for checklist_items table
    const ciConditions: string[] = []
    const ciBindings: (string | number)[] = []

    if (filters.surveyId !== 'all') {
      ciConditions.push(`ci.survey_id = ?`)
      ciBindings.push(filters.surveyId)
    }

    const ciWhere = ciConditions.length > 0 ? `WHERE ${ciConditions.join(' AND ')}` : ''

    const query = `
      SELECT ci.id AS checklist_item_id, ci.nome, ci.grupo, COUNT(rc.id)::int AS count
      FROM checklist_items ci
      LEFT JOIN response_checklist rc ON rc.checklist_item_id = ci.id
        AND rc.response_id IN (SELECT r.id FROM responses r WHERE ${predicate.sql})
      ${ciWhere}
      GROUP BY ci.id, ci.nome, ci.grupo
      ORDER BY ci.grupo, count DESC, ci.id ASC
    `

    const result = await db.rawQuery(query, [...predicate.bindings, ...ciBindings])

    // Group flat rows by grupo into Record<string, Array<...>>
    const grouped: Record<string, Array<{ checklistItemId: number; nome: string; count: number }>> = {}

    for (const row of result.rows) {
      const grupo = String(row.grupo)
      const item = {
        checklistItemId: Number(row.checklist_item_id),
        nome: String(row.nome),
        count: Number(row.count) || 0,
      }

      if (!grouped[grupo]) {
        grouped[grupo] = []
      }
      grouped[grupo].push(item)
    }

    return grouped
  }

  /**
   * Main compute method — assembles all dashboard metrics.
   * Computes top-line counts, funnel, average fill time,
   * highest abandonment question, response distribution, daily time series,
   * and top checklist items in parallel.
   */
  async compute(filters: DashboardFilters): Promise<DashboardResult> {
    // Req 17.1, 17.2, 17.3 — defensive invariant: period filters are mandatory
    if (!filters.periodStart || !filters.periodEnd) {
      throw new Error('Dashboard filters require periodStart and periodEnd')
    }

    const [topLine, funnel, averageFillTimeSeconds, highestAbandonmentQuestion, responseDistribution, dailyTimeSeries, topChecklistItems] =
      await Promise.all([
        this.computeTopLineCounts(filters),
        this.computeFunnel(filters),
        this.computeAverageFillTime(filters),
        this.computeHighestAbandonmentQuestion(filters),
        this.computeResponseDistribution(filters),
        this.computeDailyTimeSeries(filters),
        this.computeTopChecklistItems(filters),
      ])

    return {
      ...topLine,
      funnel,
      averageFillTimeSeconds,
      highestAbandonmentQuestion,
      responseDistribution,
      dailyTimeSeries,
      topChecklistItems,
    }
  }
}

export default new DashboardService()
