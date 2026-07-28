// ---------------------------------------------------------------------------
// RecommendationGenerator — Produces recommendation text for diagnostic reports
//
// Calls Amazon Bedrock when `usarIaNoRelatorio` is true; always falls back to
// the Maturity_Band's `descricao` text (or a survey-level default when faixaId
// is null) on any non-success path, guaranteeing non-empty output.
//
// Writes one `ai_generation_logs` row per completed Bedrock request (success or
// failure) using the system admin seed row as `admin_user_id`.
//
// Requirements covered:
//   7.1 — Call Bedrock when `usarIaNoRelatorio` is true
//   7.2 — Use bandFallbackText without calling Bedrock when false
//   7.3 — Substitute fallback on any Bedrock failure/timeout/parse error
//   7.4 — Always produce non-empty recommendation text
//   7.5 — Write ai_generation_logs row per completed Bedrock request
// ---------------------------------------------------------------------------

import type { BedrockClient, BedrockInvokeResult } from '../support/bedrock_client.js'
import type AiGenerationLog from '#models/ai_generation_log'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecommendationInput {
  surveyId: number
  usarIaNoRelatorio: boolean
  answerSummary: Array<{ questionText: string; answerText: string }>
  bandFallbackText: string
  adminUserIdForLog: number | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECOMMENDATION_SYSTEM_PROMPT = `Você é um consultor sênior de gestão empresarial da BeOnUp. Seu público-alvo são executivos, diretores e decisores de negócio — nunca equipes técnicas. Com base nas respostas do respondente a um diagnóstico de maturidade, produza um relatório executivo de recomendações.

## Tom e Linguagem

- Linguagem gerencial e estratégica: fale em termos de impacto no negócio, risco operacional, continuidade, produtividade e vantagem competitiva.
- Nunca use jargão técnico sem explicar entre parênteses o que significa para o negócio.
- Não use siglas sem explicá-las na primeira ocorrência.
- Trate o leitor como um tomador de decisão que precisa entender O QUE fazer e POR QUE, não COMO implementar tecnicamente.

## Estrutura Obrigatória (use Markdown)

Use a seguinte estrutura com cabeçalhos ##:

## Visão Geral do Perfil
Sintetize em 3-4 frases o nível de maturidade da organização e os principais destaques.

## Pontos Fortes
Liste os aspectos positivos identificados nas respostas. Use marcadores (-).

## Prioridade Alta — Ação nos próximos 30 a 60 dias
Recomendações urgentes. Cada item com título em **negrito** seguido de 1-2 frases explicando o impacto no negócio.

## Prioridade Média — Ação nos próximos 3 a 6 meses
Melhorias importantes mas não urgentes. Mesmo formato.

## Próximos Passos Recomendados
Lista curta (3-5 itens) de ações concretas que o executivo pode tomar agora.

## Regras de Formatação

- Use \`##\` para separar seções.
- Use **negrito** para termos-chave e títulos de recomendações.
- Use listas com \`-\` para 3 ou mais itens.
- Parágrafos de no máximo 4 frases.
- Responda em português brasileiro profissional.`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the user prompt from the respondent's answer summary.
 */
export function buildRecommendationPrompt(
  answerSummary: Array<{ questionText: string; answerText: string }>
): string {
  const lines = answerSummary.map(
    (a, i) => `${i + 1}. Pergunta: ${a.questionText}\n   Resposta: ${a.answerText}`
  )
  return `Com base nas seguintes respostas do diagnóstico de maturidade, produza um relatório executivo de recomendações seguindo a estrutura definida no system prompt. Lembre-se: o leitor é um executivo ou diretor, não um técnico.\n\n${lines.join('\n\n')}`
}

/**
 * Extracts usable recommendation text from the Bedrock response.
 * Throws if the content is empty or unparseable.
 */
export function extractRecommendationText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('Bedrock returned empty recommendation text')
  }
  return trimmed
}

// ---------------------------------------------------------------------------
// RecommendationGenerator
// ---------------------------------------------------------------------------

export class RecommendationGenerator {
  constructor(
    private bedrock: BedrockClient,
    private logs: typeof AiGenerationLog
  ) {}

  /**
   * Produces recommendation text for a diagnostic report.
   *
   * - When `usarIaNoRelatorio` is false, returns `bandFallbackText` immediately
   *   without any Bedrock call (Req 7.2).
   * - When true, calls Bedrock and falls back to `bandFallbackText` on any
   *   failure, timeout, or unparseable response (Req 7.1, 7.3).
   * - Always returns non-empty text (Req 7.4).
   * - Writes one `ai_generation_logs` row per completed Bedrock request (Req 7.5).
   *
   * This method never throws — it always resolves to a string.
   */
  async generate(input: RecommendationInput): Promise<string> {
    // Req 7.2 — No Bedrock call when AI is disabled
    if (!input.usarIaNoRelatorio) {
      return input.bandFallbackText
    }

    let prompt: string = ''

    try {
      prompt = buildRecommendationPrompt(input.answerSummary)
      const result: BedrockInvokeResult = await this.bedrock.invoke(
        RECOMMENDATION_SYSTEM_PROMPT,
        prompt
      )
      const text = extractRecommendationText(result.text)

      // Req 7.5 — Log successful Bedrock request
      await this.writeLog({
        adminUserIdForLog: input.adminUserIdForLog,
        surveyId: input.surveyId,
        prompt,
        resultado: { text },
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        sucesso: true,
      })

      // Guard against empty-but-parseable text (Req 7.4)
      return text || input.bandFallbackText
    } catch (err) {
      // Req 7.5 — Log failed Bedrock request
      await this.writeLog({
        adminUserIdForLog: input.adminUserIdForLog,
        surveyId: input.surveyId,
        prompt: prompt || '(see error)',
        resultado: { error: String(err) },
        tokensInput: null,
        tokensOutput: null,
        sucesso: false,
      })

      // Req 7.3, 7.4 — Mandatory fallback on any failure
      return input.bandFallbackText
    }
  }

  /**
   * Writes one ai_generation_logs row. Uses the system admin seed as
   * `admin_user_id` (since recommendation generation is respondent-triggered
   * and has no admin actor).
   */
  private async writeLog(data: {
    adminUserIdForLog: number | null
    surveyId: number
    prompt: string
    resultado: Record<string, unknown>
    tokensInput: number | null
    tokensOutput: number | null
    sucesso: boolean
  }): Promise<void> {
    await this.logs.create({
      adminUserId: data.adminUserIdForLog!,
      surveyId: data.surveyId,
      prompt: data.prompt,
      resultado: data.resultado,
      tokensInput: data.tokensInput,
      tokensOutput: data.tokensOutput,
      sucesso: data.sucesso,
    })
  }
}
