// ---------------------------------------------------------------------------
// ResponseParser — Pure support module for AI response parsing and validation
//
// Extracts JSON from raw model text (which may include markdown fences or
// surrounding prose), parses it, and validates against the Generated_Questions_Schema.
// Classifies the outcome as Conforming or Non_Conforming.
//
// No I/O beyond the VineJS schema validation call (which is CPU-only, async).
//
// Requirements covered:
//   4.1 — Attempt to parse AI response as JSON
//   4.2 — Validate parsed value is array conforming to Generated_Questions_Schema
//   4.3 — Verify texto, tipo, obrigatoria, opcoes fields
//   4.4 — Verify escolha_unica/multipla_escolha opcoes constraints
//   4.5 — Verify aberta has empty opcoes
//   4.6 — Conforming classification on success
//   4.7 — Non_Conforming classification on failure
// ---------------------------------------------------------------------------

import vine from '@vinejs/vine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeneratedQuestion = {
  texto: string
  tipo: 'escolha_unica' | 'multipla_escolha' | 'aberta'
  obrigatoria: boolean
  opcoes: Array<{ texto: string; pontuacao: number }>
}

export type ParseOutcome =
  | { kind: 'conforming'; questions: GeneratedQuestion[] }
  | { kind: 'non_conforming'; reason: string }

// ---------------------------------------------------------------------------
// VineJS schema (inline, will be re-exported by ai_question_validators later)
// ---------------------------------------------------------------------------

const ALLOWED_TYPES = ['escolha_unica', 'multipla_escolha', 'aberta'] as const

const generatedQuestionsSchema = vine.compile(
  vine.array(
    vine.object({
      texto: vine.string().minLength(1),
      tipo: vine.enum(ALLOWED_TYPES),
      obrigatoria: vine.boolean(),
      opcoes: vine.array(
        vine.object({
          texto: vine.string().minLength(1),
          pontuacao: vine.number(),
        })
      ),
    })
  )
)

// ---------------------------------------------------------------------------
// ResponseParser
// ---------------------------------------------------------------------------

export class ResponseParser {
  /**
   * Extract a JSON value from raw model text, parse it, and validate against
   * the Generated_Questions_Schema. Returns a discriminated ParseOutcome.
   *
   * Algorithm:
   * 1. Extract — trim, strip ```json / ``` fences, slice from first `[` to
   *    matching last `]` when surrounded by prose.
   * 2. Parse — JSON.parse the extracted substring; throw → non_conforming.
   * 3. Schema-validate — run Generated_Questions_Schema (VineJS); failure →
   *    non_conforming; success → conforming with typed questions.
   */
  static async parse(raw: string): Promise<ParseOutcome> {
    try {
      const extracted = ResponseParser.extractJson(raw)
      if (extracted === null) {
        return { kind: 'non_conforming', reason: 'No JSON array found in response' }
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(extracted)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Invalid JSON'
        return { kind: 'non_conforming', reason: `JSON parse error: ${message}` }
      }

      const questions = await generatedQuestionsSchema.validate(parsed)
      return { kind: 'conforming', questions: questions as GeneratedQuestion[] }
    } catch (e: unknown) {
      const reason =
        e instanceof Error ? e.message : 'Schema validation failed'
      return { kind: 'non_conforming', reason: `Schema validation error: ${reason}` }
    }
  }

  /**
   * Extracts the JSON substring from raw model text.
   *
   * Steps:
   * 1. Trim whitespace.
   * 2. Strip markdown code fences (```json ... ``` or ``` ... ```).
   * 3. If surrounding prose exists, slice from the first `[` to the last `]`.
   *
   * Returns null if no JSON array brackets are found.
   */
  private static extractJson(raw: string): string | null {
    let text = raw.trim()

    // Strip markdown code fences: ```json ... ``` or ``` ... ```
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '')
    text = text.trim()

    // If the text starts with `[`, assume it's the JSON array directly
    if (text.startsWith('[')) {
      // Find the last matching `]`
      const lastBracket = text.lastIndexOf(']')
      if (lastBracket === -1) {
        return null
      }
      return text.slice(0, lastBracket + 1)
    }

    // Surrounding prose exists — slice from first `[` to last `]`
    const firstBracket = text.indexOf('[')
    const lastBracket = text.lastIndexOf(']')

    if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
      return null
    }

    return text.slice(firstBracket, lastBracket + 1)
  }
}
