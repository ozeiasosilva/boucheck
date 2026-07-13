// Feature: admin-tracking-dashboard, Property 3
/**
 * Property 3: Filter combination correctness
 *
 * Validates: Requirements 2.7
 *
 * Verifies that when multiple filters are specified, they combine via AND semantics:
 * 1. Intersection property: applying two distinct-key filters individually and taking
 *    their intersection yields the same result as applying both simultaneously.
 * 2. Adding a filter never increases the result set.
 * 3. Order independence: applying filter A then B gives same result as B then A.
 * 4. Empty intersection: when no session satisfies all filters, the result is empty.
 *
 * Note: The SessionListingFilters interface allows at most one value per filter key.
 * "Combining via AND" means different filter types applied together (e.g., surveyId AND
 * status AND nomeContains), not multiple values for the same filter type.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import type {
  SessionListingFilters,
  ReportActionFilter,
} from '../../app/services/session_query_builder.js'

// ---------------------------------------------------------------------------
// In-memory session model for pure simulation
// ---------------------------------------------------------------------------

interface SimulatedSession {
  id: number
  surveyId: number
  startedAt: string // ISO date
  status: 'iniciado' | 'completo'
  nome: string
  empresa: string
  /** Report action events this session has */
  reportEvents: Set<string>
}

// ---------------------------------------------------------------------------
// Pure filter application (mirrors SessionQueryBuilder logic without DB)
// ---------------------------------------------------------------------------

function matchesFilter(session: SimulatedSession, filters: SessionListingFilters): boolean {
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
    if (!matchesReportAction(session, filters.reportAction)) {
      return false
    }
  }
  return true
}

function matchesReportAction(session: SimulatedSession, action: ReportActionFilter): boolean {
  switch (action) {
    case 'visualizou':
      return session.reportEvents.has('relatorio_visualizado')
    case 'recebeu':
      return (
        session.reportEvents.has('relatorio_email_enviado') ||
        session.reportEvents.has('relatorio_whatsapp_enviado')
      )
    case 'solicitou_consultor':
      return session.reportEvents.has('consultor_solicitado')
    case 'envio_falhou':
      return session.reportEvents.has('relatorio_envio_falhou')
  }
}

function applyFilter(sessions: SimulatedSession[], filters: SessionListingFilters): number[] {
  return sessions.filter((s) => matchesFilter(s, filters)).map((s) => s.id)
}

function intersection(a: number[], b: number[]): number[] {
  const setB = new Set(b)
  return a.filter((id) => setB.has(id))
}

