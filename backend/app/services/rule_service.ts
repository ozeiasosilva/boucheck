import Question from '#models/question'
import QuestionOption from '#models/question_option'
import QuestionRule from '#models/question_rule'
import { RuleGraph } from '../support/rule_graph.js'
import type { QuestionTipo } from '#models/types'

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class NotFoundError extends Error {
  status = 404
  constructor(message = 'Not found') {
    super(message)
  }
}

export class RuleNotFoundError extends NotFoundError {
  constructor(message = 'Rule not found') {
    super(message)
  }
}

export class SelfRuleError extends Error {
  status = 422
  constructor(message = 'A rule cannot target its own question') {
    super(message)
  }
}

export class BackwardRuleError extends Error {
  status = 422
  constructor(message = 'Rules must point forward') {
    super(message)
  }
}

export class CyclicRuleError extends Error {
  status = 422
  constructor(message = 'Rule would create a cycle in the navigation graph') {
    super(message)
  }
}

export class RuleOnOpenQuestionError extends Error {
  status = 422
  constructor(message = 'Cascade rules can only be attached to choice question options') {
    super(message)
  }
}

// ---------------------------------------------------------------------------
// Input / View interfaces
// ---------------------------------------------------------------------------

export interface RuleInput {
  question_option_id: number
  next_question_id?: number | null
  finalizar?: boolean
  priority?: number
}

export interface RuleView {
  id: number
  question_option_id: number
  next_question_id: number | null
  finalizar: boolean
  priority: number
}

// ---------------------------------------------------------------------------
// Flow visualization interfaces (Req 19)
// ---------------------------------------------------------------------------

export interface FlowBranch {
  rule_id: number
  option_id: number
  option_texto: string
  priority: number
  kind: 'goto' | 'finalizar'
  next_question_id: number | null
  invalid: boolean
}

export interface FlowNode {
  question_id: number
  ordem: number
  texto: string
  tipo: QuestionTipo
  depth: number
  branches: FlowBranch[]
}

// ---------------------------------------------------------------------------
// RuleService
// ---------------------------------------------------------------------------

export class RuleService {
  /**
   * Get a single rule by id.
   */
  async get(id: number): Promise<RuleView> {
    const rule = await QuestionRule.find(id)
    if (!rule) {
      throw new RuleNotFoundError()
    }
    return this.toView(rule)
  }

  /**
   * Create a new cascade rule (Req 16, 17, 20.2).
   *
   * - Only attaches to Choice_Question options (Req 16.3)
   * - finalizar = true → persist with next_question_id = null (Req 16.2)
   * - Classifies edge: self → 422, backward → 422 (Req 17.1, 17.2)
   * - Validates prospective rule set is acyclic (Req 17.3)
   * - Defaults priority to owning option's ordem (Req 20.2)
   */
  async create(input: RuleInput): Promise<RuleView> {
    const option = await QuestionOption.find(input.question_option_id)
    if (!option) {
      throw new RuleNotFoundError('Option not found')
    }

    // Load the owning question to check tipo (Req 16.3)
    const ownerQuestion = await Question.find(option.questionId)
    if (!ownerQuestion) {
      throw new RuleNotFoundError('Owner question not found')
    }

    if (ownerQuestion.tipo === 'aberta') {
      throw new RuleOnOpenQuestionError()
    }

    // Determine finalizar and next_question_id
    const finalizar = input.finalizar ?? false
    let nextQuestionId: number | null = null

    if (finalizar) {
      // Req 16.2: early-termination rule, next_question_id = null
      nextQuestionId = null
    } else {
      nextQuestionId = input.next_question_id ?? null
      if (nextQuestionId !== null) {
        // Validate forward-only (Req 16.1, 17.1, 17.2)
        const destQuestion = await Question.find(nextQuestionId)
        if (!destQuestion) {
          throw new RuleNotFoundError('Destination question not found')
        }

        // Ensure same survey
        if (destQuestion.surveyId !== ownerQuestion.surveyId) {
          throw new BackwardRuleError()
        }

        const classification = RuleGraph.classifyEdge(
          { id: ownerQuestion.id, ordem: ownerQuestion.ordem },
          { id: destQuestion.id, ordem: destQuestion.ordem }
        )

        if (classification === 'self') {
          throw new SelfRuleError()
        }
        if (classification === 'backward') {
          throw new BackwardRuleError()
        }

        // Validate acyclicity with the prospective rule set (Req 17.3)
        await this.validateAcyclic(ownerQuestion.surveyId, {
          ownerQuestionId: ownerQuestion.id,
          nextQuestionId,
          finalizar: false,
        })
      }
    }

    // Default priority to option's ordem (Req 20.2)
    const priority = input.priority ?? option.ordem

    const rule = await QuestionRule.create({
      questionOptionId: input.question_option_id,
      nextQuestionId,
      finalizar,
      priority,
    })

    return this.toView(rule)
  }

