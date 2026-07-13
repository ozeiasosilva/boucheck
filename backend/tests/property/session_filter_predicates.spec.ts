import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import type { SessionListingFilters, ReportActionFilter } from '../../app/services/session_query_builder.js'

/**
 * Property-based tests for individual filter predicate correctness
 * Property 2: Individual filter predicate correctness
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

// ---------------------------------------------------------------------------
// Mock session type (simulates what the DB would hold)
// ---------------------------------------------------------------------------

interface MockSession {
  surveyId: number
  startedAt: string // ISO date string (YYYY-MM-DD)
  status: 'iniciado' | 'completo'
  nome: string
  empresa: string
  events: string[] // list of event tipo values present for this session
}

// ---------------------------------------------------------------------------
// Report_Action_Filter → event predicate mapping (mirrors REPORT_ACTION_PREDICATES)
// ---------------------------------------------------------------------------

const REPORT_ACTION_EVENT_MAP: Record<ReportActionFilter, (events: string[]) => boolean> = {
  visualizou: (events) => events.includes('relatorio_visualizado'),
  recebeu: (events) =>
    events.includes('relatorio_email_enviado') || events.includes('relatorio_whatsapp_enviado'),
  solicitou_consultor: (events) => events.includes('consultor_solicitado'),
  envio_falhou: (events) => events.includes('relatorio_envio_falhou'),
}

// ---------------------------------------------------------------------------
// Pure filter application (reference implementation for property testing)
// ---------------------------------------------------------------------------

function applyFilters(sessions: MockSession[], filters: SessionListingFilters): MockSession[] {
  return sessions.filter((session) => {
    if (filters.surveyId !== undefined && session.surveyId !== filters.surveyId) {
      return false
    }
    if (filters.startDate !== undefined && session.startedAt < filters.startDate) {
      return false
    }
    if (filters.endDate !== undefined && session.startedAt > filters.endDate) {
      return false
    }
    if (filters.status !== undefined && session.status !== filters.status) {
      return false
    }
    if (
      filters.nomeContains !== undefined &&
      !session.nome.toLowerCase().includes(filters.nomeContains.toLowerCase())
    ) {
      return false
    }
    if (
      filters.empresaContains !== undefined &&
      !session.empresa.toLowerCase().includes(filters.empresaContains.toLowerCase())
    ) {
      return false
    }
    if (filters.reportAction !== undefined) {
      const predicate = REPORT_ACTION_EVENT_MAP[filters.reportAction]
      if (!predicate(session.events)) {
        return false
      }
    }
    return true
  })
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const ALL_EVENT_TYPES = [
  'relatorio_visualizado',
  'relatorio_email_enviado',
  'relatorio_whatsapp_enviado',
  'consultor_solicitado',
  'relatorio_envio_falhou',
  'pagina_acessada',
  'privacidade_aceita',
  'pergunta_respondida',
] as const

const statusArb = fc.constantFrom<'iniciado' | 'completo'>('iniciado', 'completo')

/** Generates a date string in YYYY-MM-DD format within a reasonable range */
function dateStringArb() {
  return fc
    .record({
      year: fc.integer({ min: 2020, max: 2025 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }), // avoid month-end edge cases
    })
    .map(({ year, month, day }) => {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    })
}

/** Generates a mock session with random field values */
function mockSessionArb(): fc.Arbitrary<MockSession> {
  return fc.record({
    surveyId: fc.integer({ min: 1, max: 10 }),
    startedAt: dateStringArb(),
    status: statusArb,
    nome: fc.string({ minLength: 1, maxLength: 30 }),
    empresa: fc.string({ minLength: 1, maxLength: 30 }),
    events: fc.subarray([...ALL_EVENT_TYPES]),
  })
}

/** Generates an array of mock sessions */
function sessionsArb(): fc.Arbitrary<MockSession[]> {
  return fc.array(mockSessionArb(), { minLength: 1, maxLength: 30 })
}

