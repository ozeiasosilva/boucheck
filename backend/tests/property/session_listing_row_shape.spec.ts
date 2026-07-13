import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'

/**
 * Property-based tests for listing row shape, PII passthrough,
 * and Fill_Time/Progress_Percentage mutual exclusivity.
 *
 * Property 1: Listing row shape, PII passthrough, and Fill_Time/Progress_Percentage mutual exclusivity
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

// ---------------------------------------------------------------------------
// Pure projection function simulating ResponseTrackingService.list() row mapping
// ---------------------------------------------------------------------------

interface RawRowInput {
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
  extras: {
    survey_nome: string
    fill_time_seconds: number | null
    progress_percentage: number | null
    visualizou: boolean
    email_enviado: boolean
    whatsapp_enviado: boolean
    consultor_solicitado: boolean
  }
}

interface SessionListingRow {
  id: string
  nome: string | null
  empresa: string | null
  email: string | null
  telefone: string | null
  cargo: string | null
  cidade: string | null
  surveyNome: string
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

/**
 * Pure function that replicates the exact projection logic from
 * ResponseTrackingService.list()'s row mapping.
 */
function projectListingRow(raw: RawRowInput): SessionListingRow {
  const { extras } = raw

  // Fill_Time: populated only for 'completo' (Req 1.2)
  const fillTimeSeconds =
    raw.status === 'completo' && extras.fill_time_seconds != null
      ? Number(extras.fill_time_seconds)
      : null

  // Progress_Percentage: populated only for 'iniciado' (Req 1.3)
  const progressPercentage =
    raw.status === 'iniciado' && extras.progress_percentage != null
      ? Number(extras.progress_percentage)
      : null

  return {
    id: raw.id,
    nome: raw.nome,
    empresa: raw.empresa,
    email: raw.email,
    telefone: raw.telefone,
    cargo: raw.cargo,
    cidade: raw.cidade,
    surveyNome: String(extras.survey_nome),
    status: raw.status,
    startedAt: raw.startedAt,
    completedAt: raw.completedAt,
    fillTimeSeconds,
    progressPercentage,
    indicators: {
      visualizou: Boolean(extras.visualizou),
      emailEnviado: Boolean(extras.email_enviado),
      whatsappEnviado: Boolean(extras.whatsapp_enviado),
      consultorSolicitado: Boolean(extras.consultor_solicitado),
    },
  }
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const nullableString = () => fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: null })
const isoDateString = () =>
  fc
    .integer({ min: 1577836800000, max: 1924991999000 }) // 2020-01-01 to 2030-12-31 in ms
    .map((ms) => new Date(ms).toISOString())
const nullableIsoDate = () => fc.option(isoDateString(), { nil: null })

function rawRowArbitrary(): fc.Arbitrary<RawRowInput> {
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
    extras: fc.record({
      survey_nome: fc.string({ minLength: 1, maxLength: 60 }),
      fill_time_seconds: fc.option(fc.integer({ min: 1, max: 7200 }), { nil: null }),
      progress_percentage: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
      visualizou: fc.boolean(),
      email_enviado: fc.boolean(),
      whatsapp_enviado: fc.boolean(),
      consultor_solicitado: fc.boolean(),
    }),
  })
}

/**
 * Generator specifically for 'completo' status rows with a non-null fill_time_seconds.
 */
function completoRowWithFillTime(): fc.Arbitrary<RawRowInput> {
  return rawRowArbitrary().map((row) => ({
    ...row,
    status: 'completo' as const,
    extras: { ...row.extras, fill_time_seconds: Math.max(1, Math.abs(row.extras.fill_time_seconds ?? 60)) },
  }))
}

/**
 * Generator specifically for 'iniciado' status rows with a non-null progress_percentage.
 */
