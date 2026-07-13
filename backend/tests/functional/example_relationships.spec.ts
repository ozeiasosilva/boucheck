// Feature: foundation-data-model, Example test: relationship wiring
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

/**
 * Functional example tests for relationship wiring (preload).
 * Seeds a small survey graph and asserts that `preload` of each declared
 * relation returns the expected rows.
 *
 * Validates: Requirements 9.2, 9.3, 9.4
 *
 * Requires a running PostgreSQL database with migrations applied.
 * Run with: node --import=tsx --test tests/functional/example_relationships.spec.ts
 * Ensure DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE env vars are set.
 */

import 'reflect-metadata'
import { AppFactory } from '@adonisjs/core/factories/app'
import { LoggerFactory } from '@adonisjs/core/factories/logger'
import { Emitter } from '@adonisjs/core/events'
import { Database } from '@adonisjs/lucid/database'
import { BaseModel, Adapter } from '@adonisjs/lucid/orm'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let database: any

// Test data IDs
let categoryId: number
let adminUserId: number
let surveyId: number
let questionId: number
let question2Id: number
let optionId: number
let ruleId: number
let checklistItemId: number
let scoreRangeId: number
let responseId: string
let responseAnswerId: number
let responseChecklistId: number
let responseEventId: number
let reportId: number

before(async () => {
  // Create a minimal Lucid Database instance without the full AdonisJS app boot
  const app = new AppFactory().create(new URL('../../', import.meta.url), () => {})
  await app.init()

  const logger = new LoggerFactory().create()
  const emitter = new Emitter(app)

  database = new Database(
    {
      connection: 'pg',
      connections: {
        pg: {
          client: 'pg' as const,
          connection: {
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT || 5432),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_DATABASE || 'boucheck',
          },
        },
      },
    },
    logger,
    emitter as any
  )

  // Wire BaseModel to use our database instance
  BaseModel.useAdapter(new Adapter(database))

  // Seed test data in dependency order
  const [cat] = await database
    .table('categories')
    .insert({ nome: 'Rel Test Category' })
    .returning('id')
  categoryId = cat.id

  const [admin] = await database
    .table('admin_users')
    .insert({
      nome: 'Rel Test Admin',
      email: `rel-test-${randomUUID()}@test.local`,
      password_hash: '$2b$10$fakehashfortest',
      role: 'admin',
      ativo: true,
      must_change_password: false,
    })
    .returning('id')
  adminUserId = admin.id

  const [survey] = await database
    .table('surveys')
    .insert({
      slug: `rel-test-survey-${randomUUID()}`,
      nome: 'Rel Test Survey',
      categoria_id: categoryId,
      status: 'ativo',
      version: 1,
      usar_ia_no_relatorio: false,
      created_by: adminUserId,
    })
    .returning('id')
  surveyId = survey.id

  const [q1] = await database
    .table('questions')
    .insert({
      survey_id: surveyId,
      survey_version: 1,
      texto: 'Rel Q1',
      tipo: 'escolha_unica',
      obrigatoria: true,
      ordem: 1,
      peso: 1,
    })
    .returning('id')
  questionId = q1.id

  const [q2] = await database
    .table('questions')
    .insert({
      survey_id: surveyId,
      survey_version: 1,
      texto: 'Rel Q2',
      tipo: 'aberta',
      obrigatoria: false,
      ordem: 2,
      peso: 1,
    })
    .returning('id')
  question2Id = q2.id

  const [opt] = await database
    .table('question_options')
    .insert({
      question_id: questionId,
      texto: 'Rel Option A',
      pontuacao: 5,
      ordem: 1,
    })
    .returning('id')
  optionId = opt.id

  const [rule] = await database
    .table('question_rules')
    .insert({
      question_option_id: optionId,
      next_question_id: question2Id,
      finalizar: false,
      priority: 1,
    })
    .returning('id')
  ruleId = rule.id

  const [cli] = await database
    .table('checklist_items')
    .insert({
      survey_id: surveyId,
      nome: 'Rel Checklist Item',
      grupo: 'servico_cloud',
    })
    .returning('id')
  checklistItemId = cli.id

  const [sr] = await database
    .table('score_ranges')
    .insert({
      survey_id: surveyId,
      nome: 'Rel Low',
      min: 0,
      max: 50,
      descricao: 'Low range',
      cor: '#ff0000',
    })
    .returning('id')
  scoreRangeId = sr.id

  responseId = randomUUID()
  await database.table('responses').insert({
    id: responseId,
    survey_id: surveyId,
    survey_version: 1,
    token: randomUUID(),
    status: 'iniciado',
    anonimizado: false,
    faixa_id: scoreRangeId,
  })

  const [ra] = await database
    .table('response_answers')
    .insert({
      response_id: responseId,
      question_id: questionId,
      question_option_id: optionId,
      texto_livre: null,
    })
    .returning('id')
  responseAnswerId = ra.id

  const [rc] = await database
    .table('response_checklist')
    .insert({
      response_id: responseId,
      checklist_item_id: checklistItemId,
    })
    .returning('id')
  responseChecklistId = rc.id

  const [re] = await database
    .table('response_events')
    .insert({
      response_id: responseId,
      tipo: 'page_view',
      payload: JSON.stringify({ page: 1 }),
    })
    .returning('id')
  responseEventId = re.id

  const [rep] = await database
    .table('reports')
    .insert({
      response_id: responseId,
      html_s3_key: 'reports/rel-test.html',
      public_token: randomUUID(),
    })
    .returning('id')
  reportId = rep.id
})

