import Question from '#models/question'
import QuestionOption from '#models/question_option'
import QuestionRule from '#models/question_rule'
import Survey from '#models/survey'
import type { QuestionTipo } from '#models/types'
import surveyService from './survey_service.js'
import type { StructureChangeOptions } from './survey_service.js'

export { StructureChangeOptions }

/**
 * Thrown when a reorder request contains duplicate ordem values for the same survey+version.
 * HTTP 422 — Req 12.2
 */
export class DuplicateOrdemError extends Error {
  status = 422
  constructor() {
    super('Duplicate ordem values are not allowed')
  }
}

/**
 * Thrown when a question or related resource is not found.
 * HTTP 404
 */
export class NotFoundError extends Error {
  status = 404
  constructor(message = 'Question not found') {
    super(message)
  }
}

/**
 * Thrown when adding an 11th option to a Choice_Question (max 10).
 * HTTP 422 — Req 11.4
 */
export class OptionLimitError extends Error {
  status = 422
  constructor() {
    super('Choice question can have at most 10 options')
  }
}

/**
 * Thrown when attempting to add an option to an Open_Question (tipo = 'aberta').
 * HTTP 422 — Req 11.5
 */
export class OptionOnOpenQuestionError extends Error {
  status = 422
  constructor() {
    super('Options cannot be added to open questions')
  }
}

export interface QuestionInput {
  texto: string
  descricao?: string | null
  tipo: QuestionTipo
  obrigatoria?: boolean
  ordem: number
  peso: number
  dimensao?: string | null
}

export interface QuestionView {
  id: number
  survey_id: number
  survey_version: number
  texto: string
  descricao: string | null
  tipo: QuestionTipo
  obrigatoria: boolean
  ordem: number
  peso: number
  dimensao: string | null
  created_at: string | null
  updated_at: string | null
}

function toView(question: Question): QuestionView {
  return {
    id: question.id,
    survey_id: question.surveyId,
    survey_version: question.surveyVersion,
    texto: question.texto,
    descricao: question.descricao,
    tipo: question.tipo,
    obrigatoria: question.obrigatoria,
    ordem: question.ordem,
    peso: question.peso,
    dimensao: question.dimensao,
    created_at: question.createdAt?.toISO() ?? null,
    updated_at: question.updatedAt?.toISO() ?? null,
  }
}

export interface OptionInput {
  texto: string
  pontuacao: number
  ordem: number
}

export interface OptionView {
  id: number
  question_id: number
  texto: string
  pontuacao: number
  ordem: number
}

function toOptionView(option: QuestionOption): OptionView {
  return {
    id: option.id,
    question_id: option.questionId,
    texto: option.texto,
    pontuacao: option.pontuacao,
    ordem: option.ordem,
  }
}

export class QuestionService {
  /**
   * Create a new question associated with a survey.
   * Funnels through SurveyService.applyStructureChange for versioning.
   *
   * Persists: texto, descricao (null when omitted), tipo, obrigatoria (default true),
   * ordem, peso, dimensao (null when omitted).
   *
   * Req 10.1, 10.2, 10.6, 10.7, 10.8
   */
  async create(
    surveyId: number,
    input: QuestionInput,
    opts: StructureChangeOptions
  ): Promise<QuestionView> {
    return surveyService.applyStructureChange(surveyId, opts, async () => {
      // Load the survey to get its current version
      const survey = await Survey.find(surveyId)
      if (!survey) throw new NotFoundError('Survey not found')

      const question = await Question.create({
        surveyId,
        surveyVersion: survey.version,
        texto: input.texto,
        descricao: input.descricao ?? null,
        tipo: input.tipo,
        obrigatoria: input.obrigatoria ?? true,
        ordem: input.ordem,
        peso: input.peso,
        dimensao: input.dimensao ?? null,
      })

      return toView(question)
    })
  }

  /**
   * Update an existing question's fields.
   * Funnels through SurveyService.applyStructureChange for versioning.
   *
   * Only updates fields that are present in the input (partial update).
   * descricao and dimensao are set to null when explicitly passed as null.
   *
   * Req 1.3, 10.1, 10.2
   */
  async update(
    id: number,
    input: Partial<QuestionInput>,
    opts: StructureChangeOptions
  ): Promise<QuestionView> {
    const question = await Question.find(id)
    if (!question) throw new NotFoundError()

    return surveyService.applyStructureChange(question.surveyId, opts, async () => {
      // Re-load inside the mutation closure to ensure consistency
      const q = await Question.find(id)
      if (!q) throw new NotFoundError()

      if (input.texto !== undefined) q.texto = input.texto
      if (input.descricao !== undefined) q.descricao = input.descricao ?? null
      if (input.tipo !== undefined) q.tipo = input.tipo
      if (input.obrigatoria !== undefined) q.obrigatoria = input.obrigatoria ?? true
      if (input.ordem !== undefined) q.ordem = input.ordem
      if (input.peso !== undefined) q.peso = input.peso
      if (input.dimensao !== undefined) q.dimensao = input.dimensao ?? null

      await q.save()

      return toView(q)
    })
  }

