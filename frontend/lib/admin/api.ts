/**
 * Admin API client — all authenticated admin requests go through here.
 *
 * Token is stored in localStorage under 'boucheck_admin_token'.
 * All requests include Authorization: Bearer <token> header.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333'

// ─── Error types ─────────────────────────────────────────────────────────────

export class AdminApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>
  ) {
    const base = (body.error as string) || (body.message as string) || `API error ${status}`
    const details = body.details as string | undefined
    super(details ? `${base} (${details})` : base)
    this.name = 'AdminApiError'
  }
}

// ─── Token helpers ────────────────────────────────────────────────────────────

const TOKEN_KEY = 'boucheck_admin_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function clearSessionCookie(): void {
  document.cookie = 'boucheck_admin_session=; path=/; max-age=0; samesite=lax'
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (authenticated) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}/api/admin${path}`, {
    ...options,
    headers,
  })

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    // Interceptor 401: limpa sessão e redireciona
    if (res.status === 401 && authenticated && path !== '/auth/logout') {
      clearToken()
      clearSessionCookie()
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/admin/login')) {
        window.location.href = '/admin/login'
      }
    }
    throw new AdminApiError(res.status, data)
  }

  return data as T
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminToken {
  value: string
  expiresAt: string
}

export interface LoginResult {
  token: AdminToken
  mustChangePassword: boolean
}

export interface AdminUser {
  id: number
  nome: string
  email: string
  ativo: boolean
  last_login_at: string | null
  created_at: string
}

export interface Survey {
  id: number
  slug: string
  nome: string
  categoria_id: number | null
  categoria?: Category
  status: 'rascunho' | 'ativo' | 'inativo' | 'arquivado'
  version: number
  mensagem_objetivo: string | null
  tempo_estimado_min: number | null
  config_visual: {
    cor_primaria: string
    cor_secundaria: string
    cor_fundo: string
    logo_s3_key: string | null
    tema?: 'claro' | 'escuro'
  }
  logo_url: string | null
  link_agendamento: string | null
  email_notificacao: string | null
  usar_ia_no_relatorio: boolean
  mostrar_btn_relatorio: boolean
  mostrar_btn_email: boolean
  mostrar_btn_whatsapp: boolean
  mostrar_btn_consultor: boolean
  telefone_whatsapp: string | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: number
  nome: string
  created_at: string
}

export interface Question {
  id: number
  survey_id: number
  texto: string
  descricao: string | null
  tipo: 'escolha_unica' | 'multipla_escolha' | 'aberta'
  obrigatoria: boolean
  ordem: number
  peso: number
  dimensao: string | null
  options: QuestionOption[]
  created_at: string
}

export interface QuestionOption {
  id: number
  question_id: number
  texto: string
  pontuacao: number
  ordem: number
  rule?: QuestionRule | null
}

export interface QuestionRule {
  id: number
  question_option_id: number
  next_question_id: number | null
  finalizar: boolean
  priority: number
}

export interface ChecklistItem {
  id: number
  survey_id: number
  nome: string
  grupo: 'servico_cloud' | 'fabricante' | 'solucao'
}

export interface ScoreRange {
  id: number
  survey_id: number
  nome: string
  min: number
  max: number
  descricao: string
  cor: string
}

export interface ResponseSession {
  id: string
  survey_id: number
  survey?: { nome: string; slug: string }
  nome: string
  empresa: string
  email: string
  telefone: string
  cargo: string
  cidade: string
  status: 'iniciado' | 'completo'
  pontuacao: number | null
  started_at: string
  completed_at: string | null
  anonimizado: boolean
  progress_percent: number
  fill_time_seconds: number | null
  report_visualized: boolean
  report_email_sent: boolean
  report_whatsapp_sent: boolean
  consultant_requested: boolean
  report_failed: boolean
}

export interface ResponseDetail extends ResponseSession {
  answers: Array<{
    question_id: number
    question_texto: string
    opcoes: string[]
    texto_livre: string | null
  }>
  checklist: Array<{ nome: string; grupo: string }>
  events: Array<{
    id: number
    tipo: string
    payload: Record<string, unknown> | null
    created_at: string
  }>
  time_per_question: Array<{ question_id: number; seconds: number }>
}

export interface DashboardData {
  totals: {
    page_views: number
    started: number
    completed: number
    completion_rate: number
    avg_fill_seconds: number | null
    report_visualized: number
    email_sent: number
    whatsapp_sent: number
    consultant_requested: number
  }
  funnel: Array<{ step: string; count: number }>
  top_dropout_question: { question_id: number; texto: string; count: number } | null
  daily_series: Array<{ date: string; count: number }>
  answer_distribution: Array<{
    question_id: number
    texto: string
    options: Array<{ texto: string; count: number }>
  }>
  top_checklist: Array<{ nome: string; grupo: string; count: number }>
}

export interface PaginatedResponses {
  data: ResponseSession[]
  meta: { total: number; page: number; per_page: number; last_page: number }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false),

  logout: () =>
    apiFetch<{ message: string }>('/auth/logout', { method: 'POST' }),

  forgot: (email: string) =>
    apiFetch<{ message: string }>('/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }, false),

  reset: (token: string, password: string) =>
    apiFetch<{ message: string }>('/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }, false),
}

// ─── Me ───────────────────────────────────────────────────────────────────────

export interface AdminProfile {
  id: number
  nome: string
  email: string
  role: string
  tema_preferido: 'claro' | 'escuro'
}

export const meApi = {
  getProfile: () => apiFetch<AdminProfile>('/me'),
  setTheme: (tema: 'claro' | 'escuro') =>
    apiFetch<{ tema_preferido: string }>('/me/tema', {
      method: 'PUT',
      body: JSON.stringify({ tema }),
    }),
  changePassword: (current_password: string, password: string) =>
    apiFetch<{ message: string }>('/me/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password, password }),
    }),
}

// ─── Admin Users ─────────────────────────────────────────────────────────────

export const adminUsersApi = {
  list: () => apiFetch<AdminUser[]>('/admin-users'),
  get: (id: number) => apiFetch<AdminUser>(`/admin-users/${id}`),
  create: (nome: string, email: string, password?: string) =>
    apiFetch<AdminUser>('/admin-users', {
      method: 'POST',
      body: JSON.stringify({ nome, email, ...(password ? { password } : {}) }),
    }),
  setActive: (id: number, ativo: boolean) =>
    apiFetch<AdminUser>(`/admin-users/${id}`, { method: 'PUT', body: JSON.stringify({ ativo }) }),
  resetPassword: (id: number, password: string) =>
    apiFetch<AdminUser>(`/admin-users/${id}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    }),
}

// ─── Surveys ─────────────────────────────────────────────────────────────────

export const surveysApi = {
  list: () => apiFetch<Survey[]>('/surveys'),
  get: (id: number) => apiFetch<Survey>(`/surveys/${id}`),
  create: (data: Partial<Survey>) =>
    apiFetch<Survey>('/surveys', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Survey>) =>
    apiFetch<Survey>(`/surveys/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setStatus: (id: number, status: Survey['status']) =>
    apiFetch<Survey>(`/surveys/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  archive: (id: number) =>
    apiFetch<Survey>(`/surveys/${id}/archive`, { method: 'PUT' }),
  duplicate: (id: number, slug: string) =>
    apiFetch<Survey>(`/surveys/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ slug }) }),
  setVisual: (id: number, data: { cor_primaria: string; cor_secundaria: string; cor_fundo: string; tema?: 'claro' | 'escuro' }) =>
    apiFetch<Survey>(`/surveys/${id}/visual`, { method: 'PUT', body: JSON.stringify(data) }),
  uploadLogo: async (id: number, file: File) => {
    const token = getToken()
    const form = new FormData()
    form.append('logo', file)
    const res = await fetch(`${API_URL}/api/admin/surveys/${id}/logo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new AdminApiError(res.status, data)
    return data as Survey
  },
  setDefaultLogo: (id: number) =>
    apiFetch<Survey>(`/surveys/${id}/logo/default`, { method: 'PUT' }),
  removeLogo: (id: number) =>
    apiFetch<Survey>(`/surveys/${id}/logo`, { method: 'DELETE' }),
}

// ─── Categories ──────────────────────────────────────────────────────────────

export const categoriesApi = {
  list: () => apiFetch<Category[]>('/categories'),
  create: (nome: string) =>
    apiFetch<Category>('/categories', { method: 'POST', body: JSON.stringify({ nome }) }),
  update: (id: number, nome: string) =>
    apiFetch<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ nome }) }),
  delete: (id: number) =>
    apiFetch<void>(`/categories/${id}`, { method: 'DELETE' }),
}

// ─── Questions ────────────────────────────────────────────────────────────────

export const questionsApi = {
  list: (surveyId: number) =>
    apiFetch<Question[]>(`/surveys/${surveyId}/questions`),
  store: (surveyId: number, data: Partial<Question> & { confirmed?: boolean }) =>
    apiFetch<Question>(`/surveys/${surveyId}/questions`, { method: 'POST', body: JSON.stringify(data) }),
  get: (id: number) => apiFetch<Question>(`/questions/${id}`),
  update: (id: number, data: Partial<Question> & { confirmed?: boolean }) =>
    apiFetch<Question>(`/questions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number, confirmed = false) =>
    apiFetch<void>(`/questions/${id}${confirmed ? '?confirmed=true' : ''}`, { method: 'DELETE' }),
  reorder: (surveyId: number, ordem: Array<{ id: number; ordem: number }>, confirmed = false) =>
    apiFetch<void>(`/surveys/${surveyId}/questions/reorder`, { method: 'PUT', body: JSON.stringify({ ordem, confirmed }) }),
}

// ─── Options ─────────────────────────────────────────────────────────────────

export const optionsApi = {
  store: (questionId: number, data: Partial<QuestionOption> & { confirmed?: boolean }) =>
    apiFetch<QuestionOption>(`/questions/${questionId}/options`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<QuestionOption> & { confirmed?: boolean }) =>
    apiFetch<QuestionOption>(`/options/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number, confirmed = false) =>
    apiFetch<void>(`/options/${id}${confirmed ? '?confirmed=true' : ''}`, { method: 'DELETE' }),
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export const rulesApi = {
  store: (data: { question_option_id: number; next_question_id?: number | null; finalizar?: boolean; priority?: number }) =>
    apiFetch<QuestionRule>('/rules', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<QuestionRule>) =>
    apiFetch<QuestionRule>(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    apiFetch<void>(`/rules/${id}`, { method: 'DELETE' }),
  flow: (surveyId: number) =>
    apiFetch<unknown>(`/surveys/${surveyId}/flow`),
}

// ─── Checklist Items ──────────────────────────────────────────────────────────

export const checklistApi = {
  list: (surveyId: number) => apiFetch<ChecklistItem[]>(`/surveys/${surveyId}/checklist-items`),
  store: (surveyId: number, data: { nome: string; grupo: ChecklistItem['grupo'] }) =>
    apiFetch<ChecklistItem>(`/surveys/${surveyId}/checklist-items`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ChecklistItem>) =>
    apiFetch<ChecklistItem>(`/checklist-items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    apiFetch<void>(`/checklist-items/${id}`, { method: 'DELETE' }),
  import: (surveyId: number, sourceSurveyId: number) =>
    apiFetch<ChecklistItem[]>(`/surveys/${surveyId}/checklist-items/import`, {
      method: 'POST',
      body: JSON.stringify({ source_survey_id: sourceSurveyId }),
    }),
}

// ─── Score Ranges ─────────────────────────────────────────────────────────────

export const scoreRangesApi = {
  list: (surveyId: number) => apiFetch<ScoreRange[]>(`/surveys/${surveyId}/score-ranges`),
  store: (surveyId: number, data: Omit<ScoreRange, 'id' | 'survey_id'>) =>
    apiFetch<ScoreRange>(`/surveys/${surveyId}/score-ranges`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ScoreRange>) =>
    apiFetch<ScoreRange>(`/score-ranges/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    apiFetch<void>(`/score-ranges/${id}`, { method: 'DELETE' }),
}

// ─── AI ───────────────────────────────────────────────────────────────────────

export interface AiGenerateParams {
  tema: string
  quantidade: number
  tipos_permitidos: string[]
  publico_alvo: string
}

export interface AiQuestion {
  texto: string
  tipo: 'escolha_unica' | 'multipla_escolha' | 'aberta'
  obrigatoria: boolean
  opcoes: Array<{ texto: string; pontuacao: number }>
}

export const aiApi = {
  generate: (surveyId: number, params: AiGenerateParams) =>
    apiFetch<{ questions: AiQuestion[] }>(`/surveys/${surveyId}/ai/generate-questions`, {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  confirm: (surveyId: number, questions: AiQuestion[]) =>
    apiFetch<{ created: number }>(`/surveys/${surveyId}/ai/confirm-questions`, {
      method: 'POST',
      body: JSON.stringify({ questions }),
    }),
}

// ─── Responses ────────────────────────────────────────────────────────────────

export interface ResponseFilters {
  survey_id?: number | string
  start_date?: string
  end_date?: string
  status?: 'iniciado' | 'completo'
  nome?: string
  empresa?: string
  report_action?: string
  page?: number
  per_page?: number
}

export const responsesApi = {
  list: (filters: ResponseFilters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== '') params.set(k, String(v))
    })
    return apiFetch<PaginatedResponses>(`/responses?${params.toString()}`)
  },
  get: (id: string) => apiFetch<ResponseDetail>(`/responses/${id}`),
  resend: (id: string, channel?: 'email' | 'whatsapp') =>
    apiFetch<{ queued: boolean }>(`/responses/${id}/resend`, {
      method: 'POST',
      body: JSON.stringify(channel ? { channel } : {}),
    }),
  anonymize: (id: string) =>
    apiFetch<{ anonymized: boolean }>(`/responses/${id}/anonymize`, { method: 'POST' }),
  exportCsv: async (filters: ResponseFilters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== '') params.set(k, String(v))
    })
    const token = getToken()
    const res = await fetch(`${API_URL}/api/admin/responses/export.csv?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new AdminApiError(res.status, {})
    return res.blob()
  },
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  get: (surveyId: string | number, periodStart: string, periodEnd: string) => {
    const params = new URLSearchParams({
      survey_id: String(surveyId),
      period_start: periodStart,
      period_end: periodEnd,
    })
    return apiFetch<DashboardData>(`/dashboard?${params.toString()}`)
  },
}

// ─── AI Insights ──────────────────────────────────────────────────────────────

export interface InsightResult {
  id: number
  conteudo: string
  tokens_input: number | null
  tokens_output: number | null
  created_at: string
}

export interface InteractionEntry {
  id: number
  tipo: string
  observacao: string | null
  admin_user_id: number
  created_at: string
}

export interface PaginatedInteractions {
  data: InteractionEntry[]
  meta: { total: number; perPage: number; currentPage: number; lastPage: number }
}

export interface PromptsConfig {
  survey_agent: { conteudo: string | null; is_default: boolean }
  client_agent: { conteudo: string | null; is_default: boolean }
}

export const insightsApi = {
  generateSurvey: (surveyId: number) =>
    apiFetch<InsightResult>('/insights/survey', { method: 'POST', body: JSON.stringify({ survey_id: surveyId }) }),
  getSurvey: (surveyId: number) =>
    apiFetch<InsightResult | null>(`/insights/survey/${surveyId}`),
  generateClient: (responseId: string) =>
    apiFetch<InsightResult>('/insights/client', { method: 'POST', body: JSON.stringify({ response_id: responseId }) }),
  getClient: (responseId: string) =>
    apiFetch<InsightResult | null>(`/insights/client/${responseId}`),
  getInteractions: (responseId: string, page: number = 1) =>
    apiFetch<PaginatedInteractions>(`/responses/${responseId}/interactions?page=${page}`),
  createInteraction: (responseId: string, data: { tipo: string; observacao?: string }) =>
    apiFetch<InteractionEntry>(`/responses/${responseId}/interactions`, { method: 'POST', body: JSON.stringify(data) }),
  getPrompts: () =>
    apiFetch<PromptsConfig>('/ai-config/prompts'),
  updatePrompts: (data: { survey_agent_prompt?: string; client_agent_prompt?: string }) =>
    apiFetch<{ message: string }>('/ai-config/prompts', { method: 'PUT', body: JSON.stringify(data) }),
}