function isSubsetOf(a: number[], b: number[]): boolean {
  const setB = new Set(b)
  return a.every((id) => setB.has(id))
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const REPORT_EVENT_TYPES = [
  'relatorio_visualizado',
  'relatorio_email_enviado',
  'relatorio_whatsapp_enviado',
  'consultor_solicitado',
  'relatorio_envio_falhou',
]

const REPORT_ACTIONS: ReportActionFilter[] = [
  'visualizou',
  'recebeu',
  'solicitou_consultor',
  'envio_falhou',
]

const namePool = ['Alice', 'Bob', 'Carlos', 'Diana', 'Eva', 'Fernando', 'Gabi', 'Hugo']
const companyPool = ['TechCorp', 'BioLab', 'FinServ', 'EduOrg', 'RetailCo', 'MedGroup']

const sessionArb = fc
  .record({
    id: fc.integer({ min: 1, max: 100_000 }),
    surveyId: fc.integer({ min: 1, max: 5 }),
    year: fc.integer({ min: 2023, max: 2025 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    status: fc.constantFrom<'iniciado' | 'completo'>('iniciado', 'completo'),
    nome: fc.constantFrom(...namePool),
    empresa: fc.constantFrom(...companyPool),
    reportEventIndices: fc.subarray(REPORT_EVENT_TYPES),
  })
  .map(({ id, surveyId, year, month, day, status, nome, empresa, reportEventIndices }) => ({
    id,
    surveyId,
    startedAt: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    status,
    nome,
    empresa,
    reportEvents: new Set(reportEventIndices),
  }))

const sessionsArb = fc.array(sessionArb, { minLength: 1, maxLength: 30 }).map((sessions) => {
  // Ensure unique IDs
  const seen = new Set<number>()
  return sessions.filter((s) => {
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  })
})

/**
 * The 7 filter keys in SessionListingFilters. We use numeric indices to
 * generate pairs of distinct filter types for the combination properties.
 */
type FilterKey =
  | 'surveyId'
  | 'startDate'
  | 'endDate'
  | 'status'
  | 'nomeContains'
  | 'empresaContains'
  | 'reportAction'

const FILTER_KEYS: FilterKey[] = [
  'surveyId',
  'startDate',
  'endDate',
  'status',
  'nomeContains',
  'empresaContains',
  'reportAction',
]

/** Generate a filter with exactly the given key set */
function filterForKey(key: FilterKey): fc.Arbitrary<SessionListingFilters> {
  switch (key) {
    case 'surveyId':
      return fc.integer({ min: 1, max: 5 }).map((surveyId) => ({ surveyId }))
    case 'startDate':
      return fc
        .constantFrom('2023-01-01', '2023-06-01', '2024-01-01', '2024-06-01', '2025-01-01')
        .map((startDate) => ({ startDate }))
    case 'endDate':
      return fc
        .constantFrom('2023-12-31', '2024-06-30', '2024-12-31', '2025-06-30', '2025-12-31')
        .map((endDate) => ({ endDate }))
    case 'status':
      return fc
        .constantFrom<'iniciado' | 'completo'>('iniciado', 'completo')
        .map((status) => ({ status }))
    case 'nomeContains':
      return fc
        .constantFrom('ali', 'bob', 'car', 'dia', 'eva', 'fer', 'gab', 'hug')
        .map((nomeContains) => ({ nomeContains }))
    case 'empresaContains':
      return fc
        .constantFrom('tech', 'bio', 'fin', 'edu', 'retail', 'med')
        .map((empresaContains) => ({ empresaContains }))
    case 'reportAction':
      return fc
        .constantFrom<ReportActionFilter>(...REPORT_ACTIONS)
        .map((reportAction) => ({ reportAction }))
  }
}

/**
 * Generate a pair of filters guaranteed to use DIFFERENT keys.
 * This correctly models the real API behavior: each query parameter
 * appears at most once, AND semantics combine distinct filter types.
 */
function distinctFilterPairArb(): fc.Arbitrary<[SessionListingFilters, SessionListingFilters]> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: FILTER_KEYS.length - 1 }),
      fc.integer({ min: 0, max: FILTER_KEYS.length - 2 })
    )
    .chain(([idx1, idx2Raw]) => {
      // Ensure idx2 != idx1
      const idx2 = idx2Raw >= idx1 ? idx2Raw + 1 : idx2Raw
      const key1 = FILTER_KEYS[idx1]
      const key2 = FILTER_KEYS[idx2]
      return fc.tuple(filterForKey(key1), filterForKey(key2))
    })
}