  /**
   * Delete a question.
   *
   * Two paths based on Has_Responses:
   * - Not Has_Responses (draft): physically cascade-delete the question,
   *   its options, and rules attached to those options (Req 13.1).
   * - Has_Responses: reject physical delete; route through applyStructureChange
   *   versioning. The 409 confirmation flow applies (Req 13.2, Req 5.1).
   *
   * Req 13.1, 13.2
   */
  async delete(id: number, opts: StructureChangeOptions): Promise<void> {
    const question = await Question.find(id)
    if (!question) throw new NotFoundError()

    const hasResp = await surveyService.hasResponses(question.surveyId)

    if (!hasResp) {
      // Draft survey: physical cascade delete (Req 13.1)
      // 1. Delete rules attached to this question's options
      await QuestionRule.query()
        .whereIn(
          'question_option_id',
          QuestionOption.query().where('question_id', id).select('id')
        )
        .delete()
      // 2. Delete all options of this question
      await QuestionOption.query().where('question_id', id).delete()
      // 3. Delete the question itself
      await question.delete()
    } else {
      // Has responses: route through structure versioning (Req 13.2)
      // applyStructureChange handles 409 confirmation flow (Req 5.1)
      await surveyService.applyStructureChange(question.surveyId, opts, async () => {
        // Within the versioned transaction: cascade delete
        await QuestionRule.query()
          .whereIn(
            'question_option_id',
            QuestionOption.query().where('question_id', id).select('id')
          )
          .delete()
        await QuestionOption.query().where('question_id', id).delete()
        await Question.query().where('id', id).delete()
      })
    }
  }

  /**
   * Reorder questions within a survey by persisting submitted ordem values.
   * Rejects if the input contains duplicate ordem values (422 DuplicateOrdemError).
   * Funnels through SurveyService.applyStructureChange for versioning.
   * After persisting, rule invalidity is computed at runtime (not stored).
   *
   * Req 12.1, 12.2, 18.2
   */
  async reorder(
    surveyId: number,
    ordem: { id: number; ordem: number }[],
    opts: StructureChangeOptions
  ): Promise<QuestionView[]> {
    // Check for duplicate ordem values in the input array (Req 12.2)
    const ordemValues = ordem.map((item) => item.ordem)
    const uniqueOrdemValues = new Set(ordemValues)
    if (uniqueOrdemValues.size !== ordemValues.length) {
      throw new DuplicateOrdemError()
    }

    return surveyService.applyStructureChange(surveyId, opts, async () => {
      // Persist each question's new ordem value
      for (const item of ordem) {
        const question = await Question.find(item.id)
        if (!question) throw new NotFoundError()
        question.ordem = item.ordem
        await question.save()
      }

      // Return all questions of the survey in new ordem order
      const questions = await Question.query()
        .where('survey_id', surveyId)
        .orderBy('ordem', 'asc')

      return questions.map(toView)
    })
  }

  /**
   * Add an option to a question.
   * Rejects with 422 OptionOnOpenQuestionError if the question tipo is 'aberta'.
   * Rejects with 422 OptionLimitError if the question already has 10 options (max 10).
   * Funnels through SurveyService.applyStructureChange for versioning.
   *
   * Req 11.1, 11.2, 11.4, 11.5
   */
  async addOption(
    questionId: number,
    input: OptionInput,
    opts: StructureChangeOptions
  ): Promise<OptionView> {
    const question = await Question.find(questionId)
    if (!question) throw new NotFoundError('Question not found')

    // Reject options on open questions (Req 11.5)
    if (question.tipo === 'aberta') {
      throw new OptionOnOpenQuestionError()
    }

    // Count existing options and reject if already at max 10 (Req 11.4)
    const countResult = await QuestionOption.query()
      .where('question_id', questionId)
      .count('* as total')
    const currentCount = Number(countResult[0].$extras.total)

    if (currentCount >= 10) {
      throw new OptionLimitError()
    }

    return surveyService.applyStructureChange(question.surveyId, opts, async () => {
      const option = await QuestionOption.create({
        questionId,
        texto: input.texto,
        pontuacao: input.pontuacao,
        ordem: input.ordem,
      })

      return toOptionView(option)
    })
  }

  /**
   * Update an existing option's fields.
   * Funnels through SurveyService.applyStructureChange for versioning.
   *
   * Req 11.1, 11.2
   */
  async updateOption(
    id: number,
    input: Partial<OptionInput>,
    opts: StructureChangeOptions
  ): Promise<OptionView> {
    const option = await QuestionOption.query().where('id', id).preload('question').first()
    if (!option) throw new NotFoundError('Option not found')

    return surveyService.applyStructureChange(option.question.surveyId, opts, async () => {
      // Re-load inside the mutation closure
      const opt = await QuestionOption.find(id)
      if (!opt) throw new NotFoundError('Option not found')

      if (input.texto !== undefined) opt.texto = input.texto
      if (input.pontuacao !== undefined) opt.pontuacao = input.pontuacao
      if (input.ordem !== undefined) opt.ordem = input.ordem

      await opt.save()

      return toOptionView(opt)
    })
  }

  /**
   * Delete an existing option.
   * Funnels through SurveyService.applyStructureChange for versioning.
   *
   * Req 11.1
   */
  async deleteOption(
    id: number,
    opts: StructureChangeOptions
  ): Promise<void> {
    const option = await QuestionOption.query().where('id', id).preload('question').first()
    if (!option) throw new NotFoundError('Option not found')

    return surveyService.applyStructureChange(option.question.surveyId, opts, async () => {
      // Re-load inside the mutation closure
      const opt = await QuestionOption.find(id)
      if (!opt) throw new NotFoundError('Option not found')

      await opt.delete()
    })
  }
}

export default new QuestionService()
