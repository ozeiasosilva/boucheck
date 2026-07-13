// Feature: public-response-flow, Integration test: Full happy-path flow
import { describe, it, mock, afterEach } from 'node:test'
import assert from 'node:assert'

/**
 * Integration-level test covering the full respondent happy-path flow:
 *
 *   1. GET /api/public/surveys/{slug}           → 200, survey metadata
 *   2. POST /api/public/surveys/{slug}/responses → 201, session token
 *   3. GET /api/public/surveys/{slug}/structure  → 200, survey structure
 *   4. PUT /api/public/responses/{token}/answers/{questionId} × 3
 *      (including one answer that triggers a conditional branch via rule.next_question_id)
 *   5. POST /api/public/responses/{token}/checklist → 200, saved
 *   6. POST /api/public/responses/{token}/complete  → 200, completed
 *
 * Asserts:
 * - Each endpoint returns the expected HTTP status code
 * - After completion, session.status === 'completo'
 * - session.completedAt is set
 * - A 'concluido' event was logged
 *
 * Validates: Requirements 1.1, 3.5, 4.6, 5.3, 6.5, 7.1, 7.2
 *
 * Run with:
 *   node --import=tsx --experimental-test-module-mocks --test tests/functional/integration_happy_path_flow.spec.ts
 */

// --- Module-level mock setup ---

// Control revalidation result
let revalidateResult = true

mock.module('../../app/services/navigation_validator.js', {
  namedExports: {
    revalidateAnsweredPath: async (
      _responseId: string,
      _surveyId: number,
      _surveyVersion: number
    ) => revalidateResult,
  },
})

// Mock the session_resume_service to avoid DB access in response creation
let mockCheckResumableResult: any = null
let lastCreateSessionInput: any = null

mock.module('../../app/services/session_resume_service.js', {
  namedExports: {
    checkResumable: async (_email: string, _surveyId: number) => mockCheckResumableResult,
    createNewSession: async (_surveyId: number, _surveyVersion: number, input: any) => {
      lastCreateSessionInput = input
      return {
        token: 'test-token-uuid-123',
        responseId: 'response-uuid-456',
        resumed: false,
      }
    },
  },
})

// Import controllers after mocking
const { default: SurveyController } = await import(
  '../../app/controllers/public/survey_controller.js'
)
const { default: ResponseController } = await import(
  '../../app/controllers/public/response_controller.js'
)
const { default: AnswerController } = await import(
  '../../app/controllers/public/answer_controller.js'
)
const { default: ChecklistController } = await import(
  '../../app/controllers/public/checklist_controller.js'
)
const { default: CompletionController } = await import(
  '../../app/controllers/public/completion_controller.js'
)
const { default: Survey } = await import('../../app/models/survey.js')
const { default: Question } = await import('../../app/models/question.js')
const { default: ChecklistItem } = await import('../../app/models/checklist_item.js')
const { default: ResponseAnswer } = await import('../../app/models/response_answer.js')
const { default: ResponseEvent } = await import('../../app/models/response_event.js')
const { default: ResponseChecklist } = await import('../../app/models/response_checklist.js')

// --- Test fixtures ---

const FAKE_SURVEY = {
  id: 1,
  slug: 'maturidadeti',
  nome: 'Maturidade de TI',
  mensagemObjetivo: '<p>Avalie o nível de maturidade de TI</p>',
  tempoEstimadoMin: 15,
  version: 3,
  status: 'ativo',
  configVisual: {
    cor_primaria: '#1E40AF',
    cor_secundaria: '#3B82F6',
    cor_fundo: '#F8FAFC',
    logo_s3_key: 'logos/survey-1/logo.png',
  },
}

/**
 * Survey structure with 4 questions:
 * Q1 (ordem=1, escolha_unica): option 101 has rule → jump to Q3
 * Q2 (ordem=2, multipla_escolha): sequential next (if reached)
 * Q3 (ordem=3, escolha_unica): sequential next
 * Q4 (ordem=4, aberta): last question
 *
 * Happy path: answer Q1 with option 101 → branches to Q3 → then Q4 (skips Q2)
 */