after(async () => {
  if (database) {
    // Clean up test data in reverse dependency order
    await database.from('reports').where('id', reportId).delete().catch(() => {})
    await database.from('response_events').where('id', responseEventId).delete().catch(() => {})
    await database
      .from('response_checklist')
      .where('id', responseChecklistId)
      .delete()
      .catch(() => {})
    await database
      .from('response_answers')
      .where('id', responseAnswerId)
      .delete()
      .catch(() => {})
    await database.from('responses').where('id', responseId).delete().catch(() => {})
    await database.from('score_ranges').where('id', scoreRangeId).delete().catch(() => {})
    await database.from('checklist_items').where('id', checklistItemId).delete().catch(() => {})
    await database.from('question_rules').where('id', ruleId).delete().catch(() => {})
    await database.from('question_options').where('id', optionId).delete().catch(() => {})
    await database.from('questions').where('id', questionId).delete().catch(() => {})
    await database.from('questions').where('id', question2Id).delete().catch(() => {})
    await database.from('surveys').where('id', surveyId).delete().catch(() => {})
    await database.from('admin_users').where('id', adminUserId).delete().catch(() => {})
    await database.from('categories').where('id', categoryId).delete().catch(() => {})
    await database.manager.closeAll()
  }
})

describe('Survey model relationships', () => {
  it('Survey → questions returns expected rows', async () => {
    const { default: Survey } = await import('../../app/models/survey.js')
    const survey = await Survey.query().where('id', surveyId).preload('questions').firstOrFail()
    assert.ok(survey.questions.length >= 2, 'Should have at least 2 questions')
    const ids = survey.questions.map((q) => q.id)
    assert.ok(ids.includes(questionId), 'Should include question 1')
    assert.ok(ids.includes(question2Id), 'Should include question 2')
  })

  it('Survey → checklistItems returns expected rows', async () => {
    const { default: Survey } = await import('../../app/models/survey.js')
    const survey = await Survey.query()
      .where('id', surveyId)
      .preload('checklistItems')
      .firstOrFail()
    assert.ok(survey.checklistItems.length >= 1, 'Should have at least 1 checklist item')
    const ids = survey.checklistItems.map((c) => c.id)
    assert.ok(ids.includes(checklistItemId), 'Should include our checklist item')
  })

  it('Survey → scoreRanges returns expected rows', async () => {
    const { default: Survey } = await import('../../app/models/survey.js')
    const survey = await Survey.query()
      .where('id', surveyId)
      .preload('scoreRanges')
      .firstOrFail()
    assert.ok(survey.scoreRanges.length >= 1, 'Should have at least 1 score range')
    const ids = survey.scoreRanges.map((s) => s.id)
    assert.ok(ids.includes(scoreRangeId), 'Should include our score range')
  })

  it('Survey → responses returns expected rows', async () => {
    const { default: Survey } = await import('../../app/models/survey.js')
    const survey = await Survey.query()
      .where('id', surveyId)
      .preload('responses')
      .firstOrFail()
    assert.ok(survey.responses.length >= 1, 'Should have at least 1 response')
    const ids = survey.responses.map((r) => r.id)
    assert.ok(ids.includes(responseId), 'Should include our response')
  })

  it('Survey → categoria returns expected category', async () => {
    const { default: Survey } = await import('../../app/models/survey.js')
    const survey = await Survey.query()
      .where('id', surveyId)
      .preload('categoria')
      .firstOrFail()
    assert.strictEqual(survey.categoria.id, categoryId)
    assert.strictEqual(survey.categoria.nome, 'Rel Test Category')
  })

  it('Survey → creator returns expected admin user', async () => {
    const { default: Survey } = await import('../../app/models/survey.js')
    const survey = await Survey.query()
      .where('id', surveyId)
      .preload('creator')
      .firstOrFail()
    assert.strictEqual(survey.creator.id, adminUserId)
    assert.strictEqual(survey.creator.nome, 'Rel Test Admin')
  })
})