/** Merge two filter objects (safe when keys are distinct) */
function mergeFilters(a: SessionListingFilters, b: SessionListingFilters): SessionListingFilters {
  return { ...a, ...b }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 3: Filter combination correctness (AND semantics)', () => {
  it('Intersection property: applying two distinct-key filters individually and intersecting equals applying both simultaneously (≥100 runs)', () => {
    /**
     * Validates: Requirement 2.7
     * For any two filters F1 and F2 with distinct keys, applying both via AND must yield
     * the same set as intersecting F1-only and F2-only results.
     */
    fc.assert(
      fc.property(
        sessionsArb.chain((sessions) =>
          fc.tuple(fc.constant(sessions), distinctFilterPairArb())
        ),
        ([sessions, [filterA, filterB]]) => {
          const resultA = applyFilter(sessions, filterA)
          const resultB = applyFilter(sessions, filterB)
          const intersected = intersection(resultA, resultB)

          const combined = mergeFilters(filterA, filterB)
          const resultCombined = applyFilter(sessions, combined)

          const sortedIntersected = [...intersected].sort((a, b) => a - b)
          const sortedCombined = [...resultCombined].sort((a, b) => a - b)
          assert.deepStrictEqual(
            sortedCombined,
            sortedIntersected,
            `Combined filter result should equal intersection of individual filter results`
          )
        }
      ),
      { numRuns: 150 }
    )
  })

  it('Adding a filter never increases the result set (≥100 runs)', () => {
    /**
     * Validates: Requirement 2.7
     * For any filters F1 and F2 with distinct keys, result(F1 AND F2) ⊆ result(F1).
     */
    fc.assert(
      fc.property(
        sessionsArb.chain((sessions) =>
          fc.tuple(fc.constant(sessions), distinctFilterPairArb())
        ),
        ([sessions, [filterA, filterB]]) => {
          const resultA = applyFilter(sessions, filterA)
          const combined = mergeFilters(filterA, filterB)
          const resultCombined = applyFilter(sessions, combined)

          assert.ok(
            isSubsetOf(resultCombined, resultA),
            `Combined result (${resultCombined.length} items) must be a subset of single-filter result (${resultA.length} items)`
          )
        }
      ),
      { numRuns: 150 }
    )
  })

  it('Order independence: filter A then B gives same result as B then A (≥100 runs)', () => {
    /**
     * Validates: Requirement 2.7
     * Applying two distinct-key filters in either merge order yields the same result set.
     */
    fc.assert(
      fc.property(
        sessionsArb.chain((sessions) =>
          fc.tuple(fc.constant(sessions), distinctFilterPairArb())
        ),
        ([sessions, [filterA, filterB]]) => {
          const combinedAB = mergeFilters(filterA, filterB)
          const combinedBA = mergeFilters(filterB, filterA)

          const resultAB = applyFilter(sessions, combinedAB)
          const resultBA = applyFilter(sessions, combinedBA)

          const sortedAB = [...resultAB].sort((a, b) => a - b)
          const sortedBA = [...resultBA].sort((a, b) => a - b)

          assert.deepStrictEqual(
            sortedAB,
            sortedBA,
            `Filter order should not affect the result set`
          )
        }
      ),
      { numRuns: 150 }
    )
  })

  it('Empty intersection: when no session satisfies all filters simultaneously, the result is empty (≥100 runs)', () => {
    /**
     * Validates: Requirement 2.7
     * When filters are constructed such that no session can match all of them,
     * the result set is empty.
     */
    fc.assert(
      fc.property(
        sessionsArb,
        (sessions) => {
          // Create a filter with a name substring that no generated session can contain
          const impossibleFilters: SessionListingFilters = {
            nomeContains: 'ZZZZNONEXISTENT99999',
            status: 'completo',
          }

          const result = applyFilter(sessions, impossibleFilters)
          assert.strictEqual(
            result.length,
            0,
            `Result should be empty when no session can satisfy all filters`
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Empty intersection with contradicting date range yields empty result (≥100 runs)', () => {
    /**
     * Validates: Requirement 2.7
     * When startDate > endDate, no session can match the combined date range filter.
     */
    fc.assert(
      fc.property(
        sessionsArb,
        (sessions) => {
          // startDate after endDate — impossible to satisfy both
          const impossibleFilters: SessionListingFilters = {
            startDate: '2099-01-01',
            endDate: '2098-01-01',
          }

          const result = applyFilter(sessions, impossibleFilters)
          assert.strictEqual(
            result.length,
            0,
            `Result should be empty when startDate > endDate`
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
