/**
 * Shared API client for the public respondent flow.
 *
 * All public API calls go through this module so that:
 * - The base URL is configured in one place (NEXT_PUBLIC_API_URL)
 * - Common error patterns are handled consistently
 * - Each endpoint has a typed wrapper function
 */

import type { SurveyStructure } from '@/lib/navigation/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SurveyLanding {
  id: number
  slug: string
  nome: string
  mensagem_objetivo: string
  tempo_estimado_min: number
  config_visual: {
    cor_primaria: string
    cor_secundaria: string
    cor_fundo: string
    logo_s3_key: string | null
  }
  logo_url: string | null
}

export interface CreateResponseResult {
  token: string
  resumed: false
}

export interface ResumableSessionResult {
  resumable: true
  existing_token: string
  started_at: string
  answered_count: number
}

export interface IdentificationData {
  nome: string
  telefone: string
  empresa: string
  email: string
  cargo: string
  cidade: string
  aceite_politica: boolean
  politica_versao: string
}

export interface SaveAnswerBody {
  question_option_ids?: number[]
  texto_livre?: string
  invalidated_question_ids: number[]
}

export interface ApiError {
  error?: string
  message?: string
  errors?: Array<{ field: string; message: string }>
}

// ─── Error handling ──────────────────────────────────────────────────────────

export class ApiResponseError extends Error {
  constructor(
    public status: number,
    public body: ApiError
  ) {
    super(body.error || body.message || `API error ${status}`)
    this.name = 'ApiResponseError'
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    return res.json() as Promise<T>
  }
  const body = await res.json().catch(() => ({}))
  throw new ApiResponseError(res.status, body)
}

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Fetch survey landing metadata by slug.
 * Used by the SSR landing page.
 */
export async function fetchSurveyBySlug(slug: string): Promise<SurveyLanding | null> {
  const res = await fetch(`${API_URL}/api/public/surveys/${slug}`, {
    next: { revalidate: 60 },
  })

  if (res.status === 404) return null
  if (!res.ok) throw new ApiResponseError(res.status, await res.json().catch(() => ({})))

  return res.json()
}

/**
 * Fetch the full survey structure (questions, options, rules).
 * Used by the Navigation_Engine on the questions page.
 */
export async function fetchSurveyStructure(slug: string): Promise<SurveyStructure> {
  const res = await fetch(`${API_URL}/api/public/surveys/${slug}/structure`)
  return handleResponse<SurveyStructure>(res)
}

/**
 * Submit identification form and create a Response_Session.
 * Returns either a new token or resumable session info.
 */
export async function submitIdentification(
  slug: string,
  data: IdentificationData,
  forceNew: boolean = false
): Promise<CreateResponseResult | ResumableSessionResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (forceNew) {
    headers['X-Force-New-Session'] = 'true'
  }

  const res = await fetch(`${API_URL}/api/public/surveys/${slug}/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })

  return handleResponse<CreateResponseResult | ResumableSessionResult>(res)
}

/**
 * Save (upsert) an answer for a question.
 * Also handles deletion of invalidated answers from path changes.
 */
export async function saveAnswer(
  token: string,
  questionId: number,
  body: SaveAnswerBody
): Promise<{ saved: boolean }> {
  const res = await fetch(`${API_URL}/api/public/responses/${token}/answers/${questionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  return handleResponse<{ saved: boolean }>(res)
}

/**
 * Submit checklist selections.
 */
export async function submitChecklist(
  token: string,
  itemIds: number[]
): Promise<{ saved: boolean }> {
  const res = await fetch(`${API_URL}/api/public/responses/${token}/checklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checklist_item_ids: itemIds }),
  })

  return handleResponse<{ saved: boolean }>(res)
}

/**
 * Trigger completion revalidation and session transition.
 */
export async function triggerCompletion(
  token: string
): Promise<{ completed: boolean; completed_at: string }> {
  const res = await fetch(`${API_URL}/api/public/responses/${token}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  return handleResponse<{ completed: boolean; completed_at: string }>(res)
}

/**
 * Log a traceability event for the response session.
 */
export async function logEvent(
  token: string,
  tipo: string,
  payload: Record<string, unknown> = {}
): Promise<{ event_id: number }> {
  const res = await fetch(`${API_URL}/api/public/responses/${token}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, payload }),
  })

  return handleResponse<{ event_id: number }>(res)
}

// ─── Report Action Functions ─────────────────────────────────────────────────

/**
 * Request report delivery via e-mail.
 * Returns the masked e-mail for UI confirmation.
 */
export async function requestReportEmail(
  token: string
): Promise<{ masked_email: string }> {
  const res = await fetch(`${API_URL}/api/public/responses/${token}/deliveries/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  return handleResponse<{ masked_email: string }>(res)
}

/**
 * Request report delivery via WhatsApp.
 */
export async function requestReportWhatsapp(
  token: string
): Promise<Record<string, never>> {
  const res = await fetch(`${API_URL}/api/public/responses/${token}/deliveries/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  return handleResponse<Record<string, never>>(res)
}

/**
 * Request consultant scheduling.
 * Returns the link_agendamento URL on success.
 */
export async function requestConsultantSchedule(
  token: string
): Promise<{ link_agendamento: string }> {
  const res = await fetch(`${API_URL}/api/public/responses/${token}/consultant-schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  return handleResponse<{ link_agendamento: string }>(res)
}

/**
 * Fetch the public report URL (GET /r/:token endpoint).
 * Used to construct the link for "Visualizar relatório".
 */
export function getPublicReportUrl(publicToken: string): string {
  return `${API_URL}/r/${publicToken}`
}

/**
 * Fetch the report info for the current response session.
 * Returns the public_token and report URL if the report has been generated.
 */
export async function fetchReportInfo(
  token: string
): Promise<{ public_token: string; report_url: string } | null> {
  const res = await fetch(`${API_URL}/api/public/responses/${token}/report`)

  if (res.status === 404) return null
  if (!res.ok) throw new ApiResponseError(res.status, await res.json().catch(() => ({})))

  return res.json()
}
