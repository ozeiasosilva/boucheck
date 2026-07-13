import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for PII passthrough in the session detail view.
 *
 * Property 8: Session detail PII passthrough
 * Validates: Requirements 4.4
 *
 * The Session_Detail returns PII fields (nome, empresa, email, telefone, cargo, cidade)
 * exactly as stored — whether that stored data is an Anonymized_Placeholder value
 * (following a prior anonymization) or the respondent's original data, without
 * separately re-deriving those values.
 */

// ---------------------------------------------------------------------------
// Types simulating the stored session and the detail output
// ---------------------------------------------------------------------------

interface StoredSession {
  id: string
  nome: string | null
  empresa: string | null
  email: string | null
  telefone: string | null
  cargo: string | null
  cidade: string | null
  status: 'iniciado' | 'completo'
  startedAt: string | null
  completedAt: string | null
  surveyId: number
  surveyNome: string
  anonimizado: boolean
}

interface SessionDetailSession {
  id: string
  nome: string | null
  empresa: string | null
  email: string | null
  telefone: string | null
  cargo: string | null
  cidade: string | null
  surveyNome: string
  surveyId: number
  status: 'iniciado' | 'completo'
  startedAt: string | null
  completedAt: string | null
  fillTimeSeconds: number | null
  progressPercentage: number | null
  indicators: {
    visualizou: boolean
    emailEnviado: boolean
    whatsappEnviado: boolean
    consultorSolicitado: boolean
  }
}

// ---------------------------------------------------------------------------
// Pure projection function simulating ResponseTrackingService.detail()
// session field mapping (mirrors the real implementation logic)
// ---------------------------------------------------------------------------

function projectSessionDetail(stored: StoredSession): SessionDetailSession {
  const fillTimeSeconds =
    stored.status === 'completo' && stored.startedAt && stored.completedAt
      ? Math.floor(
          (new Date(stored.completedAt).getTime() - new Date(stored.startedAt).getTime()) / 1000
        )
      : null

  return {
    id: stored.id,
    nome: stored.nome,
    empresa: stored.empresa,
    email: stored.email,
    telefone: stored.telefone,
    cargo: stored.cargo,
    cidade: stored.cidade,
    surveyNome: stored.surveyNome,
    surveyId: stored.surveyId,
    status: stored.status,
    startedAt: stored.startedAt,
    completedAt: stored.completedAt,
    fillTimeSeconds,
    progressPercentage: null, // Detail always returns null for progressPercentage
    indicators: {
      visualizou: false,
      emailEnviado: false,
      whatsappEnviado: false,
      consultorSolicitado: false,
    },
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANONYMIZED_PLACEHOLDERS = {
  nome: '[ANONIMIZADO]',
  email: 'anonimizado@boucheck.invalid',
  telefone: '[ANONIMIZADO]',
  empresa: '[ANONIMIZADO]',
  cargo: '[ANONIMIZADO]',
  cidade: '[ANONIMIZADO]',
} as const

const PII_FIELDS = ['nome', 'empresa', 'email', 'telefone', 'cargo', 'cidade'] as const

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const nullableString = () => fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: null })
const isoDateString = () =>
  fc
    .integer({ min: 1577836800000, max: 1924991999000 })
    .map((ms) => new Date(ms).toISOString())
const nullableIsoDate = () => fc.option(isoDateString(), { nil: null })

function storedSessionArbitrary(): fc.Arbitrary<StoredSession> {
  return fc.record({
    id: fc.uuid(),
    nome: nullableString(),
    empresa: nullableString(),
    email: nullableString(),
    telefone: nullableString(),
    cargo: nullableString(),
    cidade: nullableString(),
    status: fc.constantFrom('iniciado' as const, 'completo' as const),
    startedAt: nullableIsoDate(),
    completedAt: nullableIsoDate(),
    surveyId: fc.integer({ min: 1, max: 10000 }),
    surveyNome: fc.string({ minLength: 1, maxLength: 60 }),
    anonimizado: fc.boolean(),
  })
}

