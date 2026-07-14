// ---------------------------------------------------------------------------
// SurveyInsightService — Orchestrates survey aggregate insight generation
//
// Coordinates: PromptResolver → BedrockClient → SurveyInsight persistence.
// Uses append-only strategy: new insights are always INSERT, query returns latest.
//
// Requirements covered:
//   1.1 — Generate insight via Bedrock with all responses
//   1.2 — Build prompt with completed responses only (quantitative + qualitative)
//   1.3 — Structured response (Análise Técnica + Análise Comercial)
//   1.4 — Persist insight with survey_id, admin_user_id, timestamp
//   1.5 — Return latest insight on query
//   1.6 — New insight replaces previous as active (append-only, query latest)
//   1.7 — Eligibility check (at least 1 completed response)
// ---------------------------------------------------------------------------

import { BedrockClient } from '../support/bedrock_client.js'
import type { PromptResolver } from './prompt_resolver.js'
import promptResolverInstance from './prompt_resolver.js'
import bedrockConfig from '#config/bedrock'
import Survey from '#models/survey'
import Response from '#models/response'
import SurveyInsight from '#models/survey_insight'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AggregatedAnswer {
  questionId: number
  questionTexto: string
  options: Array<{ texto: string; count: number; pontuacao: number }>
  textosLivres: string[]
}

export interface ChecklistAggregation {
  nome: string
  count: number
}

export interface CompletedResponseData {
  survey: {
    nome: string
    categoriaNome: string | null
  }
  totalCompleted: number
  aggregatedAnswers: AggregatedAnswer[]
  checklistItems: ChecklistAggregation[]
}