  /**
   * Update an existing cascade rule.
   */
  async update(id: number, input: Partial<RuleInput>): Promise<RuleView> {
    const rule = await QuestionRule.find(id)
    if (!rule) {
      throw new RuleNotFoundError()
    }

    // Load the owning option and question
    const option = await QuestionOption.find(rule.questionOptionId)
    if (!option) {
      throw new RuleNotFoundError('Option not found')
    }

    const ownerQuestion = await Question.find(option.questionId)
    if (!ownerQuestion) {
      throw new RuleNotFoundError('Owner question not found')
    }

    // If changing question_option_id, validate new option
    if (input.question_option_id !== undefined && input.question_option_id !== rule.questionOptionId) {
      const newOption = await QuestionOption.find(input.question_option_id)
      if (!newOption) {
        throw new RuleNotFoundError('Option not found')
      }

      const newOwnerQuestion = await Question.find(newOption.questionId)
      if (!newOwnerQuestion) {
        throw new RuleNotFoundError('Owner question not found')
      }

      if (newOwnerQuestion.tipo === 'aberta') {
        throw new RuleOnOpenQuestionError()
      }
    }

    // Determine new values
    const finalizar = input.finalizar ?? rule.finalizar
    let nextQuestionId: number | null = rule.nextQuestionId

    if (finalizar) {
      nextQuestionId = null
    } else if (input.next_question_id !== undefined) {
      nextQuestionId = input.next_question_id ?? null
    }

    if (!finalizar && nextQuestionId !== null) {
      const destQuestion = await Question.find(nextQuestionId)
      if (!destQuestion) {
        throw new RuleNotFoundError('Destination question not found')
      }

      if (destQuestion.surveyId !== ownerQuestion.surveyId) {
        throw new BackwardRuleError()
      }

      const classification = RuleGraph.classifyEdge(
        { id: ownerQuestion.id, ordem: ownerQuestion.ordem },
        { id: destQuestion.id, ordem: destQuestion.ordem }
      )

      if (classification === 'self') {
        throw new SelfRuleError()
      }
      if (classification === 'backward') {
        throw new BackwardRuleError()
      }

      // Validate acyclicity excluding current rule from existing set
      await this.validateAcyclic(ownerQuestion.surveyId, {
        ownerQuestionId: ownerQuestion.id,
        nextQuestionId,
        finalizar: false,
      }, rule.id)
    }

    // Apply updates
    if (input.question_option_id !== undefined) {
      rule.questionOptionId = input.question_option_id
    }
    rule.nextQuestionId = nextQuestionId
    rule.finalizar = finalizar
    if (input.priority !== undefined) {
      rule.priority = input.priority
    }

    await rule.save()
    return this.toView(rule)
  }

