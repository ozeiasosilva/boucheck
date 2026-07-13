import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import Response from '#models/response'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    response_session?: Response
  }
}

/**
 * ResponseTokenAuth middleware.
 *
 * Authorizes public write requests for a Response_Session by validating the
 * `:token` route param against the `responses` table.
 *
 * - Extracts `token` from `ctx.params.token`.
 * - Queries `responses` table: SELECT id, survey_id, status FROM responses WHERE token = ?
 * - Responds 401 when no matching Response_Session exists (missing or unknown token).
 * - Attaches the found session to `ctx.response_session` for downstream controllers.
 * - For `/complete` routes, short-circuits with idempotent 200 when status is already `completo`.
 *
 * Validates: Requirement 9.1
 */
export default class ResponseTokenAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const token = ctx.params.token as string | undefined

    if (!token) {
      return ctx.response.status(401).json({ error: 'invalid_token' })
    }

    const responseSession = await Response.query().where('token', token).first()

    if (!responseSession) {
      return ctx.response.status(401).json({ error: 'invalid_token' })
    }

    ctx.response_session = responseSession

    // Idempotent short-circuit for /complete: if the session is already `completo`,
    // return 200 without proceeding to the controller (avoids re-triggering reporting handoff).
    if (ctx.request.url().endsWith('/complete') && responseSession.status === 'completo') {
      return ctx.response.status(200).json({
        completed: true,
        completed_at: responseSession.completedAt?.toISO() ?? null,
      })
    }

    return next()
  }
}
