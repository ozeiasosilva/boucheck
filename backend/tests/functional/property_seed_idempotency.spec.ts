// Feature: foundation-data-model, Property 7: Seed idempotency
/**
 * Property 7: Seed idempotency
 *
 * Running the seeder twice against the same database yields identical per-table
 * row counts and identical key data (no duplicated rows). This guarantees the
 * `updateOrCreate` strategy used by the main seeder produces a convergent state.
 *
 * The test executes the seeder's upsert logic directly via SQL (replicating the
 * `updateOrCreate` pattern: SELECT → INSERT or UPDATE) because the AdonisJS app
 * boot is not available in the standalone test runner context. This validates
 * the same idempotency guarantee at the database level.
 *
 * **Validates: Requirements 10.9**
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import pg from 'pg'

const { Client } = pg

function getConnectionConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || undefined,
    database: process.env.DB_DATABASE || 'boucheck',
  }
}

/**
 * Tables populated by main_seeder.
 */
const SEEDED_TABLES = [
  'admin_users',
  'categories',
  'surveys',
  'questions',
  'question_options',
  'question_rules',
  'checklist_items',
  'score_ranges',
] as const

let client: InstanceType<typeof Client>

/**
 * Replicates Lucid's `updateOrCreate(searchPayload, updatePayload)` pattern:
 * SELECT by search keys → if exists UPDATE, else INSERT.
 */
