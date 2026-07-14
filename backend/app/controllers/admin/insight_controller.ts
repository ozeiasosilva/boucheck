import type { HttpContext } from '@adonisjs/core/http'
import {
  generateSurveyInsightValidator,
  generateClientInsightValidator,
} from '../../validators/insight_validators.js'
import surveyInsightService from '#services/survey_insight_service'
import clientInsightService from '#services/client_insight_service'
import Response from '#models/response'
import { BedrockTimeoutError, BedrockInvocationError } from '../../support/bedrock_client.js'
import logger from '@adonisjs/core/services/logger'

export default class InsightController {
  /**
   * POST /api/admin/insights/survey
   *
   * Validates body, checks survey eligibility (at least 1 completed response),
   * generates insight via SurveyInsightService, returns 200 with result.
   *
   * Requirements: 1.1, 1.4, 1.7, 7.5
   */
  async generateSurvey({ request, response, auth }: HttpContext) {
    const { survey_id: surveyId } = await request.validateUsing(generateSurveyInsightValidator)
    const adminUserId = auth.user!.id

    const eligible = await surveyInsightService.isEligible(surveyId)
    if (!eligible) {
      return response.status(422).json({
        error: 'Survey não possui respostas completadas.',
      })
    }

    try {
      const insight = await surveyInsightService.generate(surveyId, adminUserId)
      return response.ok(insight)
    } catch (error) {
      if (error instanceof BedrockTimeoutError) {
        logger.error({ err: error }, 'Bedrock timeout during survey insight generation')
        return response.status(504).json({
          error: 'Tempo limite excedido na geração do insight.',
        })
      }
      if (error instanceof BedrockInvocationError) {
        logger.error({ err: error, cause: error.cause }, 'Bedrock invocation error during survey insight generation')
        return response.status(502).json({
          error: 'Falha na comunicação com o serviço de IA.',
        })
      }
      throw error
    }
  }

  /**
   * GET /api/admin/insights/survey/:surveyId
   *
   * Returns the latest survey insight for the given survey, or null.
   *
   * Requirements: 1.5, 1.6
   */
  async showSurvey({ params, response }: HttpContext) {
    const surveyId = Number(params.surveyId)
    const insight = await surveyInsightService.getLatest(surveyId)
    return response.ok(insight)
  }

  /**
   * POST /api/admin/insights/client
   *
   * Validates body, checks response exists and is not anonymized,
   * generates insight via ClientInsightService, returns 200 with result.
   *
   * Requirements: 2.1, 2.4, 6.2, 7.6
   */
  async generateClient({ request, response, auth }: HttpContext) {
    const { response_id: responseId } = await request.validateUsing(generateClientInsightValidator)
    const adminUserId = auth.user!.id

    const clientResponse = await Response.find(responseId)
    if (!clientResponse) {
      return response.notFound({ error: 'Resposta não encontrada.' })
    }

    if (clientResponse.anonimizado) {
      return response.status(422).json({
        error: 'Não é possível gerar insight para uma resposta anonimizada.',
      })
    }

    try {
      const insight = await clientInsightService.generate(responseId, adminUserId)
      return response.ok(insight)
    } catch (error) {
      if (error instanceof BedrockTimeoutError) {
        logger.error({ err: error }, 'Bedrock timeout during client insight generation')
        return response.status(504).json({
          error: 'Tempo limite excedido na geração do insight.',
        })
      }
      if (error instanceof BedrockInvocationError) {
        logger.error({ err: error, cause: error.cause }, 'Bedrock invocation error during client insight generation')
        return response.status(502).json({
          error: 'Falha na comunicação com o serviço de IA.',
        })
      }
      throw error
    }
  }

  /**
   * GET /api/admin/insights/client/:responseId
   *
   * Returns the latest client insight for the given response, or null.
   *
   * Requirements: 2.5, 2.6
   */
  async showClient({ params, response }: HttpContext) {
    const responseId = params.responseId as string
    const insight = await clientInsightService.getLatest(responseId)
    return response.ok(insight)
  }
}