function iniciadoRowWithProgress(): fc.Arbitrary<RawRowInput> {
  return rawRowArbitrary().map((row) => ({
    ...row,
    status: 'iniciado' as const,
    extras: { ...row.extras, progress_percentage: row.extras.progress_percentage ?? 50 },
  }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS: (keyof SessionListingRow)[] = [
  'id',
  'nome',
  'empresa',
  'email',
  'telefone',
  'cargo',
  'cidade',
  'surveyNome',
  'status',
  'startedAt',
  'completedAt',
  'fillTimeSeconds',
  'progressPercentage',
  'indicators',
]

const PII_FIELDS = ['nome', 'empresa', 'email', 'telefone', 'cargo', 'cidade'] as const

describe('Property 1: Listing row shape, PII passthrough, and Fill_Time/Progress_Percentage exclusivity', () => {
  it('every projected row has all required fields defined — not undefined (Req 1.1)', () => {
    fc.assert(
      fc.property(rawRowArbitrary(), (raw) => {
        const row = projectListingRow(raw)
        for (const field of REQUIRED_FIELDS) {
          assert.ok(
            field in row && row[field] !== undefined,
            `Field "${field}" must be defined (not undefined) on the row`
          )
        }
        // indicators sub-fields
        assert.ok('visualizou' in row.indicators && row.indicators.visualizou !== undefined)
        assert.ok('emailEnviado' in row.indicators && row.indicators.emailEnviado !== undefined)
        assert.ok('whatsappEnviado' in row.indicators && row.indicators.whatsappEnviado !== undefined)
        assert.ok('consultorSolicitado' in row.indicators && row.indicators.consultorSolicitado !== undefined)
      }),
      { numRuns: 200 }
    )
  })

  it('for status=completo, fillTimeSeconds can be non-null and progressPercentage must be null (Req 1.2)', () => {
    fc.assert(
      fc.property(completoRowWithFillTime(), (raw) => {
        const row = projectListingRow(raw)
        assert.strictEqual(row.status, 'completo')
        assert.notStrictEqual(
          row.fillTimeSeconds,
          null,
          'fillTimeSeconds should be non-null for completo with fill_time_seconds data'
        )
        assert.strictEqual(
          row.progressPercentage,
          null,
          'progressPercentage must be null for completo rows'
        )
      }),
      { numRuns: 200 }
    )
  })

  it('for status=iniciado, progressPercentage can be non-null and fillTimeSeconds must be null (Req 1.3)', () => {
    fc.assert(
      fc.property(iniciadoRowWithProgress(), (raw) => {
        const row = projectListingRow(raw)
        assert.strictEqual(row.status, 'iniciado')
        assert.notStrictEqual(
          row.progressPercentage,
          null,
          'progressPercentage should be non-null for iniciado with progress_percentage data'
        )
        assert.strictEqual(
          row.fillTimeSeconds,
          null,
          'fillTimeSeconds must be null for iniciado rows'
        )
      }),
      { numRuns: 200 }
    )
  })

  it('Fill_Time and Progress_Percentage are never both non-null (mutual exclusivity)', () => {
    fc.assert(
      fc.property(rawRowArbitrary(), (raw) => {
        const row = projectListingRow(raw)
        const bothNonNull = row.fillTimeSeconds !== null && row.progressPercentage !== null
        assert.strictEqual(
          bothNonNull,
          false,
          `fillTimeSeconds (${row.fillTimeSeconds}) and progressPercentage (${row.progressPercentage}) must not both be non-null`
        )
      }),
      { numRuns: 200 }
    )
  })

  it('PII fields are passed through as-is — no transformation applied (Req 1.4)', () => {
    fc.assert(
      fc.property(rawRowArbitrary(), (raw) => {
        const row = projectListingRow(raw)
        for (const field of PII_FIELDS) {
          assert.strictEqual(
            row[field],
            raw[field],
            `PII field "${field}" must equal stored value exactly (got "${row[field]}", expected "${raw[field]}")`
          )
        }
      }),
      { numRuns: 200 }
    )
  })

  it('PII passthrough works for anonymized placeholder values (Req 1.4)', () => {
    const ANONYMIZED_PLACEHOLDERS = {
      nome: '[ANONIMIZADO]',
      email: 'anonimizado@boucheck.invalid',
      telefone: '[ANONIMIZADO]',
      empresa: '[ANONIMIZADO]',
      cargo: '[ANONIMIZADO]',
      cidade: '[ANONIMIZADO]',
    } as const

    fc.assert(
      fc.property(rawRowArbitrary(), (raw) => {
        // Simulate an anonymized row
        const anonymizedRaw: RawRowInput = {
          ...raw,
          nome: ANONYMIZED_PLACEHOLDERS.nome,
          empresa: ANONYMIZED_PLACEHOLDERS.empresa,
          email: ANONYMIZED_PLACEHOLDERS.email,
          telefone: ANONYMIZED_PLACEHOLDERS.telefone,
          cargo: ANONYMIZED_PLACEHOLDERS.cargo,
          cidade: ANONYMIZED_PLACEHOLDERS.cidade,
        }
        const row = projectListingRow(anonymizedRaw)
        assert.strictEqual(row.nome, ANONYMIZED_PLACEHOLDERS.nome)
        assert.strictEqual(row.empresa, ANONYMIZED_PLACEHOLDERS.empresa)
        assert.strictEqual(row.email, ANONYMIZED_PLACEHOLDERS.email)
        assert.strictEqual(row.telefone, ANONYMIZED_PLACEHOLDERS.telefone)
        assert.strictEqual(row.cargo, ANONYMIZED_PLACEHOLDERS.cargo)
        assert.strictEqual(row.cidade, ANONYMIZED_PLACEHOLDERS.cidade)
      }),
      { numRuns: 100 }
    )
  })

  it('for status=completo with null fill_time_seconds, fillTimeSeconds is null (Req 1.2 boundary)', () => {
    fc.assert(
      fc.property(
        rawRowArbitrary().map((row) => ({
          ...row,
          status: 'completo' as const,
          extras: { ...row.extras, fill_time_seconds: null },
        })),
        (raw) => {
          const row = projectListingRow(raw)
          assert.strictEqual(row.fillTimeSeconds, null)
          assert.strictEqual(row.progressPercentage, null)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('for status=iniciado with null progress_percentage, progressPercentage is null (Req 1.3 boundary)', () => {
    fc.assert(
      fc.property(
        rawRowArbitrary().map((row) => ({
          ...row,
          status: 'iniciado' as const,
          extras: { ...row.extras, progress_percentage: null },
        })),
        (raw) => {
          const row = projectListingRow(raw)
          assert.strictEqual(row.progressPercentage, null)
          assert.strictEqual(row.fillTimeSeconds, null)
        }
      ),
      { numRuns: 100 }
    )
  })
})
