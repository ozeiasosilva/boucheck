import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import ResponseEvent from '#models/response_event'
import Report from '#models/report'
import Survey from '#models/survey'
import reportingQueue from '#services/reporting_queue_client'
import { maskEmail } from '../../support/mask_email.js'

export default class ReportActionController {
  /**
   * GET /api/public/responses/:token/report
   *
   * Returns the public report token and URL for viewing the generated report.
   * Returns 404 if the report hasn't been generated yet.
   *
   * Validates: Requirements 8.4, 17.3
   */
  async show({ response, response_session }: HttpContext) {
    const session = response_session!

    const report = await Report.query().where('response_id', session.id).first()

    if (!report) {
      return response.notFound({
        error: 'report_not_ready',
        details: 'O relatório ainda não foi gerado.',
      })
    }

    // Check expiration
    if (report.expiresAt && report.expiresAt < DateTime.now()) {
      return response.notFound({
        error: 'report_expired',
        details: 'O relatório expirou.',
      })
    }

    return response.ok({
      public_token: report.publicToken,
      report_url: `/r/${report.publicToken}`,
    })
  }

  /**
   * POST /api/public/responses/:token/deliveries/email
   *
   * Enqueues an email delivery job addressed to the session's identification
   * e-mail, logs `relatorio_email_solicitado`, and responds with the masked
   * e-mail address for frontend confirmation display.
   *
   * Validates: Requirements 13.1, 13.4
   */
  async email({ response, response_session }: HttpContext) {
    const session = response_session!

    const email = session.email
    if (!email) {
      return response.unprocessableEntity({
        error: 'email_unavailable',
        details: 'This response session has no identification e-mail on record.',
      })
    }

    // Log the request event
    await ResponseEvent.create({
      responseId: session.id,
      tipo: 'relatorio_email_solicitado',
      payload: null,
    })

    // Enqueue email delivery job
    await reportingQueue.enqueue({
      kind: 'email_deliver',
      response_id: session.id,
      to_email: email,
    })

    return response.ok({
      masked_email: maskEmail(email),
    })
  }

  /**
   * POST /api/public/responses/:token/deliveries/whatsapp
   *
   * Enqueues a WhatsApp delivery job addressed to the session's identification
   * phone number and logs `relatorio_whatsapp_solicitado`.
   *
   * Validates: Requirements 14.1
   */
  async whatsapp({ response, response_session }: HttpContext) {
    const session = response_session!

    const phone = session.telefone
    if (!phone) {
      return response.unprocessableEntity({
        error: 'phone_unavailable',
        details: 'This response session has no identification phone number on record.',
      })
    }

    // Log the request event
    await ResponseEvent.create({
      responseId: session.id,
      tipo: 'relatorio_whatsapp_solicitado',
      payload: null,
    })

    // Enqueue WhatsApp delivery job
    await reportingQueue.enqueue({
      kind: 'whatsapp_deliver',
      response_id: session.id,
      to_phone: phone,
    })

    return response.ok({})
  }

  /**
   * POST /api/public/responses/:token/consultant-schedule
   *
   * Logs `consultor_solicitado` unconditionally, returns the survey's
   * `link_agendamento`, and enqueues a `consultant_notify` e-mail to the
   * survey's `email_notificacao` when available.
   *
   * Validates: Requirements 15.1, 15.2, 15.3, 15.4
   */
  async consultantSchedule({ response, response_session }: HttpContext) {
    const session = response_session!

    // Req 15.1 — always log the event, regardless of link availability
    await ResponseEvent.create({
      responseId: session.id,
      tipo: 'consultor_solicitado',
      payload: null,
    })

    // Load the survey to access link_agendamento and email_notificacao
    const survey = await Survey.find(session.surveyId)
    const linkAgendamento = survey?.linkAgendamento ?? null
    const emailNotificacao = survey?.emailNotificacao ?? null

    // Req 15.3 — return error when link_agendamento is null/empty
    if (!linkAgendamento) {
      return response.unprocessableEntity({
        error: 'link_agendamento_unavailable',
      })
    }

    // Req 15.4 — enqueue consultant notification when email_notificacao is set
    if (emailNotificacao) {
      await reportingQueue.enqueue({
        kind: 'consultant_notify',
        response_id: session.id,
        to_email: emailNotificacao,
      })
    } else {
      // Skip enqueue with a warning log when email_notificacao is unset
      console.warn(
        JSON.stringify({
          event: 'consultant_notify_skipped',
          reason: 'email_notificacao not configured on survey',
          response_id: session.id,
          survey_id: session.surveyId,
        })
      )
    }

    // Req 15.2 — return the scheduling link
    return response.ok({
      link_agendamento: linkAgendamento,
    })
  }
}