  /**
   * Delete a cascade rule.
   */
  async delete(id: number): Promise<void> {
    const rule = await QuestionRule.find(id)
    if (!rule) {
      throw new RuleNotFoundError()
    }
    await rule.delete()
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private toView(rule: QuestionRule): RuleView {
    return {
      id: rule.id,
      question_option_id: rule.questionOptionId,
      next_question_id: rule.nextQuestionId,
      finalizar: rule.finalizar,
      priority: rule.priority,
    }
  }

  /**
   * Validates that adding a prospective rule to the survey's rule set
   * doesn't create a cycle.
   *
   * @param excludeRuleId - Rule id to exclude from existing rules (for updates)
   */
  private async validateAcyclic(
    surveyId: number,
    prospectiveRule: { ownerQuestionId: number; nextQuestionId: number; finalizar: boolean },
    excludeRuleId?: number
  ): Promise<void> {
    // Load all questions and their rules for the survey
    const questions = await Question.query()
      .where('survey_id', surveyId)
      .orderBy('ordem', 'asc')

    const questionIds = questions.map((q) => q.id)
    const options = await QuestionOption.query().whereIn('question_id', questionIds)
    const optionIds = options.map((o) => o.id)

    const existingRules = optionIds.length > 0
      ? await QuestionRule.query().whereIn('question_option_id', optionIds)
      : []

    // Build option → question map
    const optionToQuestionId = new Map<number, number>()
    for (const opt of options) {
      optionToQuestionId.set(opt.id, opt.questionId)
    }

    // Build rule edges (exclude the rule being updated)
    const ruleEdges = existingRules
      .filter((r) => r.id !== excludeRuleId)
      .map((r) => ({
        id: r.id,
        ownerQuestionId: optionToQuestionId.get(r.questionOptionId) ?? -1,
        nextQuestionId: r.nextQuestionId,
        finalizar: r.finalizar,
      }))

    // Add the prospective rule
    ruleEdges.push({
      id: -1, // Temporary id for prospective rule
      ownerQuestionId: prospectiveRule.ownerQuestionId,
      nextQuestionId: prospectiveRule.nextQuestionId,
      finalizar: prospectiveRule.finalizar,
    })

    const questionNodes = questions.map((q) => ({ id: q.id, ordem: q.ordem }))
    const result = RuleGraph.validate(questionNodes, ruleEdges)

    if (!result.ok) {
      throw new CyclicRuleError()
    }
  }

  /**
   * Flow visualization (Req 19).
   *
   * Returns an ordered list of FlowNodes representing the survey's question
   * flow with branching rules. Questions are returned in ascending `ordem`,
   * each appearing exactly once (Req 19.2). Each question carries its outgoing
   * Cascade_Rules as FlowBranch entries showing goto/finalizar destinations
   * and invalid flags (Req 19.1).
   *
   * Algorithm:
   * 1. Load all questions for the survey, ordered by `ordem` ascending
   * 2. Load all options for those questions
   * 3. Load all rules for those options
   * 4. Compute invalid rule ids via `RuleGraph.flagInvalid`
   * 5. Build FlowNode[] where each question appears exactly once with branches
   * 6. Return `{ nodes: FlowNode[] }`
   */
  async flow(surveyId: number): Promise<{ nodes: FlowNode[] }> {
    // 1. Load all questions for the survey ordered by ordem ascending
    const questions = await Question.query()
      .where('survey_id', surveyId)
      .orderBy('ordem', 'asc')

    if (questions.length === 0) {
      return { nodes: [] }
    }

    const questionIds = questions.map((q) => q.id)

    // 2. Load all options for those questions
    const options = await QuestionOption.query().whereIn('question_id', questionIds)

    const optionIds = options.map((o) => o.id)

    // 3. Load all rules for those options
    const rules =
      optionIds.length > 0
        ? await QuestionRule.query().whereIn('question_option_id', optionIds)
        : []

    // Build lookup maps
    // option_id → option
    const optionMap = new Map<number, QuestionOption>()
    for (const opt of options) {
      optionMap.set(opt.id, opt)
    }

    // option_id → question_id (owner)
    const optionToQuestionId = new Map<number, number>()
    for (const opt of options) {
      optionToQuestionId.set(opt.id, opt.questionId)
    }

    // question_id → question
    const questionMap = new Map<number, Question>()
    for (const q of questions) {
      questionMap.set(q.id, q)
    }

    // 4. Compute invalid rule ids via RuleGraph.flagInvalid
    const questionNodes = questions.map((q) => ({ id: q.id, ordem: q.ordem }))
    const ruleEdges = rules.map((r) => ({
      id: r.id,
      ownerQuestionId: optionToQuestionId.get(r.questionOptionId) ?? -1,
      nextQuestionId: r.nextQuestionId,
      finalizar: r.finalizar,
    }))

    const invalidRuleIds = new Set(RuleGraph.flagInvalid(questionNodes, ruleEdges))

    // 5. Group rules by owner question_id
    const rulesByQuestionId = new Map<number, QuestionRule[]>()
    for (const rule of rules) {
      const ownerQuestionId = optionToQuestionId.get(rule.questionOptionId)
      if (ownerQuestionId === undefined) continue

      if (!rulesByQuestionId.has(ownerQuestionId)) {
        rulesByQuestionId.set(ownerQuestionId, [])
      }
      rulesByQuestionId.get(ownerQuestionId)!.push(rule)
    }

    // 6. Build FlowNode[] — each question appears exactly once (Req 19.2)
    const nodes: FlowNode[] = questions.map((q) => {
      const questionRules = rulesByQuestionId.get(q.id) ?? []

      const branches: FlowBranch[] = questionRules.map((rule) => {
        const option = optionMap.get(rule.questionOptionId)
        return {
          rule_id: rule.id,
          option_id: rule.questionOptionId,
          option_texto: option?.texto ?? '',
          priority: rule.priority,
          kind: rule.finalizar ? ('finalizar' as const) : ('goto' as const),
          next_question_id: rule.nextQuestionId,
          invalid: invalidRuleIds.has(rule.id),
        }
      })

      return {
        question_id: q.id,
        ordem: q.ordem,
        texto: q.texto,
        tipo: q.tipo,
        depth: 0, // Simple implementation: depth = 0 for all, client uses branches for indentation
        branches,
      }
    })

    return { nodes }
  }
}

export default new RuleService()