export interface SurveyInsightResult {
  id: number
  conteudo: string
  tokensInput: number | null
  tokensOutput: number | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SurveyInsightService {
  constructor(
    private bedrock: BedrockClient,
    private promptResolver: PromptResolver
  ) {}

  /**
   * Verifica se um survey é elegível para gerar insight
   * (tem ao menos 1 resposta completed).
   */
  async isEligible(surveyId: number): Promise<boolean> {
    const count = await Response.query()
      .where('surveyId', surveyId)
      .where('status', 'completo')
      .count('* as total')

    return Number(count[0].$extras.total) > 0
  }

  /**
   * Constrói o user prompt com dados agregados de todas as respostas.
   * Inclui: respostas quantitativas (opção + pontuação) e qualitativas (texto livre).
   *
   * This method is public so it can be tested independently.
   */
  buildUserPrompt(data: CompletedResponseData): string {
    const lines: string[] = []

    lines.push(`SURVEY: ${data.survey.nome} (Tipo: ${data.survey.categoriaNome ?? 'Sem categoria'})`)
    lines.push(`TOTAL RESPOSTAS COMPLETADAS: ${data.totalCompleted}`)
    lines.push('')
    lines.push('=== RESPOSTAS AGREGADAS ===')

    for (let i = 0; i < data.aggregatedAnswers.length; i++) {
      const answer = data.aggregatedAnswers[i]
      lines.push('')
      lines.push(`PERGUNTA ${i + 1}: ${answer.questionTexto}`)

      for (const opt of answer.options) {
        lines.push(`- ${opt.texto}: ${opt.count} respondentes (${opt.pontuacao} pts)`)
      }

      if (answer.textosLivres.length > 0) {
        const textos = answer.textosLivres.map((t) => `"${t}"`).join(', ')
        lines.push(`- Textos livres: ${textos}`)
      }
    }

    if (data.checklistItems.length > 0) {
      lines.push('')
      lines.push('=== CHECKLIST MAIS SELECIONADOS ===')
      for (const item of data.checklistItems) {
        lines.push(`- ${item.nome}: ${item.count}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Gera insight agregado para um survey.
   * 1. Busca todas as respostas completed do survey
   * 2. Resolve o system prompt (custom ou default)
   * 3. Constrói o user prompt com dados agregados
   * 4. Invoca Bedrock
   * 5. Persiste o insight
   */
  async generate(surveyId: number, adminUserId: number): Promise<SurveyInsightResult> {
    // 1. Fetch survey with category
    const survey = await Survey.query()
      .where('id', surveyId)
      .preload('categoria')
      .preload('questions', (query) => {
        query.orderBy('ordem', 'asc').preload('options', (optQ) => {
          optQ.orderBy('ordem', 'asc')
        })
      })
      .preload('checklistItems')
      .firstOrFail()

    // 2. Fetch completed responses with answers (including question and questionOption)
    const responses = await Response.query()
      .where('surveyId', surveyId)
      .where('status', 'completo')
      .preload('answers', (answerQuery) => {
        answerQuery.preload('question').preload('questionOption')
      })
      .preload('checklistSelections', (checklistQuery) => {
        checklistQuery.preload('checklistItem')
      })

    // 3. Aggregate answers per question
    const questionMap = new Map<
      number,
      { texto: string; optionCounts: Map<number, { texto: string; count: number; pontuacao: number }>; textosLivres: string[] }
    >()

    // Initialize from the survey questions
    for (const question of survey.questions) {
      const optionCounts = new Map<number, { texto: string; count: number; pontuacao: number }>()
      for (const opt of question.options) {
        optionCounts.set(opt.id, { texto: opt.texto, count: 0, pontuacao: opt.pontuacao })
      }
      questionMap.set(question.id, {
        texto: question.texto,
        optionCounts,
        textosLivres: [],
      })
    }

    // Aggregate response answers
    for (const resp of responses) {
      for (const answer of resp.answers) {
        const questionData = questionMap.get(answer.questionId)
        if (!questionData) continue

        if (answer.questionOptionId) {
          const optData = questionData.optionCounts.get(answer.questionOptionId)
          if (optData) {
            optData.count++
          }
        }

        if (answer.textoLivre) {
          questionData.textosLivres.push(answer.textoLivre)
        }
      }
    }

    // Aggregate checklist selections
    const checklistCountMap = new Map<number, { nome: string; count: number }>()
    for (const item of survey.checklistItems) {
      checklistCountMap.set(item.id, { nome: item.nome, count: 0 })
    }
    for (const resp of responses) {
      for (const selection of resp.checklistSelections) {
        const itemData = checklistCountMap.get(selection.checklistItemId)
        if (itemData) {
          itemData.count++
        }
      }
    }

    // Build aggregated data structure
    const aggregatedAnswers: AggregatedAnswer[] = []
    for (const question of survey.questions) {
      const qData = questionMap.get(question.id)
      if (!qData) continue

      aggregatedAnswers.push({
        questionId: question.id,
        questionTexto: qData.texto,
        options: Array.from(qData.optionCounts.values()).filter((o) => o.count > 0),
        textosLivres: qData.textosLivres,
      })
    }

    const checklistItems: ChecklistAggregation[] = Array.from(checklistCountMap.values())
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)

    const promptData: CompletedResponseData = {
      survey: {
        nome: survey.nome,
        categoriaNome: survey.categoria?.nome ?? null,
      },
      totalCompleted: responses.length,
      aggregatedAnswers,
      checklistItems,
    }

    // 4. Resolve system prompt
    const systemPrompt = await this.promptResolver.resolve('survey_agent')

    // 5. Build user prompt
    const userPrompt = this.buildUserPrompt(promptData)

    // 6. Invoke Bedrock
    const result = await this.bedrock.invoke(systemPrompt, userPrompt)

    // 7. Persist insight
    const insight = await SurveyInsight.create({
      surveyId,
      adminUserId,
      conteudo: result.text,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
    })

    return {
      id: insight.id,
      conteudo: insight.conteudo,
      tokensInput: insight.tokensInput,
      tokensOutput: insight.tokensOutput,
      createdAt: insight.createdAt.toISO()!,
    }
  }

  /**
   * Retorna o insight mais recente para um survey, ou null.
   */
  async getLatest(surveyId: number): Promise<SurveyInsight | null> {
    return SurveyInsight.query()
      .where('surveyId', surveyId)
      .orderBy('created_at', 'desc')
      .first()
  }
}

// ---------------------------------------------------------------------------
// Default singleton instance
// ---------------------------------------------------------------------------

export default new SurveyInsightService(
  new BedrockClient(bedrockConfig),
  promptResolverInstance
)
