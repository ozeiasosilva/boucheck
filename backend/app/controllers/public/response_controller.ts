import type { HttpContext } from '@adonisjs/core/http'
import Survey from '#models/survey'
import { identificationValidator } from '#validators/identification_validator'
import { checkResumable, createNewSession } from '#services/session_resume_service'
import type { IdentificationInput } from '#services/session_resume_service'

/**
 * POST /api/public/surveys/{slug}/responses
 *
 * Creates a Response_Session after validating identification fields (Req 3.5,
 * 3.9, 3.10, 3.11), recording `started_at` and `politica_versao` (Req 3.6,
 * 3.7), logging `privacidade_aceita` (Req 3.7), and returning the token
 * (Req 3.8).
 *
 * Supports session resume: if the submitted e-mail already has a recent
 * `iniciado` session for this survey, returns resumable info instead of
 * creating a new session (Req 3.12, 3.13). The respondent can force a new
 * session via the `X-Force-New-Session: true` header (Req 3.14).
 */
export default class ResponseController {
  async store({ request, response, params }: HttpContext) {
    // 1. Validate identification fields (VineJS returns 422 on failure)
    const payload = await request.validateUsing(identificationValidator)

    // 2. Look up the survey by slug — must be active
    const survey = await Survey.query()
      .where('slug', params.slug)
      .where('status', 'ativo')
      .first()

    if (!survey) {
      return response.notFound({ error: 'survey_not_found' })
    }

    // 3. Check X-Force-New-Session header
    const forceNew = request.header('X-Force-New-Session')?.toLowerCase() === 'true'

    // 4. If NOT forcing new session, check for resumable session (Req 3.12)
    if (!forceNew) {
      const resumable = await checkResumable(payload.email, survey.id)
      if (resumable) {
        return response.ok({
          resumable: true,
          existing_token: resumable.existingToken,
          started_at: resumable.startedAt.toISO(),
          answered_count: resumable.answeredCount,
        })
      }
    }

    // 5. Create new session (Req 3.5, 3.6, 3.7, 3.8)
    const input: IdentificationInput = {
      nome: payload.nome,
      telefone: payload.telefone,
      empresa: payload.empresa,
      email: payload.email,
      cargo: payload.cargo,
      cidade: payload.cidade,
      politicaVersao: payload.politica_versao,
    }

    const result = await createNewSession(survey.id, survey.version, input)

    return response.created({
      token: result.token,
      resumed: false,
    })
  }
}
