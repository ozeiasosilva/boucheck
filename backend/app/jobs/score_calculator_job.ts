import type { ReportingQueueMessage } from '#services/reporting_queue_client'
import type { JobContext } from './reporting_dispatcher.js'
import { ScoreCalculator } from '#services/score_calculator'
import { loadAnsweredChoiceRows, loadBands } from '../support/response_answer_queries.js'
import Response from '#models/response'
import reportingQueue from '#services/reporting_queue_client'
import type { ReportingQueueClient } from '#services/reporting_queue_client'

// ---------------------------------------------------------------------------
// Score Calculator Job (Req 1.1, 1.2, 1.3, 1.4)
//
// Consumes a `score_calculate` message (Completion_Handoff_Message) from
// Reporting_Queue. Loads the Response_Session's Answered_Path answers and
// maturity bands, computes scoring via the pure ScoreCalculator, persists
// the normalized score and classified faixa to the response row (overwrite,
// never insert — Req 1.4), and enqueues the next pipeline stage
// (`report_generate`).
//
// Idempotency: redelivered messages always recompute and overwrite the same
// `responses` row (UPDATE, never INSERT), so no duplicate score/report can
// exist. The subsequent `report_generate` enqueue is safe to duplicate
// because Report_Generator's persistence step uses find-or-create keyed by
// the DB's `reports.response_id_unique` constraint.
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for testability.
 */
export interface ScoreCalculatorJobDeps {
  queue: ReportingQueueClient
}

/**
 * Handles a `score_calculate` message from Reporting_Queue.
 *
 * 1. Loads the Answered_Path choice rows (excludes `aberta` questions) — Req 1.1
 * 2. Loads the maturity band definitions for the response's survey
 * 3. Calls ScoreCalculator.compute to produce the full scoring result
 * 4. Persists `pontuacao` and `faixa_id` to the responses row (overwrite) — Req 1.2, 1.4
 * 5. Enqueues `report_generate` for the same response — Req 1.3
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 18.2
 */
export async function handleScoreCalculation(
  message: ReportingQueueMessage & { kind: 'score_calculate' },
  ctx: JobContext,
  deps?: ScoreCalculatorJobDeps
): Promise<void> {
  const queue = deps?.queue ?? reportingQueue
  const { response_id: responseId } = message

  // Structured log: job start (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'score_calculation_start',
      response_id: responseId,
      message_id: ctx.messageId,
      retry_count: ctx.retryCount,
    })
  )

  // 1. Load the Answered_Path choice rows (Req 1.1, 2.2, 2.4)
  const answers = await loadAnsweredChoiceRows(responseId)

  // 2. Load the maturity band definitions for the response's survey
  const bands = await loadBands(responseId)

  // 3. Compute scoring via pure ScoreCalculator
  const result = ScoreCalculator.compute(answers, bands)

  // 4. Persist score and band to the response row — UPDATE, never INSERT (Req 1.2, 1.4)
  await Response.query()
    .where('id', responseId)
    .update({ pontuacao: result.normalizedScore, faixa_id: result.faixaId })

  // 5. Enqueue the next pipeline stage (Req 1.3)
  await queue.enqueue({ kind: 'report_generate', response_id: responseId })

  // Structured log: job success (Req 19.1)
  console.log(
    JSON.stringify({
      event: 'score_calculation_success',
      response_id: responseId,
      message_id: ctx.messageId,
      normalized_score: result.normalizedScore,
      faixa_id: result.faixaId,
    })
  )
}
