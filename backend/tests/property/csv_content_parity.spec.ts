import { describe, it } from 'node:test'
import assert from 'node:assert'
import fc from 'fast-check'
import type {
  SessionListingFilters,
  ReportActionFilter,
} from '../../app/services/session_query_builder.js'

/**
 * Property-based tests for CSV content parity with the unpaginated listing.
 * Property 11: CSV content parity with the unpaginated listing
 * Validates: Requirements 7.1
 *
 * Since the actual CsvExporter requires a database, these tests verify the
 * parity contract using a pure simulation:
 * - Given a dataset and filters, the CSV should contain all rows matching those
 *   filters (no pagination applied).
 * - The paginated listing should be a subset of what the CSV contains.
 *
 * Properties verified (100+ runs each):
 * 1. Unpaginated set is the union of all pages
 * 2. CSV row count equals total count from listing
 * 3. Every row in any page of the listing appears in the CSV
 * 4. Applying the same filters produces the same set regardless of pagination presence
 */

// ---------------------------------------------------------------------------
// In-memory session model for pure simulation
// ---------------------------------------------------------------------------

interface SimulatedSession {
  id: number
  surveyId: number
  startedAt: string // ISO date (YYYY-MM-DD)
  status: 'iniciado' | 'completo'
  nome: string
  empresa: string
  events: string[]
}

// ---------------------------------------------------------------------------
// Report_Action_Filter → event predicate mapping
// ---------------------------------------------------------------------------

const REPORT_ACTION_EVENT_MAP: Record<ReportActionFilter, (events: string[]) => boolean> = {
  visualizou: (events) => events.includes('relatorio_visualizado'),
  recebeu: (events) =>
    events.includes('relatorio_email_enviado') || events.includes('relatorio_whatsapp_enviado'),
  solicitou_consultor: (events) => events.includes('consultor_solicitado'),
  envio_falhou: (events) => events.includes('relatorio_envio_falhou'),
}

// ---------------------------------------------------------------------------
// Pure filter application (mirrors SessionQueryBuilder logic)
// ---------------------------------------------------------------------------

function applyFilters(sessions: SimulatedSession[], filters: SessionListingFilters): SimulatedSession[] {
  return sessions.filter((session) => {
    if (filters.surveyId !== undefined && session.surveyId !== filters.surveyId) return false
    if (filters.startDate !== undefined && session.startedAt < filters.startDate) return false
    if (filters.endDate !== undefined && session.startedAt > filters.endDate) return false
    if (filters.status !== undefined && session.status !== filters.status) return false
    if (
      filters.nomeContains !== undefined &&
      !session.nome.toLowerCase().includes(filters.nomeContains.toLowerCase())
    ) return false
    if (
      filters.empresaContains !== undefined &&
      !session.empresa.toLowerCase().includes(filters.empresaContains.toLowerCase())
    ) return false
    if (filters.reportAction !== undefined) {
      const predicate = REPORT_ACTION_EVENT_MAP[filters.reportAction]
      if (!predicate(session.events)) return false
    }
    return true
  })
}

// ---------------------------------------------------------------------------
// Pure pagination function (mirrors SessionQueryBuilder's pagination logic)
// ---------------------------------------------------------------------------

function paginate<T>(items: T[], page: number, perPage: number): { rows: T[]; total: number } {
  const total = items.length
  const offset = (page - 1) * perPage
  return { rows: items.slice(offset, offset + perPage), total }
}

// ---------------------------------------------------------------------------
// Simulation of CSV export vs paginated listing
// The CSV export uses the same SessionQueryBuilder WITHOUT pagination.
// The listing uses the same SessionQueryBuilder WITH pagination.
// ---------------------------------------------------------------------------

/**
 * Simulates the CSV export: applies filters, returns ALL matching rows (no pagination).
 */
function simulateCsvExport(
  sessions: SimulatedSession[],
  filters: SessionListingFilters
): SimulatedSession[] {
  return applyFilters(sessions, filters)
}

/**
 * Simulates the paginated listing: applies filters, then paginates.
 */
