import type { HttpContext } from '@adonisjs/core/http'
import {
  generateQuestionsValidator,
  confirmQuestionsValidator,
} from '../validators/ai_question_validators.js'
import Survey from '#models/survey'
import Question from '#models/question'
import {
  QuestionGenerationService,
  GenerationFailedError,
} from '#services/question_generation_service'
import { BedrockTimeoutError, BedrockInvocationError, BedrockClient } from '../support/bedrock_client.js'
import questionService from '#services/question_service'
import bedrockConfig from '#config/bedrock'
import logger from '@adonisjs/core/services/logger'

export default class AiQuestionController {
  /**
   * POST /api/admin/surveys/:id/ai/generate-questions
   *
   * Validates request, invokes AI generation pipeline, returns preview payload.
   * Never persists questions or options — only writes audit log.
   * Req 1.1, 5.1, 5.2, 5.3, 5.4, 7.2, 9.1, 9.2
   */
  async generate({ params, request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(generateQuestionsValidator)

    const survey = await Survey.find(Number(params.id))
    if (!survey) {
      return response.notFound({ error: 'Survey not found' })
    }

    const adminUserId = auth.user!.id

    const bedrockClient = new BedrockClient(bedrockConfig)
    const service = new QuestionGenerationService(bedrockClient)

    try {
      const preview = await service.generate(adminUserId, survey.id, payload)
      return response.ok({ questions: preview.questions })
    } catch (error) {
      if (error instanceof GenerationFailedError) {
        return response.unprocessableEntity({ error: error.message })
      }
      if (error instanceof BedrockTimeoutError) {
        logger.error({ err: error }, 'Bedrock timeout during AI question generation')
        return response.status(504).json({ error: 'A geração excedeu o tempo limite. Tente novamente.' })
      }
      if (error instanceof BedrockInvocationError) {
        logger.error({ err: error, cause: error.cause }, 'Bedrock invocation error during AI question generation')
        return response.status(502).json({
          error: 'Erro ao comunicar com o serviço de IA.',
          details: error.message,
        })
      }
      throw error
    }
  }

  /**
   * POST /api/admin/surveys/:id/ai/confirm-questions
   *
   * Persists confirmed questions through survey-authoring QuestionService.
   * Req 5.5, 5.6, 9.3, 9.4, 9.5
   */
  async confirm({ params, request, response, auth }: HttpContext) {
    const { questions } = await request.validateUsing(confirmQuestionsValidator)

    const survey = await Survey.find(Number(params.id))
    if (!survey) {
      return response.notFound({ error: 'Survey not found' })
    }

    // Resolve adminUserId to assert auth is present (guard ensures only admins reach here)
    void auth.user!.id

    if (questions.length === 0) {
      return response.created({ message: 'Nenhuma pergunta para salvar.', created_count: 0 })
    }

    // Get the current max ordem for questions in this survey
    const maxOrdemResult = await Question.query()
      .where('survey_id', survey.id)
      .max('ordem as max_ordem')

    const currentMax = Number(maxOrdemResult[0]?.$extras.max_ordem) || 0

    for (let index = 0; index < questions.length; index++) {
      const q = questions[index]

      const createdQuestion = await questionService.create(
        survey.id,
        {
          texto: q.texto,
          tipo: q.tipo,
          obrigatoria: q.obrigatoria,
          ordem: currentMax + index + 1,
          peso: 1,
        },
        { confirmed: true }
      )

      for (let optionIndex = 0; optionIndex < q.opcoes.length; optionIndex++) {
        const opt = q.opcoes[optionIndex]
        await questionService.addOption(
          createdQuestion.id,
          {
            texto: opt.texto,
            pontuacao: opt.pontuacao,
            ordem: optionIndex + 1,
          },
          { confirmed: true }
        )
      }
    }

    return response.created({
      message: 'Perguntas confirmadas e salvas com sucesso.',
      created_count: questions.length,
    })
  }
}