const FAKE_QUESTIONS = [
  {
    id: 10,
    texto: 'Qual o nível de adoção de cloud?',
    descricao: 'Considere IaaS, PaaS e SaaS',
    tipo: 'escolha_unica',
    obrigatoria: true,
    ordem: 1,
    options: [
      { id: 100, texto: 'Nenhum — on-premises', ordem: 1, rules: [] },
      {
        id: 101,
        texto: 'Parcial — workloads híbridos',
        ordem: 2,
        rules: [{ nextQuestionId: 30, finalizar: false, priority: 0 }],
      },
    ],
  },
  {
    id: 20,
    texto: 'Como é o gerenciamento de identidades?',
    descricao: null,
    tipo: 'multipla_escolha',
    obrigatoria: true,
    ordem: 2,
    options: [
      { id: 200, texto: 'Active Directory on-prem', ordem: 1, rules: [] },
      { id: 201, texto: 'Azure AD', ordem: 2, rules: [] },
    ],
  },
  {
    id: 30,
    texto: 'Qual a estratégia de backup?',
    descricao: 'Descreva as rotinas de backup',
    tipo: 'escolha_unica',
    obrigatoria: true,
    ordem: 3,
    options: [
      { id: 300, texto: 'Backup local apenas', ordem: 1, rules: [] },
      { id: 301, texto: 'Backup em nuvem', ordem: 2, rules: [] },
    ],
  },
  {
    id: 40,
    texto: 'Descreva sua infraestrutura atual',
    descricao: null,
    tipo: 'aberta',
    obrigatoria: false,
    ordem: 4,
    options: [],
  },
]

const FAKE_CHECKLIST_ITEMS = [
  { id: 1, surveyId: 1, nome: 'AWS', grupo: 'servico_cloud' },
  { id: 2, surveyId: 1, nome: 'Microsoft', grupo: 'fabricante' },
  { id: 3, surveyId: 1, nome: 'Microsoft 365', grupo: 'solucao' },
]

// --- Helpers ---

const originalSurveyQuery = Survey.query
const originalQuestionQuery = Question.query
const originalChecklistItemQuery = ChecklistItem.query
const originalResponseAnswerQuery = ResponseAnswer.query
const originalResponseAnswerCreate = ResponseAnswer.create
const originalResponseEventCreate = ResponseEvent.create
const originalResponseChecklistQuery = ResponseChecklist.query
const originalResponseChecklistCreateMany = ResponseChecklist.createMany

function setupSurveyMock() {
  ;(Survey as any).query = () => {
    const builder: any = {
      where() { return builder },
      first: async () => FAKE_SURVEY,
    }
    return builder
  }
}

function setupQuestionMock() {
  ;(Question as any).query = () => {
    const builder: any = {
      where() { return builder },
      preload() { return builder },
      orderBy() { return builder },
    }
    builder.then = (resolve: Function) => Promise.resolve(FAKE_QUESTIONS).then(resolve)
    builder.catch = (reject: Function) => Promise.resolve(FAKE_QUESTIONS).catch(reject)
    return builder
  }
}

function setupChecklistItemMock() {
  ;(ChecklistItem as any).query = () => {
    const builder: any = {
      where() { return builder },
      whereIn() { return builder },
      orderBy() { return builder },
    }
    builder.then = (resolve: Function) => Promise.resolve(FAKE_CHECKLIST_ITEMS).then(resolve)
    builder.catch = (reject: Function) => Promise.resolve(FAKE_CHECKLIST_ITEMS).catch(reject)
    return builder
  }
}