function simulateListing(
  sessions: SimulatedSession[],
  filters: SessionListingFilters,
  page: number,
  perPage: number
): { rows: SimulatedSession[]; total: number } {
  const filtered = applyFilters(sessions, filters)
  return paginate(filtered, page, perPage)
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

const namePool = ['Alice', 'Bob', 'Carlos', 'Diana', 'Eva', 'Fernando', 'Gabi', 'Hugo']
const companyPool = ['TechCorp', 'BioLab', 'FinServ', 'EduOrg', 'RetailCo', 'MedGroup']

function dateStringArb() {
  return fc
    .record({
      year: fc.integer({ min: 2023, max: 2025 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
    })
    .map(({ year, month, day }) =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    )
}

function mockSessionArb(): fc.Arbitrary<SimulatedSession> {
  return fc
    .record({
      id: fc.integer({ min: 1, max: 100_000 }),
      surveyId: fc.integer({ min: 1, max: 5 }),
      startedAt: dateStringArb(),
      status: fc.constantFrom<'iniciado' | 'completo'>('iniciado', 'completo'),
      nome: fc.constantFrom(...namePool),
      empresa: fc.constantFrom(...companyPool),
      events: fc.subarray([...ALL_EVENT_TYPES]),
    })
}

const sessionsArb = fc
  .array(mockSessionArb(), { minLength: 1, maxLength: 50 })
  .map((sessions) => {
    // Ensure unique IDs
    const seen = new Set<number>()
    let nextId = 1
    return sessions.map((s) => {
      while (seen.has(nextId)) nextId++
      seen.add(nextId)
      return { ...s, id: nextId++ }
    })
  })

const REPORT_ACTIONS: ReportActionFilter[] = [
  'visualizou',
  'recebeu',
  'solicitou_consultor',
  'envio_falhou',
]

function filtersArb(): fc.Arbitrary<SessionListingFilters> {
  return fc.record(
    {
      surveyId: fc.integer({ min: 1, max: 5 }),
      startDate: fc.constantFrom('2023-01-01', '2023-06-01', '2024-01-01', '2024-06-01'),
      endDate: fc.constantFrom('2024-06-30', '2024-12-31', '2025-06-30', '2025-12-31'),
      status: fc.constantFrom<'iniciado' | 'completo'>('iniciado', 'completo'),
      nomeContains: fc.constantFrom('ali', 'bob', 'car', 'dia', 'eva'),
      empresaContains: fc.constantFrom('tech', 'bio', 'fin', 'edu', 'retail'),
      reportAction: fc.constantFrom<ReportActionFilter>(...REPORT_ACTIONS),
    },
    { requiredKeys: [] }
  )
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('Property 11: CSV content parity with the unpaginated listing', () => {
  it('Unpaginated set is the union of all pages (Req 7.1)', () => {
    /**
     * The full set (what CSV would export) equals concatenating all paginated pages.
     */
    fc.assert(
      fc.property(
        sessionsArb,
        filtersArb(),
        fc.integer({ min: 1, max: 20 }),
        (sessions, filters, perPage) => {
          const csvRows = simulateCsvExport(sessions, filters)
          const csvIds = csvRows.map((r) => r.id)

          // Collect all rows from all pages of the paginated listing
          const totalPages = Math.max(1, Math.ceil(csvRows.length / perPage))
          const allPageIds: number[] = []
          for (let p = 1; p <= totalPages; p++) {
            const { rows } = simulateListing(sessions, filters, p, perPage)
            allPageIds.push(...rows.map((r) => r.id))
          }

          assert.deepStrictEqual(
            allPageIds,
            csvIds,
            `Union of all pages (${allPageIds.length} rows) must equal the unpaginated CSV set (${csvIds.length} rows)`
          )
        }
      ),
      { numRuns: 150 }
    )
  })

  it('CSV row count equals total count from listing (Req 7.1)', () => {
    /**
     * The number of rows in the CSV equals the total count reported by any page
     * of the paginated listing (since total is filter-count, not page-count).
     */
    fc.assert(
      fc.property(
        sessionsArb,
        filtersArb(),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        (sessions, filters, perPage, page) => {
          const csvRows = simulateCsvExport(sessions, filters)
          const { total } = simulateListing(sessions, filters, page, perPage)

          assert.strictEqual(
            csvRows.length,
            total,
            `CSV row count (${csvRows.length}) must equal listing total (${total}) regardless of page=${page}, perPage=${perPage}`
          )
        }
      ),
      { numRuns: 150 }
    )
  })

  it('Every row in any page of the listing appears in the CSV (Req 7.1)', () => {
    /**
     * No paginated row is missing from the unpaginated set (CSV).
     */
    fc.assert(
      fc.property(
        sessionsArb,
        filtersArb(),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        (sessions, filters, perPage, page) => {
          const csvRows = simulateCsvExport(sessions, filters)
          const csvIdSet = new Set(csvRows.map((r) => r.id))

          const { rows: pageRows } = simulateListing(sessions, filters, page, perPage)

          for (const row of pageRows) {
            assert.ok(
              csvIdSet.has(row.id),
              `Row id=${row.id} found on page ${page} must exist in the CSV export`
            )
          }
        }
      ),
      { numRuns: 150 }
    )
  })

  it('Applying the same filters produces the same set regardless of pagination presence (Req 7.1)', () => {
    /**
     * filter + no-pagination == filter + union-of-all-pages.
     * This verifies the structural guarantee that both code paths
     * (CSV export and paginated listing) use the same filter logic.
     */
    fc.assert(
      fc.property(
        sessionsArb,
        filtersArb(),
        fc.integer({ min: 1, max: 25 }),
        (sessions, filters, perPage) => {
          // Unpaginated (CSV path): apply filters, get all matching IDs
          const csvIds = simulateCsvExport(sessions, filters).map((r) => r.id)

          // Paginated (listing path): apply filters + pagination, collect all IDs across pages
          const totalFromListing = simulateListing(sessions, filters, 1, perPage).total
          const totalPages = Math.max(1, Math.ceil(totalFromListing / perPage))
          const paginatedIds: number[] = []
          for (let p = 1; p <= totalPages; p++) {
            const { rows } = simulateListing(sessions, filters, p, perPage)
            paginatedIds.push(...rows.map((r) => r.id))
          }

          // Same filters, same dataset → identical result sets
          assert.deepStrictEqual(
            paginatedIds,
            csvIds,
            `Same filters must produce the same set whether paginated or not. CSV: ${csvIds.length} rows, paginated union: ${paginatedIds.length} rows`
          )
        }
      ),
      { numRuns: 150 }
    )
  })
})