describe('Question model relationships', () => {
  it('Question → options returns expected rows', async () => {
    const { default: Question } = await import('../../app/models/question.js')
    const question = await Question.query()
      .where('id', questionId)
      .preload('options')
      .firstOrFail()
    assert.ok(question.options.length >= 1, 'Should have at least 1 option')
    const ids = question.options.map((o) => o.id)
    assert.ok(ids.includes(optionId), 'Should include our option')
  })
})

describe('QuestionOption model relationships', () => {
  it('QuestionOption → rules returns expected rows', async () => {
    const { default: QuestionOption } = await import('../../app/models/question_option.js')
    const option = await QuestionOption.query()
      .where('id', optionId)
      .preload('rules')
      .firstOrFail()
    assert.ok(option.rules.length >= 1, 'Should have at least 1 rule')
    const ids = option.rules.map((r) => r.id)
    assert.ok(ids.includes(ruleId), 'Should include our rule')
  })
})

describe('QuestionRule model relationships', () => {
  it('QuestionRule → nextQuestion returns expected question', async () => {
    const { default: QuestionRule } = await import('../../app/models/question_rule.js')
    const qrule = await QuestionRule.query()
      .where('id', ruleId)
      .preload('nextQuestion')
      .firstOrFail()
    assert.strictEqual(qrule.nextQuestion.id, question2Id)
    assert.strictEqual(qrule.nextQuestion.texto, 'Rel Q2')
  })
})

describe('Response model relationships', () => {
  it('Response → answers returns expected rows', async () => {
    const { default: Response } = await import('../../app/models/response.js')
    const response = await Response.query()
      .where('id', responseId)
      .preload('answers')
      .firstOrFail()
    assert.ok(response.answers.length >= 1, 'Should have at least 1 answer')
    const ids = response.answers.map((a) => a.id)
    assert.ok(ids.includes(responseAnswerId), 'Should include our answer')
  })

  it('Response → checklistSelections returns expected rows', async () => {
    const { default: Response } = await import('../../app/models/response.js')
    const response = await Response.query()
      .where('id', responseId)
      .preload('checklistSelections')
      .firstOrFail()
    assert.ok(
      response.checklistSelections.length >= 1,
      'Should have at least 1 checklist selection'
    )
    const ids = response.checklistSelections.map((c) => c.id)
    assert.ok(ids.includes(responseChecklistId), 'Should include our checklist selection')
  })

  it('Response → events returns expected rows', async () => {
    const { default: Response } = await import('../../app/models/response.js')
    const response = await Response.query()
      .where('id', responseId)
      .preload('events')
      .firstOrFail()
    assert.ok(response.events.length >= 1, 'Should have at least 1 event')
    const ids = response.events.map((e) => e.id)
    assert.ok(ids.includes(responseEventId), 'Should include our event')
  })

  it('Response → report returns expected report', async () => {
    const { default: Response } = await import('../../app/models/response.js')
    const response = await Response.query()
      .where('id', responseId)
      .preload('report')
      .firstOrFail()
    assert.ok(response.report, 'Should have a report loaded')
    assert.strictEqual(response.report.id, reportId)
    assert.strictEqual(response.report.htmlS3Key, 'reports/rel-test.html')
  })

  it('Response → survey returns expected survey', async () => {
    const { default: Response } = await import('../../app/models/response.js')
    const response = await Response.query()
      .where('id', responseId)
      .preload('survey')
      .firstOrFail()
    assert.strictEqual(response.survey.id, surveyId)
    assert.strictEqual(response.survey.nome, 'Rel Test Survey')
  })

  it('Response → faixa returns expected score range', async () => {
    const { default: Response } = await import('../../app/models/response.js')
    const response = await Response.query()
      .where('id', responseId)
      .preload('faixa')
      .firstOrFail()
    assert.ok(response.faixa, 'Should have a faixa (score range) loaded')
    assert.strictEqual(response.faixa.id, scoreRangeId)
  })
})