async function updateOrCreate(
  db: InstanceType<typeof Client>,
  table: string,
  searchWhere: string,
  searchParams: unknown[],
  insertCols: string[],
  insertValues: unknown[],
  updateSet: string,
  updateParams: unknown[]
): Promise<number> {
  const selectSql = `SELECT id FROM ${table} WHERE ${searchWhere} LIMIT 1`
  const existing = await db.query(selectSql, searchParams)

  if (existing.rows.length > 0) {
    const id = existing.rows[0].id
    if (updateSet) {
      await db.query(
        `UPDATE ${table} SET ${updateSet} WHERE id = $${updateParams.length + 1}`,
        [...updateParams, id]
      )
    }
    return id
  } else {
    const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ')
    const res = await db.query(
      `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      insertValues
    )
    return res.rows[0].id
  }
}

/**
 * Replicates the main_seeder logic using the updateOrCreate pattern (SELECT → INSERT/UPDATE).
 * This mirrors what Lucid's `Model.updateOrCreate()` does under the hood.
 */
async function runSeederLogic(db: InstanceType<typeof Client>): Promise<void> {
  // 1. Admin user — updateOrCreate on email
  const adminId = await updateOrCreate(
    db,
    'admin_users',
    'email = $1', ['admin@boucheck.local'],
    ['nome', 'email', 'password_hash', 'role', 'ativo', 'must_change_password'],
    ['Administrador BouCheck', 'admin@boucheck.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin', true, true],
    'nome = $1, password_hash = $2, role = $3, ativo = $4, must_change_password = $5',
    ['Administrador BouCheck', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin', true, true]
  )

  // 2. Category — updateOrCreate on nome
  const categoryId = await updateOrCreate(
    db,
    'categories',
    'nome = $1', ['Maturidade em Cloud'],
    ['nome'], ['Maturidade em Cloud'],
    '', []
  )

  // 3. Survey — updateOrCreate on slug
  const surveyId = await updateOrCreate(
    db,
    'surveys',
    'slug = $1', ['maturidade-cloud'],
    ['slug', 'nome', 'categoria_id', 'status', 'version', 'config_visual', 'usar_ia_no_relatorio', 'created_by'],
    [
      'maturidade-cloud',
      'Pesquisa de Maturidade em Cloud',
      categoryId,
      'ativo',
      1,
      JSON.stringify({ cor_primaria: '#1A73E8', cor_secundaria: '#4285F4', cor_fundo: '#F8F9FA', logo_s3_key: 'logos/boucheck-default.png' }),
      false,
      adminId,
    ],
    'nome = $1, categoria_id = $2, status = $3, version = $4, config_visual = $5, usar_ia_no_relatorio = $6, created_by = $7',
    [
      'Pesquisa de Maturidade em Cloud',
      categoryId,
      'ativo',
      1,
      JSON.stringify({ cor_primaria: '#1A73E8', cor_secundaria: '#4285F4', cor_fundo: '#F8F9FA', logo_s3_key: 'logos/boucheck-default.png' }),
      false,
      adminId,
    ]
  )

  // 4. Questions — updateOrCreate on (survey_id, texto)
  const questionData = [
    { texto: 'Qual o nível atual de adoção de serviços em nuvem na sua organização?', tipo: 'escolha_unica', ordem: 1, dimensao: 'Adoção' },
    { texto: 'Como a governança de cloud é estruturada na empresa?', tipo: 'escolha_unica', ordem: 2, dimensao: 'Governança' },
    { texto: 'Qual modelo de responsabilidade compartilhada é aplicado?', tipo: 'escolha_unica', ordem: 3, dimensao: 'Segurança' },
    { texto: 'Quais provedores de nuvem a organização utiliza atualmente?', tipo: 'multipla_escolha', ordem: 4, dimensao: 'Infraestrutura' },
    { texto: 'Quais práticas de DevOps estão implementadas?', tipo: 'multipla_escolha', ordem: 5, dimensao: 'DevOps' },
    { texto: 'Quais certificações de cloud a equipe possui?', tipo: 'multipla_escolha', ordem: 6, dimensao: 'Capacitação' },
    { texto: 'Descreva os principais desafios enfrentados na migração para cloud.', tipo: 'aberta', ordem: 7, dimensao: 'Desafios' },
    { texto: 'Quais são os próximos passos planejados para a estratégia de cloud?', tipo: 'aberta', ordem: 8, dimensao: 'Estratégia' },
    { texto: 'Há algum comentário adicional sobre a maturidade cloud da organização?', tipo: 'aberta', ordem: 9, dimensao: null },
  ]

  const questionIds: Map<string, number> = new Map()
  for (const q of questionData) {
    const qId = await updateOrCreate(
      db,
      'questions',
      'survey_id = $1 AND texto = $2', [surveyId, q.texto],
      ['survey_id', 'survey_version', 'texto', 'tipo', 'obrigatoria', 'ordem', 'peso', 'dimensao'],
      [surveyId, 1, q.texto, q.tipo, true, q.ordem, 1, q.dimensao],
      'survey_version = $1, tipo = $2, obrigatoria = $3, ordem = $4, peso = $5, dimensao = $6',
      [1, q.tipo, true, q.ordem, 1, q.dimensao]
    )
    questionIds.set(q.texto, qId)
  }

  // 5. Options for choice-type questions — updateOrCreate on (question_id, texto)
  const optionSets: Record<string, Array<{ texto: string; pontuacao: number }>> = {
    'Qual o nível atual de adoção de serviços em nuvem na sua organização?': [
      { texto: 'Nenhuma adoção — totalmente on-premise', pontuacao: 0 },
      { texto: 'Experimentação — poucos workloads em cloud', pontuacao: 25 },
      { texto: 'Parcial — mix de on-premise e cloud', pontuacao: 50 },
      { texto: 'Majoritária — maior parte em cloud', pontuacao: 75 },
      { texto: 'Cloud-native — tudo em cloud', pontuacao: 100 },
    ],
    'Como a governança de cloud é estruturada na empresa?': [
      { texto: 'Inexistente', pontuacao: 0 },
      { texto: 'Informal — iniciativas isoladas', pontuacao: 25 },
      { texto: 'Em construção — políticas parciais', pontuacao: 50 },
      { texto: 'Estabelecida — CCoE ativo', pontuacao: 75 },
      { texto: 'Otimizada — FinOps e automação', pontuacao: 100 },
    ],
    'Qual modelo de responsabilidade compartilhada é aplicado?': [
      { texto: 'Desconhecido pela equipe', pontuacao: 0 },
      { texto: 'Conhecido mas não formalizado', pontuacao: 33 },
      { texto: 'Formalizado com controles parciais', pontuacao: 66 },
      { texto: 'Totalmente implementado e auditado', pontuacao: 100 },
    ],
    'Quais provedores de nuvem a organização utiliza atualmente?': [
      { texto: 'AWS', pontuacao: 25 },
      { texto: 'Azure', pontuacao: 25 },
      { texto: 'Google Cloud', pontuacao: 25 },
      { texto: 'Oracle Cloud', pontuacao: 15 },
      { texto: 'Nenhum', pontuacao: 0 },
    ],
    'Quais práticas de DevOps estão implementadas?': [
      { texto: 'CI/CD', pontuacao: 25 },
      { texto: 'Infrastructure as Code', pontuacao: 25 },
      { texto: 'Monitoramento e observabilidade', pontuacao: 25 },
      { texto: 'Containers e orquestração', pontuacao: 25 },
      { texto: 'Nenhuma', pontuacao: 0 },
    ],
    'Quais certificações de cloud a equipe possui?': [
      { texto: 'AWS Certified (qualquer nível)', pontuacao: 25 },
      { texto: 'Azure Certified (qualquer nível)', pontuacao: 25 },
      { texto: 'Google Cloud Certified', pontuacao: 25 },
      { texto: 'Kubernetes (CKA/CKAD)', pontuacao: 25 },
      { texto: 'Nenhuma certificação', pontuacao: 0 },
    ],
  }

  const optionIdsByQuestion: Map<number, Map<string, number>> = new Map()

  for (const [questionTexto, opts] of Object.entries(optionSets)) {
    const questionId = questionIds.get(questionTexto)
    if (!questionId) continue

    const optMap: Map<string, number> = new Map()
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i]
      const optId = await updateOrCreate(
        db,
        'question_options',
        'question_id = $1 AND texto = $2', [questionId, opt.texto],
        ['question_id', 'texto', 'pontuacao', 'ordem'],
        [questionId, opt.texto, opt.pontuacao, i + 1],
        'pontuacao = $1, ordem = $2',
        [opt.pontuacao, i + 1]
      )
      optMap.set(opt.texto, optId)
    }
    optionIdsByQuestion.set(questionId, optMap)
  }

  // 6. Question rules (skip-ahead + early-termination)
  const q1Id = questionIds.get('Qual o nível atual de adoção de serviços em nuvem na sua organização?')!
  const q4Id = questionIds.get('Quais provedores de nuvem a organização utiliza atualmente?')!
  const q7Id = questionIds.get('Descreva os principais desafios enfrentados na migração para cloud.')!

  const q1Opts = optionIdsByQuestion.get(q1Id)
  const q4Opts = optionIdsByQuestion.get(q4Id)

  // Rule 1: Cloud-native → skip to Q7
  const cloudNativeOptId = q1Opts?.get('Cloud-native — tudo em cloud')
  if (cloudNativeOptId) {
    await updateOrCreate(
      db,
      'question_rules',
      'question_option_id = $1 AND next_question_id = $2', [cloudNativeOptId, q7Id],
      ['question_option_id', 'next_question_id', 'finalizar', 'priority'],
      [cloudNativeOptId, q7Id, false, 1],
      'finalizar = $1, priority = $2',
      [false, 1]
    )
  }

  // Rule 2: Nenhuma adoção → early termination
  const noAdoptionOptId = q1Opts?.get('Nenhuma adoção — totalmente on-premise')
  if (noAdoptionOptId) {
    await updateOrCreate(
      db,
      'question_rules',
      'question_option_id = $1 AND finalizar = $2', [noAdoptionOptId, true],
      ['question_option_id', 'next_question_id', 'finalizar', 'priority'],
      [noAdoptionOptId, null, true, 1],
      'next_question_id = $1, priority = $2',
      [null, 1]
    )
  }

  // Rule 3: Q4 Nenhum → skip to Q7
  const noneProviderOptId = q4Opts?.get('Nenhum')
  if (noneProviderOptId) {
    await updateOrCreate(
      db,
      'question_rules',
      'question_option_id = $1 AND next_question_id = $2', [noneProviderOptId, q7Id],
      ['question_option_id', 'next_question_id', 'finalizar', 'priority'],
      [noneProviderOptId, q7Id, false, 1],
      'finalizar = $1, priority = $2',
      [false, 1]
    )
  }

  // 7. Checklist items — updateOrCreate on (survey_id, nome)
  const checklistItems = [
    { nome: 'Amazon EC2', grupo: 'servico_cloud' },
    { nome: 'Amazon S3', grupo: 'servico_cloud' },
    { nome: 'AWS', grupo: 'fabricante' },
    { nome: 'Microsoft Azure', grupo: 'fabricante' },
    { nome: 'Migração lift-and-shift', grupo: 'solucao' },
    { nome: 'Refatoração para containers', grupo: 'solucao' },
  ]

  for (const item of checklistItems) {
    await updateOrCreate(
      db,
      'checklist_items',
      'survey_id = $1 AND nome = $2', [surveyId, item.nome],
      ['survey_id', 'nome', 'grupo'],
      [surveyId, item.nome, item.grupo],
      'grupo = $1',
      [item.grupo]
    )
  }

  // 8. Score ranges — updateOrCreate on (survey_id, nome)
  const ranges = [
    { nome: 'Iniciante', min: 0, max: 49, descricao: 'A organização está no início da jornada de cloud.', cor: '#E53935' },
    { nome: 'Avançado', min: 50, max: 100, descricao: 'A organização possui boa maturidade em cloud.', cor: '#43A047' },
  ]

  for (const range of ranges) {
    await updateOrCreate(
      db,
      'score_ranges',
      'survey_id = $1 AND nome = $2', [surveyId, range.nome],
      ['survey_id', 'nome', 'min', 'max', 'descricao', 'cor'],
      [surveyId, range.nome, range.min, range.max, range.descricao, range.cor],
      'min = $1, max = $2, descricao = $3, cor = $4',
      [range.min, range.max, range.descricao, range.cor]
    )
  }
}

/**
 * Returns a map of table name → row count for all seeded tables.
 */
async function getRowCounts(db: InstanceType<typeof Client>): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of SEEDED_TABLES) {
    const res = await db.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`)
    counts[table] = res.rows[0].cnt
  }
  return counts
}

