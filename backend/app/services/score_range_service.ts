import ScoreRange from '#models/score_range'
import { firstOverlap } from '../support/score_range_overlap.js'
import type { Interval } from '../support/score_range_overlap.js'

/**
 * Thrown when min > max (Req 21.4).
 */
export class ScoreRangeBoundsError extends Error {
  status = 422
  constructor(min: number, max: number) {
    super(`Score range bounds invalid: min (${min}) must be less than or equal to max (${max})`)
  }
}

/**
 * Thrown when the candidate range overlaps an existing sibling (Req 21.5).
 */
export class ScoreRangeOverlapError extends Error {
  status = 422
  conflicting: { id: number; min: number; max: number }
  constructor(conflicting: Interval & { id: number }) {
    super(
      `Score range overlaps existing range id=${conflicting.id} [${conflicting.min}, ${conflicting.max}]`
    )
    this.conflicting = { id: conflicting.id, min: conflicting.min, max: conflicting.max }
  }
}

export class ScoreRangeNotFoundError extends Error {
  status = 404
  constructor() {
    super('Score range not found')
  }
}

export interface ScoreRangeView {
  id: number
  surveyId: number
  nome: string
  min: number
  max: number
  descricao: string | null
  cor: string | null
}

function toView(range: ScoreRange): ScoreRangeView {
  return {
    id: range.id,
    surveyId: range.surveyId,
    nome: range.nome,
    min: range.min,
    max: range.max,
    descricao: range.descricao,
    cor: range.cor,
  }
}

export interface ScoreRangeInput {
  nome: string
  min: number
  max: number
  descricao?: string | null
  cor?: string | null
}

export class ScoreRangeService {
  /**
   * List all score ranges for a survey.
   */
  async list(surveyId: number): Promise<ScoreRangeView[]> {
    const ranges = await ScoreRange.query().where('surveyId', surveyId).orderBy('min', 'asc')
    return ranges.map(toView)
  }

  /**
   * Create a new score range for a survey.
   * Enforces min ≤ max (Req 21.4) and non-overlapping bounds (Req 21.5).
   * The `cor` field is validated by the VineJS validator (Req 21.6).
   */
  async create(surveyId: number, input: ScoreRangeInput): Promise<ScoreRangeView> {
    // 1. Enforce min ≤ max
    if (input.min > input.max) {
      throw new ScoreRangeBoundsError(input.min, input.max)
    }

    // 2. Load siblings and check for overlap
    const siblings = await ScoreRange.query().where('surveyId', surveyId)
    const siblingIntervals: (Interval & { id: number })[] = siblings.map((s) => ({
      id: s.id,
      min: s.min,
      max: s.max,
    }))

    const overlap = firstOverlap({ min: input.min, max: input.max }, siblingIntervals)
    if (overlap) {
      throw new ScoreRangeOverlapError(overlap as Interval & { id: number })
    }

    // 3. Create and return
    const range = await ScoreRange.create({
      surveyId,
      nome: input.nome,
      min: input.min,
      max: input.max,
      descricao: input.descricao ?? null,
      cor: input.cor ?? null,
    })

    return toView(range)
  }

  /**
   * Update an existing score range.
   * Merges input with existing values, then enforces min ≤ max and non-overlap.
   */
  async update(id: number, input: Partial<ScoreRangeInput>): Promise<ScoreRangeView> {
    // 1. Load existing range (404 if not found)
    const range = await ScoreRange.find(id)
    if (!range) {
      throw new ScoreRangeNotFoundError()
    }

    // 2. Merge input with existing values
    const merged = {
      nome: input.nome ?? range.nome,
      min: input.min ?? range.min,
      max: input.max ?? range.max,
      descricao: input.descricao !== undefined ? input.descricao : range.descricao,
      cor: input.cor !== undefined ? input.cor : range.cor,
    }

    // 3. Enforce min ≤ max on merged values
    if (merged.min > merged.max) {
      throw new ScoreRangeBoundsError(merged.min, merged.max)
    }

    // 4. Run firstOverlap against siblings — the id param ensures the range isn't compared against itself
    const siblings = await ScoreRange.query().where('surveyId', range.surveyId)
    const siblingIntervals: (Interval & { id: number })[] = siblings.map((s) => ({
      id: s.id,
      min: s.min,
      max: s.max,
    }))

    const overlap = firstOverlap({ id, min: merged.min, max: merged.max }, siblingIntervals)
    if (overlap) {
      throw new ScoreRangeOverlapError(overlap as Interval & { id: number })
    }

    // 5. Update and return
    range.merge({
      nome: merged.nome,
      min: merged.min,
      max: merged.max,
      descricao: merged.descricao ?? null,
      cor: merged.cor ?? null,
    })
    await range.save()

    return toView(range)
  }

  /**
   * Delete a score range by id. 404 if not found.
   */
  async delete(id: number): Promise<void> {
    const range = await ScoreRange.find(id)
    if (!range) {
      throw new ScoreRangeNotFoundError()
    }
    await range.delete()
  }
}

export default new ScoreRangeService()
