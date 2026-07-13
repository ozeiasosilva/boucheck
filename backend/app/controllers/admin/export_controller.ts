import type { HttpContext } from '@adonisjs/core/http'
import { listingFiltersValidator } from '../../validators/admin_tracking_validators.js'
import CsvExporter from '#services/csv_exporter'
import type { SessionListingFilters, SortOrder } from '#services/session_query_builder'

/**
 * GET /api/admin/responses/export.csv
 *
 * Validates listing filters, sets CSV Content-Type/Content-Disposition headers,
 * and pipes the CsvExporter streaming Readable to the raw Node.js response.
 *
 * Requirements: 7.1, 7.4
 */
export default class ExportController {
  async export({ request, response }: HttpContext) {
    // 1. Validate query params with listingFiltersValidator
    const validated = await request.validateUsing(listingFiltersValidator)

    // 2. Map validated params to SessionListingFilters and SortOrder
    const filters: SessionListingFilters = {
      surveyId: validated.survey_id,
      startDate: validated.start_date,
      endDate: validated.end_date,
      status: validated.status,
      nomeContains: validated.nome,
      empresaContains: validated.empresa,
      reportAction: validated.report_action,
    }

    const sort: SortOrder = 'started_at_desc'

    // 3. Set response headers (Req 7.4)
    response.header('Content-Type', 'text/csv; charset=utf-8')
    response.header('Content-Disposition', 'attachment; filename="responses.csv"')

    // 4. Call CsvExporter.export() which returns a Readable stream
    const stream = CsvExporter.export(filters, sort)

    // 5. Pipe the stream to the raw Node.js response
    stream.pipe(response.response)

    return response
  }
}