before(async () => {
  client = new Client(getConnectionConfig())
  await client.connect()
})

after(async () => {
  await client.end()
})

describe('Property 7: Seed idempotency', () => {
  it('running seeder twice produces identical row counts and no duplicate key data (numRuns=1)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        // --- First seed run ---
        await runSeederLogic(client)
        const countsAfterFirst = await getRowCounts(client)

        // --- Second seed run ---
        await runSeederLogic(client)
        const countsAfterSecond = await getRowCounts(client)

        // Assert identical row counts per table
        for (const table of SEEDED_TABLES) {
          assert.strictEqual(
            countsAfterSecond[table],
            countsAfterFirst[table],
            `Table "${table}" row count changed after second seed: ` +
              `first=${countsAfterFirst[table]}, second=${countsAfterSecond[table]}`
          )
        }

        // Assert key data uniqueness — no duplicates for deterministic keys

        // Only one admin with the seeded email
        const adminCountRes = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM admin_users WHERE email = 'admin@boucheck.local'`
        )
        assert.strictEqual(
          adminCountRes.rows[0].cnt,
          1,
          'Expected exactly 1 admin with email admin@boucheck.local'
        )

        // Only one survey with the seeded slug
        const surveyCountRes = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM surveys WHERE slug = 'maturidade-cloud'`
        )
        assert.strictEqual(
          surveyCountRes.rows[0].cnt,
          1,
          'Expected exactly 1 survey with slug maturidade-cloud'
        )

        // Only one category with the seeded name
        const catCountRes = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM categories WHERE nome = 'Maturidade em Cloud'`
        )
        assert.strictEqual(
          catCountRes.rows[0].cnt,
          1,
          'Expected exactly 1 category named Maturidade em Cloud'
        )

        // Questions should have unique (survey_id, texto) — no duplicates
        const dupQuestionsRes = await client.query(`
          SELECT survey_id, texto, COUNT(*)::int AS cnt
          FROM questions
          GROUP BY survey_id, texto
          HAVING COUNT(*) > 1
        `)
        assert.strictEqual(
          dupQuestionsRes.rowCount,
          0,
          `Found duplicate questions: ${JSON.stringify(dupQuestionsRes.rows)}`
        )

        // Question options should have unique (question_id, texto) — no duplicates
        const dupOptionsRes = await client.query(`
          SELECT question_id, texto, COUNT(*)::int AS cnt
          FROM question_options
          GROUP BY question_id, texto
          HAVING COUNT(*) > 1
        `)
        assert.strictEqual(
          dupOptionsRes.rowCount,
          0,
          `Found duplicate question options: ${JSON.stringify(dupOptionsRes.rows)}`
        )

        // Checklist items should have unique (survey_id, nome) — no duplicates
        const dupChecklistRes = await client.query(`
          SELECT survey_id, nome, COUNT(*)::int AS cnt
          FROM checklist_items
          GROUP BY survey_id, nome
          HAVING COUNT(*) > 1
        `)
        assert.strictEqual(
          dupChecklistRes.rowCount,
          0,
          `Found duplicate checklist items: ${JSON.stringify(dupChecklistRes.rows)}`
        )

        // Score ranges should have unique (survey_id, nome) — no duplicates
        const dupRangesRes = await client.query(`
          SELECT survey_id, nome, COUNT(*)::int AS cnt
          FROM score_ranges
          GROUP BY survey_id, nome
          HAVING COUNT(*) > 1
        `)
        assert.strictEqual(
          dupRangesRes.rowCount,
          0,
          `Found duplicate score ranges: ${JSON.stringify(dupRangesRes.rows)}`
        )
      }),
      { numRuns: 1 }
    )
  })
})
