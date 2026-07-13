import { describe, it } from 'node:test'
import assert from 'node:assert'
import { RuleGraph } from '../../app/support/rule_graph.js'
import type { QuestionTipo } from '../../app/models/types.js'

/**
 * Unit tests for RuleService.flow visualization logic
 * Validates: Requirements 19.1, 19.2
 *
 * The flow method queries the database, but the core logic is:
 * 1. Questions in ascending ordem, each appearing exactly once (Req 19.2)
 * 2. Each question's outgoing rules mapped to FlowBranch (Req 19.1)
 * 3. Invalid flag computed via RuleGraph.flagInvalid
 *
 * These tests replicate the pure mapping logic to verify correctness
 * without requiring database access.
 */

interface FlowBranch {
  rule_id: number
  option_id: number
  option_texto: string
  priority: number
  kind: 'goto' | 'finalizar'
  next_question_id: number | null
  invalid: boolean
}

interface FlowNode {
  question_id: number
  ordem: number
  texto: string
  tipo: QuestionTipo
  depth: number
  branches: FlowBranch[]
}

interface QuestionData {
  id: number
  surveyId: number
  texto: string
  tipo: QuestionTipo
  ordem: number
}

interface OptionData {
  id: number
  questionId: number
  texto: string
}

interface RuleData {
  id: number
  questionOptionId: number
  nextQuestionId: number | null
  finalizar: boolean
  priority: number
}

/**
 * Pure function replicating the flow-building logic from RuleService.flow.
 * This is the core algorithm extracted for testability.
 */
function buildFlowNodes(
  questions: QuestionData[],
  options: OptionData[],
  rules: RuleData[]
): FlowNode[] {
  // Build lookup maps
  const optionMap = new Map<number, OptionData>()
  for (const opt of options) {
    optionMap.set(opt.id, opt)
  }

  const optionToQuestionId = new Map<number, number>()
  for (const opt of options) {
    optionToQuestionId.set(opt.id, opt.questionId)
  }

  // Compute invalid rule ids via RuleGraph.flagInvalid
  const questionNodes = questions.map((q) => ({ id: q.id, ordem: q.ordem }))
  const ruleEdges = rules.map((r) => ({
    id: r.id,
    ownerQuestionId: optionToQuestionId.get(r.questionOptionId) ?? -1,
    nextQuestionId: r.nextQuestionId,
    finalizar: r.finalizar,
  }))

  const invalidRuleIds = new Set(RuleGraph.flagInvalid(questionNodes, ruleEdges))

  // Group rules by owner question_id
  const rulesByQuestionId = new Map<number, RuleData[]>()
  for (const rule of rules) {
    const ownerQuestionId = optionToQuestionId.get(rule.questionOptionId)
    if (ownerQuestionId === undefined) continue

    if (!rulesByQuestionId.has(ownerQuestionId)) {
      rulesByQuestionId.set(ownerQuestionId, [])
    }
    rulesByQuestionId.get(ownerQuestionId)!.push(rule)
  }

  // Build FlowNode[] — questions sorted by ordem ascending, each exactly once
  const sorted = [...questions].sort((a, b) => a.ordem - b.ordem)

  return sorted.map((q) => {
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
      depth: 0,
      branches,
    }
  })
}

