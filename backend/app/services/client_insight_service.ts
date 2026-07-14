// ---------------------------------------------------------------------------
// ClientInsightService — Orchestrates individual client insight generation
//
// Coordinates: Response fetch → InteractionHistoryService → PromptResolver →
// BedrockClient → ClientInsight persistence.
//
// Requirements covered:
//   2.1 — Generate individual client insight via Bedrock
//   2.2 — Build prompt with answers, identification, interaction history
//   2.3 — Structured response with profile, attention points, recommendation
//   2.4 — Persist ClientInsight with response_id and admin_user_id
//   2.5 — Display latest saved insight
//   2.6 — Append-only: new insight replaces as active without deleting previous
// ---------------------------------------------------------------------------

import type { BedrockClient } from '../support/bedrock_client.js'
import type { PromptResolver } from './prompt_resolver.js'
import Response from '#models/response'
import ClientInsight from '#models/client_insight'
import InteractionHistory from '#models/interaction_history'
import interactionHistoryService from '#services/interaction_history_service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientPromptData {
  response: Response
  answers: Array<{ questionText: string; optionText: string | null; textoLivre: string | null }>
  interactions: InteractionHistory[]
}

export interface ClientInsightResult {
  id: number
  conteudo: string
  tokensInput: number | null
  tokensOutput: number | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ClientInsightService {
  constructor(
    private bedrock: BedrockClient,
    private promptResolver: PromptResolver
  ) {}

  /**
   * Generates an individual client insight for a given response.
   *
   * Steps:
   * 1. Fetch response with answers preloaded (including question and questionOption)
   * 2. Get interaction history via InteractionHistoryService.getAllForPrompt
   * 3. Build the user prompt with all client data
   * 4. Resolve system prompt via PromptResolver
   * 5. Invoke Bedrock
   * 6. Persist ClientInsight (append-only)
   */
  async generate(responseId: string, adminUserId: number): Promise<ClientInsightResult> {
    // Step 1: Fetch response with answers + relations
    const response = await Response.query()
      .where('id', responseId)
      .preload('answers', (query) => {
        query.preload('question')
        query.preload('questionOption')
      })
      .firstOrFail()

    // Step 2: Get interaction history
    const interactions = await interactionHistoryService.getAllForPrompt(responseId)

    // Step 3: Build the answers data
    const answers = response.answers.map((answer) => ({
      questionText: answer.question.texto,
      optionText: answer.questionOption?.texto ?? null,
      textoLivre: answer.textoLivre,
    }))

    // Step 4: Build user prompt
    const promptData: ClientPromptData = { response, answers, interactions }
    const userPrompt = this.buildUserPrompt(promptData)

    // Step 5: Resolve system prompt
    const systemPrompt = await this.promptResolver.resolve('client_agent')

    // Step 6: Invoke Bedrock
    const result = await this.bedrock.invoke(systemPrompt, userPrompt)

    // Step 7: Persist insight (append-only)
    const insight = await ClientInsight.create({
      responseId,
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
   * Returns the most recent client insight for a response, or null.
   * Uses ORDER BY created_at DESC LIMIT 1 (append-only pattern).
   */
  async getLatest(responseId: string): Promise<ClientInsight | null> {
    return ClientInsight.query()
      .where('responseId', responseId)
      .orderBy('created_at', 'desc')
      .first()
  }

  /**
   * Builds the user prompt including client answers, identification data,
   * and interaction history.
   *
   * Format:
   * ---
   * CLIENTE: {nome}
   * EMPRESA: {empresa}
   * CARGO: {cargo}
   * CIDADE: {cidade}
   *
   * === RESPOSTAS DO CLIENTE ===
   *
   * PERGUNTA: {texto}
   * RESPOSTA: {opção_texto} | Texto livre: "{texto_livre}"
   *
   * === HISTÓRICO DE INTERAÇÕES COMERCIAIS ===
   *
   * [{data}] {tipo}: {observacao}
   * ---
   */
  buildUserPrompt(data: ClientPromptData): string {
    const { response, answers, interactions } = data
    const lines: string[] = []

    // Identification section
    lines.push(`CLIENTE: ${response.nome ?? 'Não informado'}`)
    lines.push(`EMPRESA: ${response.empresa ?? 'Não informado'}`)
    lines.push(`CARGO: ${response.cargo ?? 'Não informado'}`)
    lines.push(`CIDADE: ${response.cidade ?? 'Não informado'}`)

    // Answers section
    lines.push('')
    lines.push('=== RESPOSTAS DO CLIENTE ===')

    for (const answer of answers) {
      lines.push('')
      lines.push(`PERGUNTA: ${answer.questionText}`)

      const parts: string[] = []
      if (answer.optionText) {
        parts.push(answer.optionText)
      }
      if (answer.textoLivre) {
        parts.push(`Texto livre: "${answer.textoLivre}"`)
      }
      lines.push(`RESPOSTA: ${parts.length > 0 ? parts.join(' | ') : 'Sem resposta'}`)
    }

    // Interaction history section
    lines.push('')
    lines.push('=== HISTÓRICO DE INTERAÇÕES COMERCIAIS ===')

    if (interactions.length === 0) {
      lines.push('')
      lines.push('Nenhuma interação registrada.')
    } else {
      for (const interaction of interactions) {
        const date = interaction.createdAt.toFormat('dd/MM/yyyy')
        const obs = interaction.observacao ?? ''
        lines.push('')
        lines.push(`[${date}] ${interaction.tipo}: ${obs}`.trim())
      }
    }

    return lines.join('\n')
  }
}

// ---------------------------------------------------------------------------
// Default singleton instance
// ---------------------------------------------------------------------------

import { BedrockClient as BedrockClientClass } from '../support/bedrock_client.js'
import bedrockConfig from '#config/bedrock'
import promptResolver from '#services/prompt_resolver'

export default new ClientInsightService(new BedrockClientClass(bedrockConfig), promptResolver)
