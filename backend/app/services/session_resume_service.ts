import { DateTime } from 'luxon'
import Response from '#models/response'
import ResponseAnswer from '#models/response_answer'
import ResponseEvent from '#models/response_event'

// ---------------------------------------------------------------------------
// Session Resume Service (Req 3.12, 3.13, 3.14)
//
// Implements the "Session Creation and Resume Logic" described in the
// design doc: given an e-mail + survey pair, determine whether a resumable
// `iniciado` Response_Session exists within the last 7 days, and provide the
// create-new-session path (used when none is found or the respondent
// explicitly forces a new session).
//
// The actual HTTP wiring (honoring `X-Force-New-Session`, returning 200 vs
// 201) is done by `response_controller` (task 4.2); this service only
// exposes the resume-lookup and session-creation primitives it needs.
// ---------------------------------------------------------------------------

/** Resume window: a session is only resumable within this many days of `started_at` (Req 3.12). */
export const RESUME_WINDOW_DAYS = 7

export interface ResumableSessionInfo {
  resumable: true
  existingToken: string
  startedAt: DateTime
  answeredCount: number
}

export interface IdentificationInput {
  nome: string
  telefone: string
  empresa: string
  email: string
  cargo: string
  cidade: string
  politicaVersao: string
}

export interface NewSessionResult {
  token: string
  responseId: string
  resumed: false
}

/**
 * Looks up an existing resumable Response_Session for the given e-mail and
 * survey: `status == 'iniciado'` AND `started_at` within the last
 * `RESUME_WINDOW_DAYS` days (Req 3.12), most recent first.
 *
 * Returns `null` when no such session exists.
 */
export async function findResumableSession(
  email: string,
  surveyId: number
): Promise<Response | null> {
  const cutoff = DateTime.now().minus({ days: RESUME_WINDOW_DAYS })

  const session = await Response.query()
    .where('email', email)
    .where('survey_id', surveyId)
    .where('status', 'iniciado')
    .where('started_at', '>', cutoff.toSQL()!)
    .orderBy('started_at', 'desc')
    .first()

  return session
}

/**
 * Counts the distinct questions answered so far on a Response_Session, used
 * to populate `answered_count` in the resumable-session response (design:
 * "Session Creation and Resume Logic", step 3).
 */
export async function countAnsweredQuestions(responseId: string): Promise<number> {
  const result = await ResponseAnswer.query()
    .where('response_id', responseId)
    .countDistinct('question_id as total')

  return Number(result[0].$extras.total)
}

/**
 * Resolves the resume-eligibility check into the shape the API returns to
 * the frontend when a resumable session is found (Req 3.12, 3.13):
 * `{ resumable: true, existing_token, started_at, answered_count }`.
 *
 * Returns `null` when there is nothing to resume, in which case the caller
 * should proceed with `createNewSession`.
 */
export async function checkResumable(
  email: string,
  surveyId: number
): Promise<ResumableSessionInfo | null> {
  const session = await findResumableSession(email, surveyId)
  if (!session) return null

  const answeredCount = await countAnsweredQuestions(session.id)

  return {
    resumable: true,
    existingToken: session.token,
    startedAt: session.startedAt!,
    answeredCount,
  }
}

/**
 * Creates a brand-new Response_Session for the given survey/version and
 * identification data (design: "Session Creation and Resume Logic", step 4).
 *
 * Used both when no resumable session was found and when the respondent
 * explicitly forces a new session via `X-Force-New-Session: true`
 * (Req 3.14), in which case the caller should skip `checkResumable`
 * altogether and call this directly.
 *
 * Records `started_at`, persists the identification fields and
 * `politica_versao`, and logs a `privacidade_aceita` Response_Event whose
 * payload includes the acceptance timestamp and Policy_Version (Req 3.6,
 * 3.7, 3.8).
 */
export async function createNewSession(
  surveyId: number,
  surveyVersion: number,
  input: IdentificationInput
): Promise<NewSessionResult> {
  const now = DateTime.now()

  const session = await Response.create({
    surveyId,
    surveyVersion,
    nome: input.nome,
    telefone: input.telefone,
    empresa: input.empresa,
    email: input.email,
    cargo: input.cargo,
    cidade: input.cidade,
    politicaVersao: input.politicaVersao,
    status: 'iniciado',
    startedAt: now,
    anonimizado: false,
  })

  await ResponseEvent.create({
    responseId: session.id,
    tipo: 'privacidade_aceita',
    payload: {
      accepted_at: now.toISO(),
      politica_versao: input.politicaVersao,
    },
  })

  return {
    token: session.token,
    responseId: session.id,
    resumed: false,
  }
}
