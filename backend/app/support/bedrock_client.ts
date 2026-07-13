// ---------------------------------------------------------------------------
// BedrockClient — Isolated support module for Amazon Bedrock invocations
//
// Wraps the AWS SDK v3 `@aws-sdk/client-bedrock-runtime` InvokeModelCommand
// with an AbortController-based timeout. This isolates the single impure
// collaborator so the QuestionGenerationService is fully mockable for testing.
//
// Credentials come from the IAM role via the default credential provider
// (no static keys).
//
// Requirements covered:
//   3.6 — Bedrock InvokeModel via configured model id
//   7.1 — Invocation via Amazon Bedrock InvokeModel API
//   7.2 — Token input capture (usage.input_tokens)
//   7.3 — Token output capture (usage.output_tokens)
// ---------------------------------------------------------------------------

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BedrockInvokeResult {
  /** The model's raw completion text (untrusted) */
  text: string
  /** usage.input_tokens when reported by the model, null otherwise */
  tokensInput: number | null
  /** usage.output_tokens when reported by the model, null otherwise */
  tokensOutput: number | null
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when the Bedrock invocation exceeds the configured timeout (→ 504) */
export class BedrockTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Bedrock invocation timed out after ${timeoutMs}ms`)
    this.name = 'BedrockTimeoutError'
  }
}

/** Thrown for SDK/network errors during Bedrock invocation */
export class BedrockInvocationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'BedrockInvocationError'
  }
}

// ---------------------------------------------------------------------------
// BedrockClient
// ---------------------------------------------------------------------------

export class BedrockClient {
  private client: BedrockRuntimeClient

  constructor(private cfg: { modelId: string; region: string; timeoutMs: number }) {
    this.client = new BedrockRuntimeClient({ region: cfg.region })
  }

  /**
   * Invokes the configured Bedrock model with the given system and user
   * prompts using the Anthropic Messages API format.
   *
   * Applies an AbortController with the configured timeout; on expiry the
   * in-flight request is aborted and a `BedrockTimeoutError` is thrown.
   *
   * On SDK/network errors a `BedrockInvocationError` is thrown.
   */
  async invoke(system: string, user: string): Promise<BedrockInvokeResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs)

    try {
      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
      })

      const command = new InvokeModelCommand({
        modelId: this.cfg.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(body),
      })

      const response = await this.client.send(command, {
        abortSignal: controller.signal,
      })

      // Decode response body
      const responseBody = new TextDecoder().decode(response.body)
      const parsed = JSON.parse(responseBody) as {
        content?: Array<{ type?: string; text?: string }>
        usage?: { input_tokens?: number; output_tokens?: number }
      }

      // Extract text from the first content block
      const text = parsed.content?.[0]?.text ?? ''

      // Extract token usage (null when absent)
      const tokensInput =
        typeof parsed.usage?.input_tokens === 'number' ? parsed.usage.input_tokens : null
      const tokensOutput =
        typeof parsed.usage?.output_tokens === 'number' ? parsed.usage.output_tokens : null

      return { text, tokensInput, tokensOutput }
    } catch (error: unknown) {
      // Detect abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BedrockTimeoutError(this.cfg.timeoutMs)
      }

      // Re-throw our own errors as-is
      if (error instanceof BedrockTimeoutError || error instanceof BedrockInvocationError) {
        throw error
      }

      // Wrap SDK/network errors
      const message =
        error instanceof Error ? error.message : 'Unknown Bedrock invocation error'
      throw new BedrockInvocationError(message, error)
    } finally {
      clearTimeout(timer)
    }
  }
}
