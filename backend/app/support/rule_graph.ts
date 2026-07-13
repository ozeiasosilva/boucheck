// ---------------------------------------------------------------------------
// RuleGraph — Pure support module for cascade navigation rule validation
//
// Implements config-time validation that guarantees the cascade rule graph is
// acyclic and forward-only (REQ-ADM-006).
//
// Requirements covered:
//   16.1 — Forward reference acceptance
//   17.1 — Backward reference rejection
//   17.2 — Self-reference rejection
//   17.3 — Cycle detection (Kahn topological sort)
//   18.1 — Dangling destination flagging (deleted question)
//   18.2 — Broken forward-only flagging (reorder)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuestionNode {
  id: number
  ordem: number
}

export interface RuleEdge {
  id: number
  ownerQuestionId: number
  nextQuestionId: number | null
  finalizar: boolean
}

export type RuleViolation =
  | { rule: number; kind: 'self' }
  | { rule: number; kind: 'backward' }
  | { rule: number; kind: 'cycle'; cycle: number[] }

export interface GraphValidation {
  ok: boolean
  violations: RuleViolation[]
}

// ---------------------------------------------------------------------------
// RuleGraph
// ---------------------------------------------------------------------------

export class RuleGraph {
  /**
   * Classifies a single directed edge between an owner question and its
   * destination question based on their `ordem` values.
   *
   * - `dest === null` means the rule is a finalizar rule (early termination);
   *   finalizar rules are always classified as `'forward'` since they don't
   *   contribute a graph edge.
   * - `dest.ordem > owner.ordem` → `'forward'` (Req 16.1)
   * - `dest.ordem === owner.ordem` → `'self'` (Req 17.2)
   * - `dest.ordem < owner.ordem` → `'backward'` (Req 17.1)
   */
  static classifyEdge(
    owner: QuestionNode,
    dest: QuestionNode | null
  ): 'forward' | 'self' | 'backward' {
    if (dest === null) {
      return 'forward'
    }

    if (dest.ordem > owner.ordem) {
      return 'forward'
    }

    if (dest.ordem === owner.ordem) {
      return 'self'
    }

    return 'backward'
  }

  /**
   * Validates the complete rule set of a survey for forward-only compliance
   * and acyclicity.
   *
   * Algorithm:
   * 1. First pass: classify every non-finalizar edge. Any self or backward
   *    edge produces an immediate violation.
   * 2. Second pass (defense-in-depth): run Kahn's topological sort over
   *    the edge set. If any nodes remain after exhausting zero-in-degree
   *    nodes, they form a cycle → cycle violation.
   *
   * Because a forward-only edge set over a total order (distinct `ordem`
   * values) cannot form a cycle, the second pass is defense-in-depth against
   * stale/flagged edges or data inconsistencies.
   */
  static validate(questions: QuestionNode[], rules: RuleEdge[]): GraphValidation {
    const violations: RuleViolation[] = []
    const questionMap = new Map<number, QuestionNode>()
    for (const q of questions) {
      questionMap.set(q.id, q)
    }

    // Collect directed edges for the topological sort pass
    const edges: Array<{ from: number; to: number }> = []

    // --- First pass: classify each edge ---
    for (const rule of rules) {
      if (rule.finalizar || rule.nextQuestionId === null) {
        continue
      }

      const owner = questionMap.get(rule.ownerQuestionId)
      const dest = questionMap.get(rule.nextQuestionId)

      if (!owner || !dest) {
        // Dangling reference — not a classification violation here,
        // handled by flagInvalid. Skip for graph validation.
        continue
      }

      const classification = RuleGraph.classifyEdge(owner, dest)

      if (classification === 'self') {
        violations.push({ rule: rule.id, kind: 'self' })
      } else if (classification === 'backward') {
        violations.push({ rule: rule.id, kind: 'backward' })
      }

      // Always add the edge for the Kahn pass (even if already classified as
      // violating) so that cycle detection covers all scenarios.
      edges.push({ from: rule.ownerQuestionId, to: rule.nextQuestionId })
    }

    // --- Second pass: Kahn's topological sort for cycle detection ---
    const cycleViolations = RuleGraph.detectCyclesKahn(edges, questions, rules)
    violations.push(...cycleViolations)

    return {
      ok: violations.length === 0,
      violations,
    }
  }

