// ---------------------------------------------------------------------------
// QuestionGenerationService — Orchestrates the AI question generation pipeline
//
// Coordinates: PromptBuilder → BedrockClient → ResponseParser → audit log.
// Never persists questions or options — only writes ai_generation_logs rows.
//
// Requirements covered:
//   3.1, 3.3, 3.5 — Structured prompt, schema validation, quantity cap
//   4.6, 4.7     — Conforming / Non_Conforming classification handling
//   5.1, 5.2, 5.3, 5.4 — Preview return, correction retry, failure error
//   6.1, 6.2, 6.5 — Retry logic, correction prompt, failure after retry
//   8.1, 8.2, 8.3, 8.4, 8.5, 8.6 — Audit logging on every path
// ---------------------------------------------------------------------------

import type { BedrockClient, BedrockInvokeResult } from '../support/bedrock_client.js'
import { BedrockTimeoutError } from '../support/bedrock_client.js'
import { PromptBuilder } from '../support/prompt_builder.js'
import type { GenerationRequest } from '../support/prompt_builder.js'
import { ResponseParser } from '../support/response_parser.js'
import type { GeneratedQuestion } from '../support/response_parser.js'
import AiGenerationLog from '#models/ai_generation_log'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerationPreview {
  questions: GeneratedQuestion[]
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class GenerationFailedError extends Error {
  constructor(
    message: string = 'Não foi possível gerar as perguntas. Tente novamente ou ajuste o tema.'
  ) {
    super(message)
    this.name = 'GenerationFailedError'
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class QuestionGenerationService {
  constructor(
    private bedrock: BedrockClient,
    private prompts: typeof PromptBuilder = PromptBuilder,
    private parser: typeof ResponseParser = ResponseParser
  ) {}

  /**
   * Orchestrates the full generation pipeline:
   * 1. Build prompt
   * 2. Invoke Bedrock
   * 3. Parse/classify response
   * 4. On Non_Conforming: correction retry (exactly once)
   * 5. Cap results to requested quantidade
   * 6. Write audit log (success or failure)
   *
   * Never persists questions or options.
   */
  async generate(
    adminUserId: number,
    surveyId: number,
    req: GenerationRequest
  ): Promise<GenerationPreview> {
    // Step 1: Build the initial prompt and keep serialized text for audit
    const prompt = this.prompts.build(req)
    const promptText = `${prompt.system}\n\n${prompt.user}`

    // Step 2: Invoke Bedrock (first attempt)
    let first: BedrockInvokeResult
    try {
      first = await this.bedrock.invoke(prompt.system, prompt.user)
    } catch (error: unknown) {
      if (error instanceof BedrockTimeoutError) {
        // Write failure log with null tokens, then rethrow
        await this.writeLog({
          adminUserId,
          surveyId,
          prompt: promptText,
          resultado: null,
          tokensInput: null,
          tokensOutput: null,
          sucesso: false,
        })
        throw error
      }
      throw error
    }

    // Step 3: Parse and classify the first response
    const outcome = await this.parser.parse(first.text)

    if (outcome.kind === 'conforming') {
      // Conforming on first attempt — cap and return
      const questions = this.cap(outcome.questions, req.quantidade)
      await this.writeLog({
        adminUserId,
        surveyId,
        prompt: promptText,
        resultado: { questions } as unknown as Record<string, unknown>,
        tokensInput: first.tokensInput,
        tokensOutput: first.tokensOutput,
        sucesso: true,
      })
      return { questions }
    }

    // Step 4: Non_Conforming — issue exactly one correction retry
    const correction = this.prompts.buildCorrection(req, first.text)
    let second: BedrockInvokeResult
    try {
      second = await this.bedrock.invoke(correction.system, correction.user)
    } catch (error: unknown) {
      if (error instanceof BedrockTimeoutError) {
        await this.writeLog({
          adminUserId,
          surveyId,
          prompt: promptText,
          resultado: null,
          tokensInput: null,
          tokensOutput: null,
          sucesso: false,
        })
        throw error
      }
      throw error
    }

    const retryOutcome = await this.parser.parse(second.text)

    if (retryOutcome.kind === 'conforming') {
      // Retry succeeded — cap, log success with second invocation tokens, return
      const questions = this.cap(retryOutcome.questions, req.quantidade)
      await this.writeLog({
        adminUserId,
        surveyId,
        prompt: promptText,
        resultado: { questions } as unknown as Record<string, unknown>,
        tokensInput: second.tokensInput,
        tokensOutput: second.tokensOutput,
        sucesso: true,
      })
      return { questions }
    }

    // Retry also Non_Conforming — write failure log, throw GenerationFailedError
    await this.writeLog({
      adminUserId,
      surveyId,
      prompt: promptText,
      resultado: null,
      tokensInput: second.tokensInput,
      tokensOutput: second.tokensOutput,
      sucesso: false,
    })
    throw new GenerationFailedError()
  }

  /**
   * Cap the questions array to the requested quantity.
   * Defense in depth: even if the model over-produces, the preview
   * never exceeds the requested count.
   */
  private cap(questions: GeneratedQuestion[], n: number): GeneratedQuestion[] {
    return questions.slice(0, n)
  }

  /**
   * Write exactly one ai_generation_logs row per generate() call.
   */
  private async writeLog(data: {
    adminUserId: number
    surveyId: number
    prompt: string
    resultado: Record<string, unknown> | null
    tokensInput: number | null
    tokensOutput: number | null
    sucesso: boolean
  }): Promise<void> {
    await AiGenerationLog.create({
      adminUserId: data.adminUserId,
      surveyId: data.surveyId,
      prompt: data.prompt,
      resultado: data.resultado,
      tokensInput: data.tokensInput,
      tokensOutput: data.tokensOutput,
      sucesso: data.sucesso,
    })
  }
}