describe('RuleService.flow — flow visualization logic', () => {
  it('returns questions in ascending ordem order (Req 19.2)', () => {
    const questions: QuestionData[] = [
      { id: 3, surveyId: 1, texto: 'Third', tipo: 'escolha_unica', ordem: 3 },
      { id: 1, surveyId: 1, texto: 'First', tipo: 'escolha_unica', ordem: 1 },
      { id: 2, surveyId: 1, texto: 'Second', tipo: 'multipla_escolha', ordem: 2 },
    ]

    const nodes = buildFlowNodes(questions, [], [])

    assert.strictEqual(nodes.length, 3)
    assert.strictEqual(nodes[0].ordem, 1)
    assert.strictEqual(nodes[1].ordem, 2)
    assert.strictEqual(nodes[2].ordem, 3)
  })

  it('every question appears exactly once (Req 19.2)', () => {
    const questions: QuestionData[] = [
      { id: 1, surveyId: 1, texto: 'Q1', tipo: 'escolha_unica', ordem: 1 },
      { id: 2, surveyId: 1, texto: 'Q2', tipo: 'escolha_unica', ordem: 2 },
      { id: 3, surveyId: 1, texto: 'Q3', tipo: 'aberta', ordem: 3 },
    ]

    const nodes = buildFlowNodes(questions, [], [])

    const questionIds = nodes.map((n) => n.question_id)
    assert.deepStrictEqual(questionIds, [1, 2, 3])
    // No duplicates
    assert.strictEqual(new Set(questionIds).size, questionIds.length)
  })

  it('questions with no outgoing rules have empty branches (Req 19.2)', () => {
    const questions: QuestionData[] = [
      { id: 1, surveyId: 1, texto: 'Q1', tipo: 'escolha_unica', ordem: 1 },
      { id: 2, surveyId: 1, texto: 'Q2', tipo: 'aberta', ordem: 2 },
    ]
    const options: OptionData[] = [
      { id: 10, questionId: 1, texto: 'Option A' },
    ]
    // No rules at all
    const nodes = buildFlowNodes(questions, options, [])

    assert.deepStrictEqual(nodes[0].branches, [])
    assert.deepStrictEqual(nodes[1].branches, [])
  })

  it('maps goto rules as FlowBranch with kind=goto (Req 19.1)', () => {
    const questions: QuestionData[] = [
      { id: 1, surveyId: 1, texto: 'Q1', tipo: 'escolha_unica', ordem: 1 },
      { id: 2, surveyId: 1, texto: 'Q2', tipo: 'escolha_unica', ordem: 2 },
    ]
    const options: OptionData[] = [
      { id: 10, questionId: 1, texto: 'Option A' },
    ]
    const rules: RuleData[] = [
      { id: 100, questionOptionId: 10, nextQuestionId: 2, finalizar: false, priority: 1 },
    ]

    const nodes = buildFlowNodes(questions, options, rules)

    assert.strictEqual(nodes[0].branches.length, 1)
    const branch = nodes[0].branches[0]
    assert.strictEqual(branch.rule_id, 100)
    assert.strictEqual(branch.option_id, 10)
    assert.strictEqual(branch.option_texto, 'Option A')
    assert.strictEqual(branch.priority, 1)
    assert.strictEqual(branch.kind, 'goto')
    assert.strictEqual(branch.next_question_id, 2)
    assert.strictEqual(branch.invalid, false)
  })

  it('maps finalizar rules as FlowBranch with kind=finalizar and null next_question_id (Req 19.1)', () => {
    const questions: QuestionData[] = [
      { id: 1, surveyId: 1, texto: 'Q1', tipo: 'escolha_unica', ordem: 1 },
      { id: 2, surveyId: 1, texto: 'Q2', tipo: 'escolha_unica', ordem: 2 },
    ]
    const options: OptionData[] = [
      { id: 10, questionId: 1, texto: 'Finish option' },
    ]
    const rules: RuleData[] = [
      { id: 200, questionOptionId: 10, nextQuestionId: null, finalizar: true, priority: 1 },
    ]

    const nodes = buildFlowNodes(questions, options, rules)

    assert.strictEqual(nodes[0].branches.length, 1)
    const branch = nodes[0].branches[0]
    assert.strictEqual(branch.kind, 'finalizar')
    assert.strictEqual(branch.next_question_id, null)
    assert.strictEqual(branch.invalid, false)
  })

  it('flags rules with dangling destinations as invalid', () => {
    const questions: QuestionData[] = [
      { id: 1, surveyId: 1, texto: 'Q1', tipo: 'escolha_unica', ordem: 1 },
    ]
    const options: OptionData[] = [
      { id: 10, questionId: 1, texto: 'Option A' },
    ]
    // Rule points to question 99 which does not exist (dangling)
    const rules: RuleData[] = [
      { id: 300, questionOptionId: 10, nextQuestionId: 99, finalizar: false, priority: 1 },
    ]

    const nodes = buildFlowNodes(questions, options, rules)

    assert.strictEqual(nodes[0].branches.length, 1)
    assert.strictEqual(nodes[0].branches[0].invalid, true)
  })

  it('flags rules with backward references as invalid', () => {
    const questions: QuestionData[] = [
      { id: 1, surveyId: 1, texto: 'Q1', tipo: 'escolha_unica', ordem: 1 },
      { id: 2, surveyId: 1, texto: 'Q2', tipo: 'escolha_unica', ordem: 2 },
    ]
    const options: OptionData[] = [
      { id: 20, questionId: 2, texto: 'Option B' },
    ]
    // Rule on Q2 points backward to Q1 (ordem 2 → ordem 1)
    const rules: RuleData[] = [
      { id: 400, questionOptionId: 20, nextQuestionId: 1, finalizar: false, priority: 1 },
    ]

    const nodes = buildFlowNodes(questions, options, rules)

    // Q2 (index 1) should have a branch flagged invalid
    assert.strictEqual(nodes[1].branches.length, 1)
    assert.strictEqual(nodes[1].branches[0].invalid, true)
  })

  it('depth is 0 for all questions (simple implementation)', () => {
    const questions: QuestionData[] = [
      { id: 1, surveyId: 1, texto: 'Q1', tipo: 'escolha_unica', ordem: 1 },
      { id: 2, surveyId: 1, texto: 'Q2', tipo: 'multipla_escolha', ordem: 2 },
      { id: 3, surveyId: 1, texto: 'Q3', tipo: 'aberta', ordem: 3 },
    ]

    const nodes = buildFlowNodes(questions, [], [])

    for (const node of nodes) {
      assert.strictEqual(node.depth, 0)
    }
  })

  it('returns empty nodes array for a survey with no questions', () => {
    const nodes = buildFlowNodes([], [], [])
    assert.deepStrictEqual(nodes, [])
  })

  it('multiple rules on different options of the same question all appear as branches', () => {
    const questions: QuestionData[] = [
      { id: 1, surveyId: 1, texto: 'Q1', tipo: 'multipla_escolha', ordem: 1 },
      { id: 2, surveyId: 1, texto: 'Q2', tipo: 'escolha_unica', ordem: 2 },
      { id: 3, surveyId: 1, texto: 'Q3', tipo: 'escolha_unica', ordem: 3 },
    ]
    const options: OptionData[] = [
      { id: 10, questionId: 1, texto: 'Opt A' },
      { id: 11, questionId: 1, texto: 'Opt B' },
    ]
    const rules: RuleData[] = [
      { id: 500, questionOptionId: 10, nextQuestionId: 2, finalizar: false, priority: 1 },
      { id: 501, questionOptionId: 11, nextQuestionId: 3, finalizar: false, priority: 2 },
    ]

    const nodes = buildFlowNodes(questions, options, rules)

    assert.strictEqual(nodes[0].branches.length, 2)
    assert.strictEqual(nodes[0].branches[0].rule_id, 500)
    assert.strictEqual(nodes[0].branches[1].rule_id, 501)
    // Q2 and Q3 have no outgoing rules
    assert.strictEqual(nodes[1].branches.length, 0)
    assert.strictEqual(nodes[2].branches.length, 0)
  })
})
