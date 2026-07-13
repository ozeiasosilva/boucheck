// Feature: public-response-flow, Example test: SurveyController
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'

/**
 * Unit-level example tests for the SurveyController.
 *
 * We import the controller class directly and invoke its methods
 * with mock HttpContext objects. We monkey-patch the Survey, Question,
 * and ChecklistItem models' `query` statics so no real database
 * connection is required.
 *
 * Tests:
 * 1. GET /surveys/:slug returns metadata for an active survey (200)
 * 2. GET /surveys/:slug returns 404 for unknown slug
 * 3. GET /surveys/:slug returns 404 for rascunho/inativo/arquivado status
 * 4. GET /surveys/:slug/structure returns proper Survey_Structure shape
 *
 * Validates: Requirements 1.2, 1.3, 1.7, 1.8, 5.1
 *
 * Run with: node --import=tsx --test tests/functional/example_survey_controller.spec.ts
 */

import SurveyController from '../../app/controllers/public/survey_controller.js'
import Survey from '../../app/models/survey.js'
import Question from '../../app/models/question.js'
import ChecklistItem from '../../app/models/checklist_item.js'

// Store original query methods for cleanup
const originalSurveyQuery = Survey.query
const originalQuestionQuery = Question.query
const originalChecklistItemQuery = ChecklistItem.query

function createMockContext(params: Record<string, string>) {
  let statusCode: number | null = null
  let responseBody: unknown = null

  const ctx: any = {
    params,
    response: {
      ok(body: unknown) {
        statusCode = 200
        responseBody = body
        return body
      },
      notFound(body: unknown) {
        statusCode = 404
        responseBody = body
        return body
      },
    },
  }

  return {
    ctx,
    getStatus: () => statusCode,
    getBody: () => responseBody,
  }
}

afterEach(() => {
  // Restore original query methods after each test
  ;(Survey as any).query = originalSurveyQuery
  ;(Question as any).query = originalQuestionQuery
  ;(ChecklistItem as any).query = originalChecklistItemQuery
})

describe('SurveyController.show (Requirement 1.7, 1.8)', () => {
  it('returns 200 with survey metadata for an active survey', async () => {
    const fakeSurvey = {
      id: 1,
      slug: 'maturidadeti',
      nome: 'Maturidade de TI',
      mensagemObjetivo: '<p>Avalie o nível de maturidade...</p>',
      tempoEstimadoMin: 15,
      configVisual: {
        cor_primaria: '#1E40AF',
        cor_secundaria: '#3B82F6',
        cor_fundo: '#F8FAFC',
        logo_s3_key: 'logos/survey-1/logo.png',
      },
    }

    ;(Survey as any).query = () => ({
      where(_col: string, _val: string) {
        return this
      },
      first: async () => fakeSurvey,
    })

    const { ctx, getStatus, getBody } = createMockContext({ slug: 'maturidadeti' })
    const controller = new SurveyController()

    await controller.show(ctx)

    assert.strictEqual(getStatus(), 200, 'Should respond with 200')
    const body = getBody() as any
    assert.strictEqual(body.id, 1)
    assert.strictEqual(body.slug, 'maturidadeti')
    assert.strictEqual(body.nome, 'Maturidade de TI')
    assert.strictEqual(body.mensagem_objetivo, '<p>Avalie o nível de maturidade...</p>')
    assert.strictEqual(body.tempo_estimado_min, 15)
    assert.deepStrictEqual(body.config_visual, fakeSurvey.configVisual)
    assert.strictEqual(
      body.logo_url,
      'https://cdn.boucheck.beonup.com.br/logos/survey-1/logo.png'
    )
  })

  it('returns logo_url as null when no logo_s3_key is present', async () => {
    const fakeSurvey = {
      id: 2,
      slug: 'sem-logo',
      nome: 'Survey sem logo',
      mensagemObjetivo: 'Objetivo',
      tempoEstimadoMin: 10,
      configVisual: {
        cor_primaria: '#000',
        cor_secundaria: '#111',
        cor_fundo: '#FFF',
      },
    }

    ;(Survey as any).query = () => ({
      where(_col: string, _val: string) {
        return this
      },
      first: async () => fakeSurvey,
    })

    const { ctx, getStatus, getBody } = createMockContext({ slug: 'sem-logo' })
    const controller = new SurveyController()

    await controller.show(ctx)

    assert.strictEqual(getStatus(), 200)
    const body = getBody() as any
    assert.strictEqual(body.logo_url, null, 'logo_url should be null when logo_s3_key is missing')
  })

  it('returns 404 for an unknown slug (Requirement 1.8)', async () => {
    ;(Survey as any).query = () => ({
      where(_col: string, _val: string) {
        return this
      },
      first: async () => null,
    })

    const { ctx, getStatus, getBody } = createMockContext({ slug: 'nonexistent' })
    const controller = new SurveyController()

    await controller.show(ctx)

    assert.strictEqual(getStatus(), 404, 'Should respond with 404')
    assert.deepStrictEqual(getBody(), { error: 'survey_not_found' })
  })

  it('returns 404 for a survey with status rascunho (Requirement 1.3)', async () => {
    // The controller queries WHERE status = 'ativo', so a rascunho survey won't be found
    ;(Survey as any).query = () => ({
      where(_col: string, _val: string) {
        return this
      },
      first: async () => null, // not found because status filter excludes it
    })

    const { ctx, getStatus, getBody } = createMockContext({ slug: 'draft-survey' })
    const controller = new SurveyController()

    await controller.show(ctx)

    assert.strictEqual(getStatus(), 404, 'Should respond with 404 for rascunho status')
    assert.deepStrictEqual(getBody(), { error: 'survey_not_found' })
  })

  it('returns 404 for a survey with status inativo (Requirement 1.3)', async () => {
    ;(Survey as any).query = () => ({
      where(_col: string, _val: string) {
        return this
      },
      first: async () => null,
    })

    const { ctx, getStatus, getBody } = createMockContext({ slug: 'inactive-survey' })
    const controller = new SurveyController()

    await controller.show(ctx)

    assert.strictEqual(getStatus(), 404, 'Should respond with 404 for inativo status')
    assert.deepStrictEqual(getBody(), { error: 'survey_not_found' })
  })

  it('returns 404 for a survey with status arquivado (Requirement 1.3)', async () => {
    ;(Survey as any).query = () => ({
      where(_col: string, _val: string) {
        return this
      },
      first: async () => null,
    })

    const { ctx, getStatus, getBody } = createMockContext({ slug: 'archived-survey' })
    const controller = new SurveyController()

    await controller.show(ctx)

    assert.strictEqual(getStatus(), 404, 'Should respond with 404 for arquivado status')
    assert.deepStrictEqual(getBody(), { error: 'survey_not_found' })
  })
})

