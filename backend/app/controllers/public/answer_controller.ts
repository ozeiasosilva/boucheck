import type { HttpContext } from '@adonisjs/core/http'
import { answerValidator } from '#validators/answer_validator'
import Question from '#models/question'
import ResponseAnswer from '#models/response_answer'
import ResponseEvent from '#models/response_event'
import { DateTime } from 'luxon'

export default class AnswerController {
  /**
   * PUT /api/public/responses/:token/answers/:questionId
   *
   * Persists or updates a single answer for the current Response_Session.
   * - Validates body via `answerValidator`.
   * - Verifies `questionId` belongs to the session's survey → 422 if not.
   * - Upserts answer: deletes existing rows for (response_id, question_id), then inserts new ones.
   * - Deletes answers for any `invalidated_question_ids` (off-path cleanup).
   * - Logs `pergunta_respondida` event.
   *
   * Validates: Requirements 4.6, 4.7, 4.9, 4.10
   */
  async handle({ request, response, params, response_session }: HttpContext) {
    const session = response_session!
    const questionId = Number(params.questionId)

    // Validate request body
    const payload = await request.validateUsing(answerValidator)

    // Verify questionId belongs to the session's survey
    const question = await Question.query()
      .where('id', questionId)
      .where('survey_id', session.surveyId)
      .first()

    if (!question) {
      return response.status(422).json({
        error: 'question_not_in_survey',
        message: 'The questionId does not belong to this survey',
      })
    }

    // Upsert: delete existing answers for this (response_id, question_id)
    await ResponseAnswer.query()
      .where('response_id', session.id)
      .where('question_id', questionId)
      .delete()

    // Insert new answer rows
    if (payload.question_option_ids) {
      // One row per selected option
      for (const optionId of payload.question_option_ids) {
        await ResponseAnswer.create({
          responseId: session.id,
          questionId: questionId,
          questionOptionId: optionId,
          textoLivre: null,
        })
      }
    } else if (payload.texto_livre) {
      // One row for open text
      await ResponseAnswer.create({
        responseId: session.id,
        questionId: questionId,
        questionOptionId: null,
        textoLivre: payload.texto_livre,
      })
    }

    // Delete invalidated answers (off-path questions from branching changes)
    const invalidatedIds = payload.invalidated_question_ids ?? []
    if (invalidatedIds.length > 0) {
      await ResponseAnswer.query()
        .where('response_id', session.id)
        .whereIn('question_id', invalidatedIds)
        .delete()
    }

    // Log pergunta_respondida event
    await ResponseEvent.create({
      responseId: session.id,
      tipo: 'pergunta_respondida',
      payload: {
        question_id: questionId,
        timestamp: DateTime.now().toISO(),
      },
    })

    return response.ok({ saved: true })
  }
}
