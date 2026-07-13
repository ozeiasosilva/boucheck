import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  RecommendationGenerator,
  buildRecommendationPrompt,
  extractRecommendationText,
} from '../../app/services/recommendation_generator.js'
import type { RecommendationInput } from '../../app/services/recommendation_generator.js'
import type { BedrockInvokeResult } from '../../app/support/bedrock_client.js'
import { BedrockTimeoutError, BedrockInvocationError } from '../../app/support/bedrock_client.js'

/**
 * Unit tests for RecommendationGenerator.generate
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function createMockBedrock(
  behavior: 'success' | 'timeout' | 'error' | 'empty',
  result?: Partial<BedrockInvokeResult>
) {
  return {
    invoke: async (_system: string, _user: string): Promise<BedrockInvokeResult> => {
      if (behavior === 'timeout') {
        throw new BedrockTimeoutError(30_000)
      }
      if (behavior === 'error') {
        throw new BedrockInvocationError('Network error')
      }
      if (behavior === 'empty') {
        return { text: '', tokensInput: 10, tokensOutput: 0 }
      }
      return {
        text: result?.text ?? 'Recomendação gerada pela IA com base nas respostas.',
        tokensInput: result?.tokensInput ?? 150,
        tokensOutput: result?.tokensOutput ?? 200,
      }
    },
  } as any
}

function createMockLogs() {
  const rows: any[] = []
  return {
    create: async (data: any) => {
      rows.push(data)
      return data
    },
    rows,
  } as any
}

function baseInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    surveyId: 42,
    usarIaNoRelatorio: true,
    answerSummary: [
      { questionText: 'Como está a liderança?', answerText: 'Razoável' },
      { questionText: 'E a inovação?', answerText: 'Precisa melhorar' },
    ],
    bandFallbackText: 'Texto padrão da faixa de maturidade.',
    adminUserIdForLog: 1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecommendationGenerator', () => {
  describe('generate', () => {
    describe('when usarIaNoRelatorio is false (Req 7.2)', () => {
      it('returns bandFallbackText without calling Bedrock', async () => {
        const bedrock = createMockBedrock('success')
        const logs = createMockLogs()
        const gen = new RecommendationGenerator(bedrock, logs)

        const input = baseInput({ usarIaNoRelatorio: false })
        const result = await gen.generate(input)

        assert.strictEqual(result, 'Texto padrão da faixa de maturidade.')
        // No Bedrock call means no log row
        assert.strictEqual(logs.rows.length, 0)
      })
    })

    describe('when usarIaNoRelatorio is true and Bedrock succeeds (Req 7.1)', () => {
      it('returns Bedrock-generated recommendation text', async () => {
        const bedrock = createMockBedrock('success', {
          text: 'Recomendação personalizada.',
          tokensInput: 100,
          tokensOutput: 50,
        })
        const logs = createMockLogs()
        const gen = new RecommendationGenerator(bedrock, logs)

        const result = await gen.generate(baseInput())

        assert.strictEqual(result, 'Recomendação personalizada.')
      })

      it('writes a success log row (Req 7.5)', async () => {
        const bedrock = createMockBedrock('success', {
          text: 'AI text',
          tokensInput: 100,
          tokensOutput: 50,
        })
        const logs = createMockLogs()
        const gen = new RecommendationGenerator(bedrock, logs)

        await gen.generate(baseInput())

        assert.strictEqual(logs.rows.length, 1)
        const row = logs.rows[0]
        assert.strictEqual(row.surveyId, 42)
        assert.strictEqual(row.sucesso, true)
        assert.strictEqual(row.tokensInput, 100)
        assert.strictEqual(row.tokensOutput, 50)
        assert.deepStrictEqual(row.resultado, { text: 'AI text' })
        assert.strictEqual(row.adminUserId, 1)
      })
    })

    describe('when Bedrock times out (Req 7.3)', () => {
      it('returns bandFallbackText', async () => {
        const bedrock = createMockBedrock('timeout')
        const logs = createMockLogs()
        const gen = new RecommendationGenerator(bedrock, logs)

        const result = await gen.generate(baseInput())

        assert.strictEqual(result, 'Texto padrão da faixa de maturidade.')
      })

      it('writes a failure log row', async () => {
        const bedrock = createMockBedrock('timeout')
        const logs = createMockLogs()
        const gen = new RecommendationGenerator(bedrock, logs)

        await gen.generate(baseInput())

        assert.strictEqual(logs.rows.length, 1)
        const row = logs.rows[0]
        assert.strictEqual(row.sucesso, false)
        assert.strictEqual(row.tokensInput, null)
        assert.strictEqual(row.tokensOutput, null)
        assert.ok((row.resultado as any).error.includes('BedrockTimeoutError'))
      })
    })

    describe('when Bedrock invocation fails (Req 7.3)', () => {
      it('returns bandFallbackText', async () => {
        const bedrock = createMockBedrock('error')
        const logs = createMockLogs()
        const gen = new RecommendationGenerator(bedrock, logs)

        const result = await gen.generate(baseInput())

        assert.strictEqual(result, 'Texto padrão da faixa de maturidade.')
      })

      it('writes a failure log row with error info', async () => {
        const bedrock = createMockBedrock('error')
        const logs = createMockLogs()
        const gen = new RecommendationGenerator(bedrock, logs)

        await gen.generate(baseInput())

        assert.strictEqual(logs.rows.length, 1)
        const row = logs.rows[0]
        assert.strictEqual(row.sucesso, false)
        assert.ok((row.resultado as any).error.includes('Network error'))
      })
    })

    describe('when Bedrock returns empty text (Req 7.3, 7.4)', () => {
      it('returns bandFallbackText when extractRecommendationText throws', async () => {
        const bedrock = createMockBedrock('empty')
        const logs = createMockLogs()
        const gen = new RecommendationGenerator(bedrock, logs)

        const result = await gen.generate(baseInput())

        assert.strictEqual(result, 'Texto padrão da faixa de maturidade.')
      })

      it('writes a failure log row', async () => {
        const bedrock = createMockBedrock('empty')
        const logs = createMockLogs()
        const gen = new RecommendationGenerator(bedrock, logs)

        await gen.generate(baseInput())

        assert.strictEqual(logs.rows.length, 1)
        assert.strictEqual(logs.rows[0].sucesso, false)
      })
    })

    describe('non-empty guarantee (Req 7.4)', () => {
      it('never returns empty string even if bandFallbackText is non-empty', async () => {
        const bedrock = createMockBedrock('error')
        const logs = createMockLogs()
        const gen = new RecommendationGenerator(bedrock, logs)

        const result = await gen.generate(baseInput({ bandFallbackText: 'Fallback' }))

        assert.ok(result.length > 0)
      })
    })
  })

  describe('buildRecommendationPrompt', () => {
    it('includes question and answer texts', () => {
      const prompt = buildRecommendationPrompt([
        { questionText: 'Q1', answerText: 'A1' },
        { questionText: 'Q2', answerText: 'A2' },
      ])
      assert.ok(prompt.includes('Q1'))
      assert.ok(prompt.includes('A1'))
      assert.ok(prompt.includes('Q2'))
      assert.ok(prompt.includes('A2'))
    })
  })

  describe('extractRecommendationText', () => {
    it('returns trimmed text for valid input', () => {
      assert.strictEqual(extractRecommendationText('  Hello  '), 'Hello')
    })

    it('throws on empty input', () => {
      assert.throws(() => extractRecommendationText(''), /empty/)
    })

    it('throws on whitespace-only input', () => {
      assert.throws(() => extractRecommendationText('   '), /empty/)
    })
  })
})