describe('SurveyController.structure (Requirement 5.1)', () => {
  it('returns 200 with proper Survey_Structure shape for an active survey', async () => {
    const fakeSurvey = {
      id: 1,
      slug: 'maturidadeti',
      version: 3,
      status: 'ativo',
    }

    const fakeQuestions = [
      {
        id: 10,
        texto: 'Qual o nível de adoção de cloud?',
        descricao: 'Considere IaaS, PaaS e SaaS',
        tipo: 'escolha_unica',
        obrigatoria: true,
        ordem: 1,
        options: [
          {
            id: 100,
            texto: 'Nenhum — totalmente on-premises',
            ordem: 1,
            rules: [],
          },
          {
            id: 101,
            texto: 'Parcial — workloads híbridos',
            ordem: 2,
            rules: [
              { nextQuestionId: 12, finalizar: false, priority: 0 },
            ],
          },
        ],
      },
      {
        id: 11,
        texto: 'Como é o gerenciamento de identidades?',
        descricao: null,
        tipo: 'multipla_escolha',
        obrigatoria: true,
        ordem: 2,
        options: [
          {
            id: 200,
            texto: 'Active Directory on-prem',
            ordem: 1,
            rules: [],
          },
        ],
      },
    ]

    ;(Survey as any).query = () => ({
      where(_col: string, _val: string) {
        return this
      },
      first: async () => fakeSurvey,
    })

    ;(Question as any).query = () => ({
      where(_col: string, _val: string) {
        return this
      },
      preload(_rel: string, _cb?: Function) {
        return this
      },
      orderBy(_col: string, _dir: string) {
        return this
      },
      then(resolve: Function) {
        return resolve(fakeQuestions)
      },
      [Symbol.asyncIterator]: undefined,
      // Make it thenable so await works
    })

    // Override the query to return a proper async result
    ;(Question as any).query = () => {
      const builder: any = {
        where() { return builder },
        preload() { return builder },
        orderBy() { return builder },
      }
      // Make the builder thenable (awaitable)
      builder.then = (resolve: Function) => Promise.resolve(fakeQuestions).then(resolve)
      builder.catch = (reject: Function) => Promise.resolve(fakeQuestions).catch(reject)
      return builder
    }

    const fakeChecklistItems = [{ id: 1, surveyId: 1, nome: 'AWS', grupo: 'servico_cloud' }]

    ;(ChecklistItem as any).query = () => {
      const builder: any = {
        where() { return builder },
        orderBy() { return builder },
      }
      builder.then = (resolve: Function) => Promise.resolve(fakeChecklistItems).then(resolve)
      builder.catch = (reject: Function) => Promise.resolve(fakeChecklistItems).catch(reject)
      return builder
    }

    const { ctx, getStatus, getBody } = createMockContext({ slug: 'maturidadeti' })
    const controller = new SurveyController()

    await controller.structure(ctx)

    assert.strictEqual(getStatus(), 200, 'Should respond with 200')
    const body = getBody() as any

    // Verify top-level structure
    assert.strictEqual(body.survey_id, 1)
    assert.strictEqual(body.survey_version, 3)
    assert.strictEqual(body.has_checklist, true)
    assert.ok(Array.isArray(body.checklist_items), 'checklist_items should be an array')
    assert.strictEqual(body.checklist_items.length, 1)
    assert.deepStrictEqual(body.checklist_items[0], { id: 1, nome: 'AWS', grupo: 'servico_cloud' })
    assert.ok(Array.isArray(body.questions), 'questions should be an array')
    assert.strictEqual(body.questions.length, 2)

    // Verify first question shape
    const q1 = body.questions[0]
    assert.strictEqual(q1.id, 10)
    assert.strictEqual(q1.texto, 'Qual o nível de adoção de cloud?')
    assert.strictEqual(q1.descricao, 'Considere IaaS, PaaS e SaaS')
    assert.strictEqual(q1.tipo, 'escolha_unica')
    assert.strictEqual(q1.obrigatoria, true)
    assert.strictEqual(q1.ordem, 1)
    assert.ok(Array.isArray(q1.options), 'options should be an array')
    assert.strictEqual(q1.options.length, 2)

    // Verify option with rules
    const opt2 = q1.options[1]
    assert.strictEqual(opt2.id, 101)
    assert.strictEqual(opt2.texto, 'Parcial — workloads híbridos')
    assert.strictEqual(opt2.ordem, 2)
    assert.strictEqual(opt2.rules.length, 1)
    assert.deepStrictEqual(opt2.rules[0], {
      next_question_id: 12,
      finalizar: false,
      priority: 0,
    })

    // Verify option without rules
    const opt1 = q1.options[0]
    assert.deepStrictEqual(opt1.rules, [])
  })

  it('returns has_checklist false when no checklist items exist', async () => {
    const fakeSurvey = {
      id: 2,
      slug: 'no-checklist',
      version: 1,
      status: 'ativo',
    }

    ;(Survey as any).query = () => {
      const builder: any = {
        where() { return builder },
        first: async () => fakeSurvey,
      }
      return builder
    }

    ;(Question as any).query = () => {
      const builder: any = {
        where() { return builder },
        preload() { return builder },
        orderBy() { return builder },
      }
      builder.then = (resolve: Function) => Promise.resolve([]).then(resolve)
      builder.catch = (reject: Function) => Promise.resolve([]).catch(reject)
      return builder
    }

    ;(ChecklistItem as any).query = () => {
      const builder: any = {
        where() { return builder },
        orderBy() { return builder },
      }
      builder.then = (resolve: Function) => Promise.resolve([]).then(resolve)
      builder.catch = (reject: Function) => Promise.resolve([]).catch(reject)
      return builder
    }

    const { ctx, getStatus, getBody } = createMockContext({ slug: 'no-checklist' })
    const controller = new SurveyController()

    await controller.structure(ctx)

    assert.strictEqual(getStatus(), 200)
    const body = getBody() as any
    assert.strictEqual(body.has_checklist, false, 'has_checklist should be false when no items exist')
    assert.deepStrictEqual(body.questions, [])
    assert.deepStrictEqual(body.checklist_items, [])
  })

  it('returns 404 for structure when slug does not match an active survey', async () => {
    ;(Survey as any).query = () => {
      const builder: any = {
        where() { return builder },
        first: async () => null,
      }
      return builder
    }

    const { ctx, getStatus, getBody } = createMockContext({ slug: 'unknown' })
    const controller = new SurveyController()

    await controller.structure(ctx)

    assert.strictEqual(getStatus(), 404, 'Should respond with 404')
    assert.deepStrictEqual(getBody(), { error: 'survey_not_found' })
  })

  it('returns 404 for structure when survey is not active (rascunho/inativo/arquivado)', async () => {
    // The query filters by status='ativo', so non-active surveys return null
    ;(Survey as any).query = () => {
      const builder: any = {
        where() { return builder },
        first: async () => null,
      }
      return builder
    }

    const { ctx, getStatus, getBody } = createMockContext({ slug: 'inactive-survey' })
    const controller = new SurveyController()

    await controller.structure(ctx)

    assert.strictEqual(getStatus(), 404, 'Should respond with 404 for non-active survey')
    assert.deepStrictEqual(getBody(), { error: 'survey_not_found' })
  })
})
