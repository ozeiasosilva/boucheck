import { describe, it } from 'node:test'
import assert from 'node:assert'
import { DateTime } from 'luxon'
import { computePerQuestionTime } from '../../app/services/compute_per_question_time.js'

/**
 * Unit tests for computePerQuestionTime
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */

describe('computePerQuestionTime', () => {
  it('returns an empty array when no events are provided (Req 6.4)', () => {
    const startedAt = DateTime.fromISO('2024-01-01T10:00:00.000Z')
    const result = computePerQuestionTime(startedAt, [])
    assert.deepStrictEqual(result, [])
  })

  it('computes the first event duration from startedAt (Req 6.3)', () => {
    const startedAt = DateTime.fromISO('2024-01-01T10:00:00.000Z')
    const events = [
      { questionId: 1, createdAt: DateTime.fromISO('2024-01-01T10:00:30.000Z') },
    ]

    const result = computePerQuestionTime(startedAt, events)

    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].questionId, 1)
    assert.strictEqual(result[0].seconds, 30)
  })

  it('computes subsequent event durations from the preceding event (Req 6.2)', () => {
    const startedAt = DateTime.fromISO('2024-01-01T10:00:00.000Z')
    const events = [
      { questionId: 1, createdAt: DateTime.fromISO('2024-01-01T10:00:30.000Z') },
      { questionId: 2, createdAt: DateTime.fromISO('2024-01-01T10:01:15.000Z') },
      { questionId: 3, createdAt: DateTime.fromISO('2024-01-01T10:02:00.000Z') },
    ]

    const result = computePerQuestionTime(startedAt, events)

    assert.strictEqual(result.length, 3)
    assert.deepStrictEqual(result[0], { questionId: 1, seconds: 30 })
    assert.deepStrictEqual(result[1], { questionId: 2, seconds: 45 })
    assert.deepStrictEqual(result[2], { questionId: 3, seconds: 45 })
  })

  it('returns one entry per event preserving question ids (Req 6.1)', () => {
    const startedAt = DateTime.fromISO('2024-01-01T10:00:00.000Z')
    const events = [
      { questionId: 10, createdAt: DateTime.fromISO('2024-01-01T10:00:10.000Z') },
      { questionId: 20, createdAt: DateTime.fromISO('2024-01-01T10:00:25.000Z') },
    ]

    const result = computePerQuestionTime(startedAt, events)

    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].questionId, 10)
    assert.strictEqual(result[1].questionId, 20)
  })

  it('zero events returns an empty array with no substitute metadata (Req 6.4)', () => {
    const startedAt = DateTime.fromISO('2024-06-15T08:30:00.000Z')
    const result = computePerQuestionTime(startedAt, [])
    assert.deepStrictEqual(result, [])
    assert.strictEqual(result.length, 0)
    assert.strictEqual(JSON.stringify(result), '[]')
  })

  it('handles fractional seconds correctly', () => {
    const startedAt = DateTime.fromISO('2024-01-01T10:00:00.000Z')
    const events = [
      { questionId: 1, createdAt: DateTime.fromISO('2024-01-01T10:00:00.500Z') },
    ]

    const result = computePerQuestionTime(startedAt, events)

    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].seconds, 0.5)
  })
})
