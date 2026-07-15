import { Readable } from 'node:stream'
import {
  SessionQueryBuilder,
  type SessionListingFilters,
  type SortOrder,
} from '#services/session_query_builder'
import { csvEscape, CSV_BOM } from '#services/csv_helpers'

// Re-export csvEscape for backward compatibility
export { csvEscape, CSV_BOM } from '#services/csv_helpers'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * CSV header row matching the Session_Listing columns (Portuguese labels).
 */
const HEADER_ROW = [
  'Nome',
  'Empresa',
  'Email',
  'Telefone',
  'Cargo',
  'Cidade',
  'Pesquisa',
  'Status',
  'Início',
  'Conclusão',
  'Tempo (s)',
  'Visualizou',
  'Email Enviado',
  'WhatsApp Enviado',
  'Consultor Solicitado',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a single query row into an array of escaped string values
 * matching the HEADER_ROW column order.
 */
function toCsvRow(row: any): string[] {
  return [
    csvEscape(toString(row.nome)),
    csvEscape(toString(row.empresa)),
    csvEscape(toString(row.email)),
    csvEscape(toString(row.telefone)),
    csvEscape(toString(row.cargo)),
    csvEscape(toString(row.cidade)),
    csvEscape(toString(row.$extras?.survey_nome ?? row.survey_nome)),
    csvEscape(toString(row.status)),
    csvEscape(toDateString(row.startedAt ?? row.$extras?.started_at)),
    csvEscape(toDateString(row.completedAt ?? row.$extras?.completed_at)),
    csvEscape(toNumberString(row.$extras?.fill_time_seconds)),
    csvEscape(toBoolString(row.$extras?.visualizou)),
    csvEscape(toBoolString(row.$extras?.email_enviado)),
    csvEscape(toBoolString(row.$extras?.whatsapp_enviado)),
    csvEscape(toBoolString(row.$extras?.consultor_solicitado)),
  ]
}

/**
 * Converts a value to its string representation for CSV output.
 * Nulls/undefined become empty string.
 */
function toString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * Converts a date-like value to an ISO string for CSV output.
 * Supports Luxon DateTime objects, native Date objects, and strings.
 */
function toDateString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && 'toISO' in value && typeof (value as any).toISO === 'function') {
    return (value as any).toISO()
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

/**
 * Converts a numeric value to string. Null/undefined becomes empty string.
 */
function toNumberString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * Converts a boolean-like value to 'Sim'/'Não'.
 * Database boolean columns may come as true/false, 1/0, or 't'/'f'.
 */
function toBoolString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value === true || value === 1 || value === 't' || value === '1' || value === 'true') {
    return 'Sim'
  }
  return 'Não'
}

// ---------------------------------------------------------------------------
// CsvExporter class
// ---------------------------------------------------------------------------

/**
 * Streaming CSV exporter for the Session_Listing.
 * Produces a `;`-delimited, UTF-8 BOM-prefixed CSV containing every
 * Response_Session matching the given filters (unpaginated).
 *
 * Satisfies Requirements 7.1, 7.2, 7.3.
 */
export class CsvExporter {
  /**
   * Exports a filtered Session_Listing as a streaming CSV.
   *
   * - Pushes UTF-8 BOM (Req 7.3)
   * - Pushes header row with `;` separator (Req 7.2)
   * - Iterates the unpaginated query cursor and pushes each row (Req 7.1)
   * - Ends the stream with `null`
   */
  export(filters: SessionListingFilters, sort: SortOrder): Readable {
    const stream = new Readable({ read() {} })

    // UTF-8 BOM (Req 7.3)
    stream.push(CSV_BOM)

    // Header row with `;` separator (Req 7.2)
    stream.push(HEADER_ROW.join(';') + '\r\n')

    // Build query without pagination for full export (Req 7.1)
    const queryBuilder = new SessionQueryBuilder(filters, sort)
    const query = queryBuilder.build()

    // Stream rows asynchronously (fetch all and iterate)
    ;(async () => {
      try {
        const rows = await query.exec()
        for (const row of rows) {
          stream.push(toCsvRow(row).join(';') + '\r\n')
        }
        stream.push(null) // end stream
      } catch (error) {
        stream.destroy(error instanceof Error ? error : new Error(String(error)))
      }
    })()

    return stream
  }
}

export default new CsvExporter()