function createMockContext(overrides: {
  params?: Record<string, string>
  body?: Record<string, any>
  headers?: Record<string, string>
  response_session?: any
} = {}) {
  let statusCode: number | null = null
  let responseBody: unknown = null

  const ctx: any = {
    params: overrides.params ?? {},
    response_session: overrides.response_session ?? undefined,
    request: {
      validateUsing: async (_validator: any) => overrides.body ?? {},
      header: (name: string) => overrides.headers?.[name] ?? undefined,
    },
    response: {
      ok(body: unknown) {
        statusCode = 200
        responseBody = body
        return body
      },
      created(body: unknown) {
        statusCode = 201
        responseBody = body
        return body
      },
      notFound(body: unknown) {
        statusCode = 404
        responseBody = body
        return body
      },
      status(code: number) {
        statusCode = code
        return {
          json(body: unknown) {
            responseBody = body
            return body
          },
        }
      },
    },
  }

  return {
    ctx,
    getStatus: () => statusCode,
    getBody: () => responseBody,
  }
}

function createMockSession(overrides: Partial<{
  id: string
  surveyId: number
  surveyVersion: number
  status: string
  completedAt: any
}> = {}) {
  return {
    id: overrides.id ?? 'response-uuid-456',
    surveyId: overrides.surveyId ?? 1,
    surveyVersion: overrides.surveyVersion ?? 3,
    status: overrides.status ?? 'iniciado',
    completedAt: overrides.completedAt ?? null,
    async save() {
      // no-op for test — captures state changes in-place
    },
  }
}

// --- Tests ---

