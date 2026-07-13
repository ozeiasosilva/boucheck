import type { HttpContext } from '@adonisjs/core/http'
import { eventValidator } from '#validators/event_validator'
import ResponseEvent from '#models/response_event'

export default class EventController {
  /**
   * POST /api/public/responses/:token/events
   *
   * Logs a traceability event for the current Response_Session.
   * - Validates body via `eventValidator` (rejects unrecognized `tipo` with 422).
   * - Creates a `response_events` row with response_id, tipo, payload, created_at.
   * - Returns 201 with `{ event_id }`.
   *
   * Validates: Requirements 8.1, 8.3
   */
  async handle({ request, response, response_session }: HttpContext) {
    const session = response_session!

    const payload = await request.validateUsing(eventValidator)

    const event = await ResponseEvent.create({
      responseId: session.id,
      tipo: payload.tipo,
      payload: payload.payload ?? null,
    })

    return response.created({ event_id: event.id })
  }
}
