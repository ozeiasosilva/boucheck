import type { HttpContext } from '@adonisjs/core/http'
import AiPromptConfig from '#models/ai_prompt_config'
import { updatePromptsValidator } from '#validators/insight_validators'

export default class AiPromptConfigController {
  /**
   * GET /api/admin/ai-config/prompts
   *
   * Returns current prompt configurations for both agents.
   * If no custom prompt exists, conteudo is null and is_default is true.
   * Requirements: 4.1, 4.2
   */
  async show({ response }: HttpContext) {
    const [surveyConfig, clientConfig] = await Promise.all([
      AiPromptConfig.query().where('tipo', 'survey_agent').first(),
      AiPromptConfig.query().where('tipo', 'client_agent').first(),
    ])

    return response.ok({
      survey_agent: {
        conteudo: surveyConfig?.conteudo ?? null,
        is_default: !surveyConfig,
      },
      client_agent: {
        conteudo: clientConfig?.conteudo ?? null,
        is_default: !clientConfig,
      },
    })
  }

  /**
   * PUT /api/admin/ai-config/prompts
   *
   * Validates and upserts prompt configurations for the AI agents.
   * Requirements: 4.3, 4.4, 4.5, 4.8
   */
  async update({ request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(updatePromptsValidator)
    const adminUserId = auth.user!.id

    if (payload.survey_agent_prompt !== undefined) {
      await AiPromptConfig.updateOrCreate(
        { tipo: 'survey_agent' },
        { conteudo: payload.survey_agent_prompt, adminUserId }
      )
    }

    if (payload.client_agent_prompt !== undefined) {
      await AiPromptConfig.updateOrCreate(
        { tipo: 'client_agent' },
        { conteudo: payload.client_agent_prompt, adminUserId }
      )
    }

    return response.ok({ message: 'Prompts atualizados com sucesso.' })
  }
}