describe('Integration: Full happy-path flow (slug → identification → answers with branching → checklist → completion)', () => {
  afterEach(() => {
    // Restore original query methods
    ;(Survey as any).query = originalSurveyQuery
    ;(Question as any).query = originalQuestionQuery
    ;(ChecklistItem as any).query = originalChecklistItemQuery
    ;(ResponseAnswer as any).query = originalResponseAnswerQuery
    ;(ResponseAnswer as any).create = originalResponseAnswerCreate
    ;(ResponseEvent as any).create = originalResponseEventCreate
    ;(ResponseChecklist as any).query = originalResponseChecklistQuery
    ;(ResponseChecklist as any).createMany = originalResponseChecklistCreateMany
    revalidateResult = true
    mockCheckResumableResult = null
    lastCreateSessionInput = null
  })

  it('completes the full flow with status=completo and completed_at recorded', async () => {
    // Track logged events
    const loggedEvents: any[] = []

    // ================================================================
    // STEP 1: GET /api/public/surveys/{slug} → 200 with metadata
    // ================================================================
    setupSurveyMock()

    const step1 = createMockContext({ params: { slug: 'maturidadeti' } })
    const surveyController = new SurveyController()
    await surveyController.show(step1.ctx)

    assert.strictEqual(step1.getStatus(), 200, 'Step 1: GET /surveys/{slug} should return 200')
    const surveyMeta = step1.getBody() as any
    assert.strictEqual(surveyMeta.slug, 'maturidadeti')
    assert.strictEqual(surveyMeta.nome, 'Maturidade de TI')
    assert.ok(surveyMeta.config_visual, 'Should include visual identity')

    // ================================================================
    // STEP 2: POST /api/public/surveys/{slug}/responses → 201, token
    // ================================================================
    setupSurveyMock()

    const step2 = createMockContext({
      params: { slug: 'maturidadeti' },
      body: {
        nome: 'João Silva',
        telefone: '+55 (11) 99999-0000',
        empresa: 'Empresa X',
        email: 'joao@empresa.com',
        cargo: 'CTO',
        cidade: 'São Paulo',
        politica_versao: '2025-01-v1',
      },
      headers: {},
    })

    const responseController = new ResponseController()
    await responseController.store(step2.ctx)

    assert.strictEqual(step2.getStatus(), 201, 'Step 2: POST /responses should return 201')
    const sessionResult = step2.getBody() as any
    assert.strictEqual(sessionResult.token, 'test-token-uuid-123', 'Should return the session token')
    assert.strictEqual(sessionResult.resumed, false, 'Should indicate a new session')

    // Verify identification data was passed to createNewSession
    assert.strictEqual(lastCreateSessionInput.nome, 'João Silva')
    assert.strictEqual(lastCreateSessionInput.email, 'joao@empresa.com')
    assert.strictEqual(lastCreateSessionInput.politicaVersao, '2025-01-v1')

    // ================================================================
    // STEP 3: GET /api/public/surveys/{slug}/structure → 200
    // ================================================================
    setupSurveyMock()
    setupQuestionMock()
    setupChecklistItemMock()

    const step3 = createMockContext({ params: { slug: 'maturidadeti' } })
    await surveyController.structure(step3.ctx)

    assert.strictEqual(step3.getStatus(), 200, 'Step 3: GET /structure should return 200')
    const structure = step3.getBody() as any
    assert.strictEqual(structure.survey_id, 1)
    assert.strictEqual(structure.survey_version, 3)
    assert.strictEqual(structure.questions.length, 4, 'Should return all 4 questions')
    assert.strictEqual(structure.has_checklist, true, 'Should indicate checklist is available')

    // Verify branching rule exists on Q1 option 101 → next_question_id: 30
    const q1 = structure.questions[0]
    const branchingOption = q1.options.find((o: any) => o.id === 101)
    assert.ok(branchingOption, 'Q1 should have option 101')
    assert.strictEqual(
      branchingOption.rules[0].next_question_id,
      30,
      'Option 101 should branch to Q3 (id=30)'
    )

    // ================================================================
    // STEP 4: PUT /api/public/responses/{token}/answers/{questionId} × 3
    // Answer Q1 (branch to Q3), Q3, Q4 — skips Q2 due to branch
    // ================================================================
    const session = createMockSession()

    // Mock ResponseAnswer (upsert logic: delete existing + create new)
    const createdAnswers: any[] = []
    ;(ResponseAnswer as any).query = () => {
      const builder: any = {
        where() { return builder },
        whereIn() { return builder },
        delete: async () => 0,
      }
      return builder
    }
    ;(ResponseAnswer as any).create = async (data: any) => {
      createdAnswers.push(data)
      return { id: createdAnswers.length, ...data }
    }

    // Mock ResponseEvent.create for event logging
    ;(ResponseEvent as any).create = async (data: any) => {
      loggedEvents.push(data)
      return { id: loggedEvents.length, ...data }
    }

    // Mock Question.query for the answer controller's question-belongs-to-survey check
    const questionBelongsToSurveyMock = (targetQuestionId: number) => {
      ;(Question as any).query = () => {
        const builder: any = {
          where(col: string, val: any) {
            if (col === 'id') builder._queryId = val
            return builder
          },
          first: async () => {
            const found = FAKE_QUESTIONS.find((q) => q.id === targetQuestionId)
            return found ? { id: found.id, surveyId: 1 } : null
          },
        }
        return builder
      }
    }

    // --- 4a: Answer Q1 with option 101 (triggers branch to Q3 via rule) ---
    questionBelongsToSurveyMock(10)
    const step4a = createMockContext({
      params: { token: 'test-token-uuid-123', questionId: '10' },
      body: { question_option_ids: [101], invalidated_question_ids: [] },
      response_session: session,
    })

    const answerController = new AnswerController()
    await answerController.handle(step4a.ctx)

    assert.strictEqual(step4a.getStatus(), 200, 'Step 4a: PUT /answers/10 should return 200')
    assert.deepStrictEqual((step4a.getBody() as any), { saved: true })

    // --- 4b: Answer Q3 (reached via branch) with option 300 (no rule, sequential) ---
    questionBelongsToSurveyMock(30)
    const step4b = createMockContext({
      params: { token: 'test-token-uuid-123', questionId: '30' },
      body: { question_option_ids: [300], invalidated_question_ids: [] },
      response_session: session,
    })

    await answerController.handle(step4b.ctx)

    assert.strictEqual(step4b.getStatus(), 200, 'Step 4b: PUT /answers/30 should return 200')
    assert.deepStrictEqual((step4b.getBody() as any), { saved: true })

    // --- 4c: Answer Q4 (open text, optional — last question) ---
    questionBelongsToSurveyMock(40)
    const step4c = createMockContext({
      params: { token: 'test-token-uuid-123', questionId: '40' },
      body: { texto_livre: 'Infra 100% on-prem com plano de migração', invalidated_question_ids: [] },
      response_session: session,
    })

    await answerController.handle(step4c.ctx)

    assert.strictEqual(step4c.getStatus(), 200, 'Step 4c: PUT /answers/40 should return 200')
    assert.deepStrictEqual((step4c.getBody() as any), { saved: true })

    // Verify answers were persisted
    assert.ok(createdAnswers.length >= 3, 'Should have created at least 3 answer records')

    // Verify pergunta_respondida events were logged for each answer
    const answerEvents = loggedEvents.filter((e) => e.tipo === 'pergunta_respondida')
    assert.strictEqual(answerEvents.length, 3, 'Should log 3 pergunta_respondida events')
    assert.strictEqual(answerEvents[0].payload.question_id, 10)
    assert.strictEqual(answerEvents[1].payload.question_id, 30)
    assert.strictEqual(answerEvents[2].payload.question_id, 40)

    // ================================================================
    // STEP 5: POST /api/public/responses/{token}/checklist → 200
    // ================================================================
    // Mock ChecklistItem.query for validation (items belong to survey)
    ;(ChecklistItem as any).query = () => {
      const builder: any = {
        where() { return builder },
        whereIn() { return builder },
      }
      builder.then = (resolve: Function) =>
        Promise.resolve(FAKE_CHECKLIST_ITEMS.filter((i) => [1, 3].includes(i.id))).then(resolve)
      builder.catch = (reject: Function) =>
        Promise.resolve(FAKE_CHECKLIST_ITEMS.filter((i) => [1, 3].includes(i.id))).catch(reject)
      return builder
    }

    // Mock ResponseChecklist for deletion and creation
    ;(ResponseChecklist as any).query = () => {
      const builder: any = {
        where() { return builder },
        delete: async () => 0,
      }
      return builder
    }
    ;(ResponseChecklist as any).createMany = async (rows: any[]) => {
      return rows.map((r, i) => ({ id: i + 1, ...r }))
    }

    const step5 = createMockContext({
      params: { token: 'test-token-uuid-123' },
      body: { checklist_item_ids: [1, 3] },
      response_session: session,
    })

    const checklistController = new ChecklistController()
    await checklistController.handle(step5.ctx)

    assert.strictEqual(step5.getStatus(), 200, 'Step 5: POST /checklist should return 200')
    assert.deepStrictEqual((step5.getBody() as any), { saved: true })

    // ================================================================
    // STEP 6: POST /api/public/responses/{token}/complete → 200
    // ================================================================
    revalidateResult = true

    const step6 = createMockContext({
      params: { token: 'test-token-uuid-123' },
      response_session: session,
    })

    const completionController = new CompletionController()
    await completionController.handle(step6.ctx)

    assert.strictEqual(step6.getStatus(), 200, 'Step 6: POST /complete should return 200')

    const completionBody = step6.getBody() as any
    assert.strictEqual(completionBody.completed, true, 'Response should include completed: true')
    assert.ok(completionBody.completed_at, 'Response should include completed_at timestamp')

    // ================================================================
    // FINAL ASSERTIONS: session state and event log
    // ================================================================

    // Assert session.status === 'completo'
    assert.strictEqual(
      session.status,
      'completo',
      'Final: session status should be "completo"'
    )

    // Assert session.completedAt is set
    assert.ok(
      session.completedAt,
      'Final: session.completedAt should be set'
    )

    // Assert a 'concluido' event was logged
    const concluidoEvent = loggedEvents.find((e) => e.tipo === 'concluido')
    assert.ok(concluidoEvent, 'Final: a "concluido" event should have been logged')
    assert.strictEqual(concluidoEvent.responseId, 'response-uuid-456')
    assert.ok(
      concluidoEvent.payload.completed_at,
      'Final: concluido event payload should contain completed_at'
    )

    // Assert completed_at in the response matches the session value
    assert.strictEqual(
      completionBody.completed_at,
      session.completedAt.toISO(),
      'Final: response completed_at should match session completedAt ISO string'
    )
  })
})