  /**
   * Computes which rules are currently invalid due to:
   * - Dangling destination (Req 18.1): `next_question_id` references a
   *   question not present in the questions array (deleted).
   * - Broken forward-only (Req 18.2): destination exists but its `ordem`
   *   is ≤ the owner's `ordem` after a reorder.
   *
   * Returns an array of rule IDs that are flagged invalid.
   */
  static flagInvalid(questions: QuestionNode[], rules: RuleEdge[]): number[] {
    const questionMap = new Map<number, QuestionNode>()
    for (const q of questions) {
      questionMap.set(q.id, q)
    }

    const invalidRuleIds: number[] = []

    for (const rule of rules) {
      // Finalizar rules and rules with null destination are never invalid
      if (rule.finalizar || rule.nextQuestionId === null) {
        continue
      }

      const owner = questionMap.get(rule.ownerQuestionId)
      const dest = questionMap.get(rule.nextQuestionId)

      // Dangling destination (Req 18.1): destination question not found
      if (!dest) {
        invalidRuleIds.push(rule.id)
        continue
      }

      // Owner question must also exist for forward-only check
      if (!owner) {
        invalidRuleIds.push(rule.id)
        continue
      }

      // Broken forward-only (Req 18.2): dest.ordem <= owner.ordem
      if (dest.ordem <= owner.ordem) {
        invalidRuleIds.push(rule.id)
      }
    }

    return invalidRuleIds
  }

  // -------------------------------------------------------------------------
  // Private: Kahn's topological sort for cycle detection
  // -------------------------------------------------------------------------

  /**
   * Runs Kahn's topological sort over the directed edge set.
   * If any nodes remain after removing all zero-in-degree nodes,
   * those nodes form cycle(s).
   *
   * Returns cycle violations referencing the rules whose edges participate
   * in the unresolved nodes.
   */
  private static detectCyclesKahn(
    edges: Array<{ from: number; to: number }>,
    _questions: QuestionNode[],
    rules: RuleEdge[]
  ): RuleViolation[] {
    if (edges.length === 0) {
      return []
    }

    // Build the set of nodes that participate in at least one edge
    const nodeSet = new Set<number>()
    for (const edge of edges) {
      nodeSet.add(edge.from)
      nodeSet.add(edge.to)
    }

    // Build adjacency list and in-degree map
    const adjacency = new Map<number, number[]>()
    const inDegree = new Map<number, number>()

    for (const node of nodeSet) {
      adjacency.set(node, [])
      inDegree.set(node, 0)
    }

    for (const edge of edges) {
      adjacency.get(edge.from)!.push(edge.to)
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
    }

    // Initialize queue with zero-in-degree nodes
    const queue: number[] = []
    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push(node)
      }
    }

    // Process the queue
    const sorted: number[] = []
    while (queue.length > 0) {
      const node = queue.shift()!
      sorted.push(node)

      for (const neighbor of adjacency.get(node) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) {
          queue.push(neighbor)
        }
      }
    }

    // If sorted contains all nodes, no cycle exists
    if (sorted.length === nodeSet.size) {
      return []
    }

    // Remaining nodes (not in sorted) form cycle(s)
    const cycleNodes = [...nodeSet].filter((n) => !sorted.includes(n))

    // Find the rules that participate in the cycle
    const cycleNodeSet = new Set(cycleNodes)
    const cycleRuleIds: number[] = []

    for (const rule of rules) {
      if (rule.finalizar || rule.nextQuestionId === null) {
        continue
      }
      if (cycleNodeSet.has(rule.ownerQuestionId) && cycleNodeSet.has(rule.nextQuestionId)) {
        cycleRuleIds.push(rule.id)
      }
    }

    // Return one cycle violation per rule in the cycle, each carrying the
    // full set of nodes that form the cycle
    return cycleRuleIds.map((ruleId) => ({
      rule: ruleId,
      kind: 'cycle' as const,
      cycle: cycleNodes,
    }))
  }
}