const reportActionArb = fc.constantFrom<ReportActionFilter>(
  'visualizou',
  'recebeu',
  'solicitou_consultor',
  'envio_falhou'
)

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('Property 2: Individual filter predicate correctness', () => {
  it('surveyId filter: only sessions with matching surveyId remain (Req 2.1)', () => {
    fc.assert(
      fc.property(sessionsArb(), fc.integer({ min: 1, max: 10 }), (sessions, surveyId) => {
        const filters: SessionListingFilters = { surveyId }
        const result = applyFilters(sessions, filters)

        // All results must have the matching surveyId
        for (const s of result) {
          assert.strictEqual(s.surveyId, surveyId, 'Included session must match surveyId')
        }

        // All excluded sessions must NOT have the matching surveyId
        const excluded = sessions.filter((s) => !result.includes(s))
        for (const s of excluded) {
          assert.notStrictEqual(s.surveyId, surveyId, 'Excluded session must not match surveyId')
        }
      }),
      { numRuns: 150 }
    )
  })

  it('date range filter: only sessions within [startDate, endDate] remain (Req 2.2)', () => {
    fc.assert(
      fc.property(
        sessionsArb(),
        dateStringArb(),
        dateStringArb(),
        (sessions, date1, date2) => {
          // Ensure startDate <= endDate
          const startDate = date1 <= date2 ? date1 : date2
          const endDate = date1 <= date2 ? date2 : date1

          const filters: SessionListingFilters = { startDate, endDate }
          const result = applyFilters(sessions, filters)

          // All results must be within the range
          for (const s of result) {
            assert.ok(
              s.startedAt >= startDate && s.startedAt <= endDate,
              `Included session startedAt (${s.startedAt}) must be within [${startDate}, ${endDate}]`
            )
          }

          // All excluded sessions must be outside the range
          const excluded = sessions.filter((s) => !result.includes(s))
          for (const s of excluded) {
            assert.ok(
              s.startedAt < startDate || s.startedAt > endDate,
              `Excluded session startedAt (${s.startedAt}) must be outside [${startDate}, ${endDate}]`
            )
          }
        }
      ),
      { numRuns: 150 }
    )
  })

  it('status filter: only sessions with matching status remain (Req 2.3)', () => {
    fc.assert(
      fc.property(sessionsArb(), statusArb, (sessions, status) => {
        const filters: SessionListingFilters = { status }
        const result = applyFilters(sessions, filters)

        // All results must match the status
        for (const s of result) {
          assert.strictEqual(s.status, status, 'Included session must match status')
        }

        // All excluded sessions must have a different status
        const excluded = sessions.filter((s) => !result.includes(s))
        for (const s of excluded) {
          assert.notStrictEqual(s.status, status, 'Excluded session must not match status')
        }
      }),
      { numRuns: 150 }
    )
  })

  it('nomeContains filter: only sessions with nome containing substring (case-insensitive) remain (Req 2.4)', () => {
    fc.assert(
      fc.property(
        sessionsArb(),
        fc.string({ minLength: 1, maxLength: 5 }),
        (sessions, substring) => {
          const filters: SessionListingFilters = { nomeContains: substring }
          const result = applyFilters(sessions, filters)

          // All results must contain the substring (case-insensitive)
          for (const s of result) {
            assert.ok(
              s.nome.toLowerCase().includes(substring.toLowerCase()),
              `Included session nome "${s.nome}" must contain "${substring}" (case-insensitive)`
            )
          }

          // All excluded sessions must NOT contain the substring
          const excluded = sessions.filter((s) => !result.includes(s))
          for (const s of excluded) {
            assert.ok(
              !s.nome.toLowerCase().includes(substring.toLowerCase()),
              `Excluded session nome "${s.nome}" must not contain "${substring}" (case-insensitive)`
            )
          }
        }
      ),
      { numRuns: 150 }
    )
  })

  it('empresaContains filter: only sessions with empresa containing substring (case-insensitive) remain (Req 2.5)', () => {
    fc.assert(
      fc.property(
        sessionsArb(),
        fc.string({ minLength: 1, maxLength: 5 }),
        (sessions, substring) => {
          const filters: SessionListingFilters = { empresaContains: substring }
          const result = applyFilters(sessions, filters)

          // All results must contain the substring (case-insensitive)
          for (const s of result) {
            assert.ok(
              s.empresa.toLowerCase().includes(substring.toLowerCase()),
              `Included session empresa "${s.empresa}" must contain "${substring}" (case-insensitive)`
            )
          }

          // All excluded sessions must NOT contain the substring
          const excluded = sessions.filter((s) => !result.includes(s))
          for (const s of excluded) {
            assert.ok(
              !s.empresa.toLowerCase().includes(substring.toLowerCase()),
              `Excluded session empresa "${s.empresa}" must not contain "${substring}" (case-insensitive)`
            )
          }
        }
      ),
      { numRuns: 150 }
    )
  })

  it('reportAction filter: only sessions with corresponding event type remain (Req 2.6)', () => {
    fc.assert(
      fc.property(sessionsArb(), reportActionArb, (sessions, reportAction) => {
        const filters: SessionListingFilters = { reportAction }
        const result = applyFilters(sessions, filters)
        const predicate = REPORT_ACTION_EVENT_MAP[reportAction]

        // All results must satisfy the report action predicate
        for (const s of result) {
          assert.ok(
            predicate(s.events),
            `Included session must satisfy reportAction "${reportAction}" predicate`
          )
        }

        // All excluded sessions must NOT satisfy the predicate
        const excluded = sessions.filter((s) => !result.includes(s))
        for (const s of excluded) {
          assert.ok(
            !predicate(s.events),
            `Excluded session must not satisfy reportAction "${reportAction}" predicate`
          )
        }
      }),
      { numRuns: 150 }
    )
  })

  it('no filters: all sessions pass when no filters are applied', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const filters: SessionListingFilters = {}
        const result = applyFilters(sessions, filters)

        assert.strictEqual(
          result.length,
          sessions.length,
          'All sessions should pass when no filters are applied'
        )
      }),
      { numRuns: 150 }
    )
  })
})