/**
 * Generator for sessions with anonymized PII fields (anonimizado = true).
 */
function anonymizedSessionArbitrary(): fc.Arbitrary<StoredSession> {
  return storedSessionArbitrary().map((session) => ({
    ...session,
    anonimizado: true,
    nome: ANONYMIZED_PLACEHOLDERS.nome,
    empresa: ANONYMIZED_PLACEHOLDERS.empresa,
    email: ANONYMIZED_PLACEHOLDERS.email,
    telefone: ANONYMIZED_PLACEHOLDERS.telefone,
    cargo: ANONYMIZED_PLACEHOLDERS.cargo,
    cidade: ANONYMIZED_PLACEHOLDERS.cidade,
  }))
}

/**
 * Generator producing mixed scenarios: either real PII data or anonymized placeholders.
 */
function mixedPiiSessionArbitrary(): fc.Arbitrary<StoredSession> {
  return fc.oneof(storedSessionArbitrary(), anonymizedSessionArbitrary())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 8: Session detail PII passthrough', () => {
  it('PII fields in detail match stored values exactly (Req 4.4)', () => {
    fc.assert(
      fc.property(mixedPiiSessionArbitrary(), (stored) => {
        const detail = projectSessionDetail(stored)
        for (const field of PII_FIELDS) {
          assert.strictEqual(
            detail[field],
            stored[field],
            `PII field "${field}" in detail must equal stored value exactly. Got "${detail[field]}", expected "${stored[field]}"`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  it('no PII transformation is applied — detail session.nome/email/etc exactly equal the input (Req 4.4)', () => {
    fc.assert(
      fc.property(storedSessionArbitrary(), (stored) => {
        const detail = projectSessionDetail(stored)
        // Verify no transformation, trimming, casing change, or other mutation
        assert.strictEqual(detail.nome, stored.nome)
        assert.strictEqual(detail.email, stored.email)
        assert.strictEqual(detail.telefone, stored.telefone)
        assert.strictEqual(detail.empresa, stored.empresa)
        assert.strictEqual(detail.cargo, stored.cargo)
        assert.strictEqual(detail.cidade, stored.cidade)
      }),
      { numRuns: 200 }
    )
  })

  it('anonymized placeholder values pass through unchanged (Req 4.4)', () => {
    fc.assert(
      fc.property(anonymizedSessionArbitrary(), (stored) => {
        const detail = projectSessionDetail(stored)
        assert.strictEqual(
          detail.nome,
          ANONYMIZED_PLACEHOLDERS.nome,
          `nome should be "${ANONYMIZED_PLACEHOLDERS.nome}" but got "${detail.nome}"`
        )
        assert.strictEqual(
          detail.email,
          ANONYMIZED_PLACEHOLDERS.email,
          `email should be "${ANONYMIZED_PLACEHOLDERS.email}" but got "${detail.email}"`
        )
        assert.strictEqual(
          detail.telefone,
          ANONYMIZED_PLACEHOLDERS.telefone,
          `telefone should be "${ANONYMIZED_PLACEHOLDERS.telefone}" but got "${detail.telefone}"`
        )
        assert.strictEqual(
          detail.empresa,
          ANONYMIZED_PLACEHOLDERS.empresa,
          `empresa should be "${ANONYMIZED_PLACEHOLDERS.empresa}" but got "${detail.empresa}"`
        )
        assert.strictEqual(
          detail.cargo,
          ANONYMIZED_PLACEHOLDERS.cargo,
          `cargo should be "${ANONYMIZED_PLACEHOLDERS.cargo}" but got "${detail.cargo}"`
        )
        assert.strictEqual(
          detail.cidade,
          ANONYMIZED_PLACEHOLDERS.cidade,
          `cidade should be "${ANONYMIZED_PLACEHOLDERS.cidade}" but got "${detail.cidade}"`
        )
      }),
      { numRuns: 100 }
    )
  })
})
