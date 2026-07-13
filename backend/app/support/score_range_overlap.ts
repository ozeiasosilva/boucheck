/**
 * Score-range overlap detection — pure module.
 *
 * Two closed intervals [a.min, a.max] and [b.min, b.max] overlap iff
 * a.min <= b.max AND b.min <= a.max.
 *
 * Used by ScoreRangeService to enforce non-overlapping maturity bands per survey.
 *
 * Validates: Requirements 21.4, 21.5
 */

export interface Interval {
  id?: number
  min: number
  max: number
}

/**
 * Returns true when two closed intervals overlap.
 * Two intervals [a.min, a.max] and [b.min, b.max] overlap iff
 * a.min <= b.max AND b.min <= a.max.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.min <= b.max && b.min <= a.max
}

/**
 * Returns the first sibling interval that overlaps `candidate`, or null if none do.
 * Excludes the candidate's own id from comparison (for edit scenarios where the
 * candidate is being updated and already exists in the siblings list).
 */
export function firstOverlap(candidate: Interval, siblings: Interval[]): Interval | null {
  for (const sibling of siblings) {
    // Skip the candidate itself when editing (matched by id)
    if (candidate.id != null && sibling.id === candidate.id) {
      continue
    }
    if (overlaps(candidate, sibling)) {
      return sibling
    }
  }
  return null
}
