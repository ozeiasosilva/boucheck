// ---------------------------------------------------------------------------
// PromptBuilder — Pure support module for AI question generation prompts
//
// Assembles the structured prompt sent to the Bedrock/Claude model.
// Deterministic given the request (no I/O, no side effects).
//
// Requirements covered:
//   3.1 — Structured prompt carries all inputs
//   3.2 — JSON-only instruction, schema definition
//   3.5 — Quantity and tipo constraints
//   6.1 — Correction retry prompt construction
//   6.2 — Correction includes original inputs and schema
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptPair {
  system: string
  user: string
}

export type GenerationRequest = {
  tema: string
  quantidade: number
  tipos_permitidos: Array<'escolha_unica' | 'multipla_escolha' | 'aberta'>
  publico_alvo: string
}

// ---------------------------------------------------------------------------
// PromptBuilder
// ---------------------------------------------------------------------------

export class PromptBuilder {
  /**
   * Builds the initial prompt pair for a generation request.
   *
   * The system prompt instructs the model to respond exclusively with JSON
   * matching the Generated_Questions_Schema. The user prompt carries the
   * four Generation_Request inputs.
   *
   * (Req 3.1, 3.2, 3.5)
   */
  static build(req: GenerationRequest): PromptPair {
    const system = [
      'Você é um gerador especializado de perguntas para questionários de diagnóstico em pt-BR.',
      '',
      'REGRAS OBRIGATÓRIAS DE FORMATO:',
      '1. Responda EXCLUSIVAMENTE com um array JSON válido. Nenhum texto, explicação, saudação, markdown ou commentary fora do JSON é permitido.',
      '2. O array JSON deve seguir EXATAMENTE este schema:',
      '[',
      '  {',
      '    "texto": "string (não vazio, texto da pergunta)",',
      '    "tipo": "escolha_unica" | "multipla_escolha" | "aberta",',
      '    "obrigatoria": true | false,',
      '    "opcoes": [',
      '      { "texto": "string (não vazio, texto da opção)", "pontuacao": number }',
      '    ]',
      '  }',
      ']',
      '3. Para perguntas de tipo "aberta", o campo "opcoes" DEVE ser um array vazio [].',
      '4. Para perguntas de tipo "escolha_unica" ou "multipla_escolha", o campo "opcoes" DEVE conter entre 2 e 10 objetos, cada um com "texto" (string não vazia) e "pontuacao" (número).',
      '5. Use SOMENTE os tipos de pergunta listados em "tipos_permitidos" abaixo.',
      '6. Gere EXATAMENTE a quantidade de perguntas indicada em "quantidade" abaixo.',
      '7. NÃO inclua blocos de código (```), comentários, ou qualquer caractere fora do array JSON.',
    ].join('\n')

    const user = [
      'Gere perguntas de diagnóstico com base nas seguintes especificações:',
      '',
      `Tema/Contexto: ${req.tema}`,
      `Público-alvo: ${req.publico_alvo}`,
      `Quantidade de perguntas: ${req.quantidade}`,
      `Tipos permitidos: ${req.tipos_permitidos.join(', ')}`,
      '',
      'Responda APENAS com o array JSON. Nenhuma outra saída.',
    ].join('\n')

    return { system, user }
  }

  /**
   * Builds the correction retry prompt pair.
   *
   * Reuses the same system prompt and prepends a correction instruction
   * to the user message that includes the truncated prior raw response
   * (max 500 characters).
   *
   * (Req 6.1, 6.2)
   */
  static buildCorrection(req: GenerationRequest, priorRaw: string): PromptPair {
    const { system, user: originalUserPrompt } = PromptBuilder.build(req)

    const correctionPrefix = [
      'ATENÇÃO: Sua resposta anterior NÃO era um JSON válido ou não seguiu o schema exigido.',
      'Corrija sua resposta e retorne APENAS o array JSON no formato especificado.',
      'Sua resposta anterior (inválida):',
      '---',
      priorRaw.slice(0, 500),
      '---',
    ].join('\n')

    const user = `${correctionPrefix}\n\n${originalUserPrompt}`

    return { system, user }
  }
}
