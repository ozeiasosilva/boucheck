import Response from '#models/response'

export class NotFoundException extends Error {
  status = 404
  constructor(message = 'Session not found') {
    super(message)
  }
}

export const ANONYMIZED_PLACEHOLDERS = {
  nome: '[ANONIMIZADO]',
  email: 'anonimizado@boucheck.invalid',
  telefone: '[ANONIMIZADO]',
  empresa: '[ANONIMIZADO]',
  cargo: '[ANONIMIZADO]',
  cidade: '[ANONIMIZADO]',
} as const

export class AnonymizationService {
  /**
   * Anonymizes a response session by replacing all six PII columns with
   * placeholder values and setting `anonimizado = true`.
   *
   * - Req 9.1: Throws NotFoundException for a missing session id.
   * - Req 9.5: Short-circuits with no-op when already anonymized.
   * - Req 9.2 + 9.3: Replaces PII columns and sets anonimizado in one statement.
   * - Req 9.6: On combined-UPDATE failure, retries each column independently,
   *   persists whichever succeed, and unconditionally sets anonimizado = true.
   */
  async anonymize(sessionId: string): Promise<Response> {
    const session = await Response.find(sessionId)
    if (!session) throw new NotFoundException()

    if (session.anonimizado) return session

    try {
      session.merge({ ...ANONYMIZED_PLACEHOLDERS, anonimizado: true })
      await session.save()
    } catch {
      // Req 9.6 — best-effort column-by-column fallback
      for (const [column, value] of Object.entries(ANONYMIZED_PLACEHOLDERS)) {
        try {
          await Response.query().where('id', sessionId).update({ [column]: value })
        } catch {
          /* leave this column in its prior form; continue with the rest */
        }
      }
      // Unconditionally set anonimizado = true regardless of per-column outcomes
      await Response.query().where('id', sessionId).update({ anonimizado: true })
    }

    await session.refresh()
    return session
  }
}

export default new AnonymizationService()
